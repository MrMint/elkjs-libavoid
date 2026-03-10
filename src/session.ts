import type { Avoid } from "libavoid-js";
import { AvoidLib } from "libavoid-js";
import type { LibavoidSession } from "./libavoid-session";
import {
	AUTO_PIN_CLASS_ID,
	createLibavoidSession,
	destroySession,
	extractRoutes,
	freeWasm,
	registerAutoPins,
} from "./libavoid-session";
import { parseElkGraph } from "./parser";
import { init, validateGraph } from "./route-edges";
import { buildRouteResults } from "./route-result";
import type { ElkGraph, LibavoidRouterOptions, RouteResult } from "./types";

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

	/** @internal Use createRoutingSession() instead. */
	constructor(session: LibavoidSession, avoid: Avoid) {
		this.session = session;
		this.avoid = avoid;
	}

	/**
	 * Move a node to a new position. The shape obstacle is updated in the router.
	 * Call processTransaction() after all moves to re-route affected edges.
	 *
	 * Moving a container node also moves all descendant shapes by the same delta.
	 */
	moveNode(nodeId: string, position: { x: number; y: number }): void {
		this.assertNotDestroyed();
		const node = this.session.nodes.get(nodeId);
		if (!node) {
			throw new Error(`Node "${nodeId}" not found in session.`);
		}
		const shapeEntry = this.session.shapes.get(nodeId);
		if (!shapeEntry && !node.hasChildren) {
			throw new Error(
				`Node "${nodeId}" not found in session. Only leaf (non-root, non-container) nodes can be moved.`,
			);
		}

		const dx = position.x - node.x;
		const dy = position.y - node.y;
		if (dx === 0 && dy === 0) return;

		this.moveShapeAndTrack(nodeId, node, dx, dy);

		// Move all descendant shapes by the same delta
		if (node.hasChildren) {
			for (const [childId, childNode] of this.session.nodes) {
				if (this.isDescendantOf(childId, nodeId)) {
					this.moveShapeAndTrack(childId, childNode, dx, dy);
				}
			}
		}
	}

	private moveShapeAndTrack(
		nodeId: string,
		node: { x: number; y: number; ports: { x: number; y: number }[] },
		dx: number,
		dy: number,
	): void {
		const shapeEntry = this.session.shapes.get(nodeId);
		if (shapeEntry) {
			this.session.router.moveShape_delta(shapeEntry.shapeRef, dx, dy);
		}
		node.x += dx;
		node.y += dy;
		for (const port of node.ports) {
			port.x += dx;
			port.y += dy;
		}
	}

	private isDescendantOf(nodeId: string, ancestorId: string): boolean {
		let current = this.session.nodes.get(nodeId);
		while (current) {
			if (current.parentId === ancestorId) return true;
			if (current.parentId === null) return false;
			current = this.session.nodes.get(current.parentId);
		}
		return false;
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
		if (edge.source === edge.target) {
			throw new Error(
				`Edge "${edge.id}": self-loop edges (source === target) are not supported by libavoid.`,
			);
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
			? this.session.portPinClassIds.get(edge.sourcePort)
			: AUTO_PIN_CLASS_ID;
		const tgtPinClass = edge.targetPort
			? this.session.portPinClassIds.get(edge.targetPort)
			: AUTO_PIN_CLASS_ID;

		if (srcPinClass === undefined) {
			throw new Error(
				`Edge "${edge.id}": source port "${edge.sourcePort}" has no pin class`,
			);
		}
		if (tgtPinClass === undefined) {
			throw new Error(
				`Edge "${edge.id}": target port "${edge.targetPort}" has no pin class`,
			);
		}

		const srcEnd = new this.avoid.ConnEnd(srcShape.shapeRef, srcPinClass);
		const tgtEnd = new this.avoid.ConnEnd(tgtShape.shapeRef, tgtPinClass);
		const connRef = new this.avoid.ConnRef(this.session.router, srcEnd, tgtEnd);
		freeWasm(srcEnd);
		freeWasm(tgtEnd);

		this.session.edgeEndpointNodes.add(edge.source);
		this.session.edgeEndpointNodes.add(edge.target);
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
	 *
	 * **Coordinate system:** The returned {@link RouteResult} points use
	 * **absolute** coordinates (matching the coordinate space used during
	 * session creation). To convert to ELK-relative coordinates, subtract
	 * the owner node's content area origin.
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

	/**
	 * Support for the TC39 Explicit Resource Management proposal.
	 * Allows usage with `using session = await createRoutingSession(graph)`.
	 */
	[Symbol.dispose](): void {
		this.destroy();
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
	validateGraph(graph);
	await init();

	const Avoid = AvoidLib.getInstance();
	const parsed = parseElkGraph(graph);

	// Filter self-loops — they can't be routed by libavoid
	const normalEdges = parsed.edges.filter(
		(e) => e.sourceNodeId !== e.targetNodeId,
	);
	const sessionParsed = { ...parsed, edges: normalEdges };

	const session = createLibavoidSession(sessionParsed, Avoid, options);

	// Register auto pins for ALL nodes so addEdge() can connect to any node.
	// createLibavoidSession only registers auto pins for nodes referenced by existing edges.
	const nodesWithAutoPin = new Set<string>();
	for (const edge of normalEdges) {
		if (!edge.sourcePortId) nodesWithAutoPin.add(edge.sourceNodeId);
		if (!edge.targetPortId) nodesWithAutoPin.add(edge.targetNodeId);
	}
	for (const [nodeId, shapeEntry] of session.shapes) {
		if (!nodesWithAutoPin.has(nodeId)) {
			registerAutoPins(shapeEntry.shapeRef, Avoid);
		}
	}

	// Run initial transaction
	session.router.processTransaction();

	return new RoutingSession(session, Avoid);
}
