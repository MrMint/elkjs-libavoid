import type { Avoid } from "libavoid-js";
import { AvoidLib } from "libavoid-js";
import type { LibavoidSession } from "./libavoid-session";
import {
	createLibavoidSession,
	destroySession,
	extractRoutes,
} from "./libavoid-session";
import { parseElkGraph } from "./parser";
import { init } from "./route-edges";
import { buildRouteResults } from "./route-result";
import type { ElkGraph, LibavoidRouterOptions, RouteResult } from "./types";

/** Center pin class ID (must match libavoid-session.ts) */
const CENTER_PIN_CLASS_ID = 1;
/** ConnDir flag: all directions (must match libavoid-session.ts) */
const CONN_DIR_ALL = 15;

/**
 * A long-lived routing session that supports incremental updates.
 *
 * libavoid natively supports moving shapes and re-routing only affected connectors.
 * This avoids the overhead of creating/destroying the full WASM state on every frame.
 */
export class RoutingSession {
	private session: LibavoidSession;
	private avoid: Avoid;
	private destroyed = false;
	private portPinClassIds: Map<string, number>;

	/** @internal Use createRoutingSession() instead. */
	constructor(
		session: LibavoidSession,
		avoid: Avoid,
		portPinClassIds: Map<string, number>,
	) {
		this.session = session;
		this.avoid = avoid;
		this.portPinClassIds = portPinClassIds;
	}

	/**
	 * Move a node to a new position. The shape obstacle is updated in the router.
	 * Call processTransaction() after all moves to re-route affected edges.
	 */
	moveNode(nodeId: string, position: { x: number; y: number }): void {
		this.assertNotDestroyed();
		const shapeEntry = this.session.shapes.get(nodeId);
		if (!shapeEntry) {
			throw new Error(
				`Node "${nodeId}" not found in session. Only non-root nodes can be moved.`,
			);
		}

		const node = shapeEntry.node;
		const dx = position.x - node.x;
		const dy = position.y - node.y;

		this.session.router.moveShape_delta(shapeEntry.shapeRef, dx, dy);

		// Update internal tracking
		node.x = position.x;
		node.y = position.y;

		// Update port positions
		for (const port of node.ports) {
			port.x += dx;
			port.y += dy;
		}
	}

	/**
	 * Add a new edge connector to the session.
	 * The source and target nodes must already exist in the session.
	 */
	addEdge(edge: {
		id: string;
		source: string;
		target: string;
		sourcePort?: string;
		targetPort?: string;
	}): void {
		this.assertNotDestroyed();
		if (this.session.connectors.has(edge.id)) {
			throw new Error(`Edge "${edge.id}" already exists in session.`);
		}

		const srcShape = this.session.shapes.get(edge.source);
		const tgtShape = this.session.shapes.get(edge.target);
		if (!srcShape) {
			throw new Error(
				`Edge "${edge.id}": source node "${edge.source}" not found in session.`,
			);
		}
		if (!tgtShape) {
			throw new Error(
				`Edge "${edge.id}": target node "${edge.target}" not found in session.`,
			);
		}

		const srcPinClass = edge.sourcePort
			? (this.portPinClassIds.get(edge.sourcePort) ?? CENTER_PIN_CLASS_ID)
			: CENTER_PIN_CLASS_ID;
		const tgtPinClass = edge.targetPort
			? (this.portPinClassIds.get(edge.targetPort) ?? CENTER_PIN_CLASS_ID)
			: CENTER_PIN_CLASS_ID;

		const srcEnd = new this.avoid.ConnEnd(srcShape.shapeRef, srcPinClass);
		const tgtEnd = new this.avoid.ConnEnd(tgtShape.shapeRef, tgtPinClass);
		const connRef = new this.avoid.ConnRef(this.session.router, srcEnd, tgtEnd);

		this.session.connectors.set(edge.id, {
			connRef,
			edge: { id: edge.id },
		});
	}

	/**
	 * Remove an edge from the session.
	 */
	removeEdge(edgeId: string): void {
		this.assertNotDestroyed();
		const entry = this.session.connectors.get(edgeId);
		if (!entry) {
			throw new Error(`Edge "${edgeId}" not found in session.`);
		}

		this.session.router.deleteConnector(entry.connRef);
		this.session.connectors.delete(edgeId);
	}

	/**
	 * Process pending changes and return updated routes.
	 * Only edges affected by shape moves or additions are re-routed.
	 */
	processTransaction(): Map<string, RouteResult> {
		this.assertNotDestroyed();
		this.session.router.processTransaction();
		const rawRoutes = extractRoutes(this.session);
		return buildRouteResults(rawRoutes);
	}

	/**
	 * Destroy the session and free WASM memory.
	 * The session cannot be used after this call.
	 */
	destroy(): void {
		if (!this.destroyed) {
			destroySession(this.session);
			this.destroyed = true;
		}
	}

	private assertNotDestroyed(): void {
		if (this.destroyed) {
			throw new Error("RoutingSession has been destroyed.");
		}
	}
}

/**
 * Create a long-lived routing session for incremental updates.
 *
 * Use this instead of routeEdges() when you need to update node positions
 * frequently (e.g., during drag operations) without re-creating the
 * entire router on every frame.
 *
 * @example
 * ```ts
 * const session = await createRoutingSession(graph, options);
 *
 * // On node drag:
 * session.moveNode("n1", { x: newX, y: newY });
 * const routes = session.processTransaction();
 *
 * // Cleanup:
 * session.destroy();
 * ```
 */
export async function createRoutingSession(
	graph: ElkGraph,
	options?: LibavoidRouterOptions,
): Promise<RoutingSession> {
	await init();

	const Avoid = AvoidLib.getInstance();
	const parsed = parseElkGraph(graph);

	// Filter self-loops — they can't be routed by libavoid
	const normalEdges = parsed.edges.filter(
		(e) => e.sourceNodeId !== e.targetNodeId,
	);
	const sessionParsed = { ...parsed, edges: normalEdges };

	const session = createLibavoidSession(sessionParsed, Avoid, options);

	// Register center pins for ALL non-root nodes so addEdge() can connect to any node.
	// createLibavoidSession only registers center pins for nodes referenced by existing edges.
	const nodesWithCenterPin = new Set<string>();
	for (const edge of normalEdges) {
		if (!edge.sourcePortId) nodesWithCenterPin.add(edge.sourceNodeId);
		if (!edge.targetPortId) nodesWithCenterPin.add(edge.targetNodeId);
	}
	for (const [nodeId, shapeEntry] of session.shapes) {
		if (!nodesWithCenterPin.has(nodeId)) {
			const pin = new Avoid.ShapeConnectionPin(
				shapeEntry.shapeRef,
				CENTER_PIN_CLASS_ID,
				0.5,
				0.5,
				true,
				0,
				CONN_DIR_ALL,
			);
			pin.setExclusive(false);
		}
	}

	// Extract portPinClassIds by re-computing (they are internal to createLibavoidSession)
	// We need these for addEdge() support
	const portPinClassIds = new Map<string, number>();
	const pinClassCounters = new Map<string, number>();
	for (const [_, node] of parsed.nodes) {
		if (node.parentId === null) continue;
		for (const port of node.ports) {
			const current = pinClassCounters.get(node.id) ?? 2;
			pinClassCounters.set(node.id, current + 1);
			portPinClassIds.set(port.id, current);
		}
	}

	// Run initial transaction
	session.router.processTransaction();

	return new RoutingSession(session, Avoid, portPinClassIds);
}
