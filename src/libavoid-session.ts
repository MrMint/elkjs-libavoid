import type { Avoid } from "libavoid-js";
import type { ParsedGraph, ResolvedNode, ResolvedPort } from "./parser";
import type { ElkPoint, LibavoidRoutingOptions } from "./types";

/** Extract WASM types from the Avoid interface (not directly exported by libavoid-js) */
type WasmRouter = Avoid["Router"];
type WasmShapeRef = Avoid["ShapeRef"];
type WasmConnRef = Avoid["ConnRef"];
type WasmRoutingParam =
	Avoid["RoutingParameter"][keyof Avoid["RoutingParameter"]];
type WasmRoutingOpt = Avoid["RoutingOption"][keyof Avoid["RoutingOption"]];

/** ConnDir flag bitmasks (libavoid C++ enum values) */
const ConnDirUp = 1;
const ConnDirDown = 2;
const ConnDirLeft = 4;
const ConnDirRight = 8;
const ConnDirAll = 15;

/** Pin class ID reserved for auto-generated center pins (must be > 0) */
const CENTER_PIN_CLASS_ID = 1;

interface ShapeEntry {
	node: ResolvedNode;
	shapeRef: WasmShapeRef;
}

interface ConnectorEntry {
	connRef: WasmConnRef;
	edge: { id: string };
}

export interface LibavoidSession {
	avoid: Avoid;
	connectors: Map<string, ConnectorEntry>;
	router: WasmRouter;
	shapes: Map<string, ShapeEntry>;
}

function portSideToConnDir(side: string): number {
	switch (side) {
		case "NORTH":
			return ConnDirUp;
		case "SOUTH":
			return ConnDirDown;
		case "EAST":
			return ConnDirRight;
		case "WEST":
			return ConnDirLeft;
		default:
			return ConnDirAll;
	}
}

function applyRoutingParameters(
	router: WasmRouter,
	Avoid: Avoid,
	options: LibavoidRoutingOptions,
): void {
	const RP = Avoid.RoutingParameter;
	const paramMap: [keyof LibavoidRoutingOptions, WasmRoutingParam][] = [
		["segmentPenalty", RP.segmentPenalty],
		["anglePenalty", RP.anglePenalty],
		["crossingPenalty", RP.crossingPenalty],
		["clusterCrossingPenalty", RP.clusterCrossingPenalty],
		["fixedSharedPathPenalty", RP.fixedSharedPathPenalty],
		["portDirectionPenalty", RP.portDirectionPenalty],
		["shapeBufferDistance", RP.shapeBufferDistance],
		["idealNudgingDistance", RP.idealNudgingDistance],
		["reverseDirectionPenalty", RP.reverseDirectionPenalty],
	];

	for (const [key, param] of paramMap) {
		const val = options[key];
		if (typeof val === "number") {
			router.setRoutingParameter(param, val);
		}
	}

	const RO = Avoid.RoutingOption;
	const optionMap: [keyof LibavoidRoutingOptions, WasmRoutingOpt][] = [
		[
			"nudgeOrthogonalSegmentsConnectedToShapes",
			RO.nudgeOrthogonalSegmentsConnectedToShapes,
		],
		[
			"nudgeOrthogonalTouchingColinearSegments",
			RO.nudgeOrthogonalTouchingColinearSegments,
		],
		[
			"performUnifyingNudgingPreprocessingStep",
			RO.performUnifyingNudgingPreprocessingStep,
		],
		[
			"nudgeSharedPathsWithCommonEndPoint",
			RO.nudgeSharedPathsWithCommonEndPoint,
		],
	];

	for (const [key, opt] of optionMap) {
		const val = options[key];
		if (typeof val === "boolean") {
			router.setRoutingOption(opt, val);
		}
	}
}

function registerNodeShapes(
	parsed: ParsedGraph,
	Avoid: Avoid,
	router: WasmRouter,
	nodesNeedingCenterPin: Set<string>,
): {
	portPinClassIds: Map<string, number>;
	shapes: Map<string, ShapeEntry>;
} {
	const shapes = new Map<string, ShapeEntry>();
	const pinClassCounters = new Map<string, number>();
	const portPinClassIds = new Map<string, number>();

	for (const [nodeId, node] of parsed.nodes) {
		if (node.parentId === null) continue;

		const topLeft = new Avoid.Point(node.x, node.y);
		const bottomRight = new Avoid.Point(
			node.x + node.width,
			node.y + node.height,
		);
		const rect = new Avoid.Rectangle(topLeft, bottomRight);
		const shapeRef = new Avoid.ShapeRef(router, rect);

		shapes.set(nodeId, { node, shapeRef });

		if (nodesNeedingCenterPin.has(nodeId)) {
			const pin = new Avoid.ShapeConnectionPin(
				shapeRef,
				CENTER_PIN_CLASS_ID,
				0.5,
				0.5,
				true,
				0,
				ConnDirAll,
			);
			pin.setExclusive(false);
		}

		registerPortPins(
			node.ports,
			node,
			shapeRef,
			Avoid,
			pinClassCounters,
			portPinClassIds,
		);
	}

	return { portPinClassIds, shapes };
}

function registerPortPins(
	ports: ResolvedPort[],
	node: ResolvedNode,
	shapeRef: WasmShapeRef,
	Avoid: Avoid,
	pinClassCounters: Map<string, number>,
	portPinClassIds: Map<string, number>,
): void {
	for (const port of ports) {
		const current = pinClassCounters.get(node.id) ?? 2;
		pinClassCounters.set(node.id, current + 1);
		portPinClassIds.set(port.id, current);

		const proportionX = Math.max(
			0,
			Math.min(1, (port.x + port.width / 2 - node.x) / node.width),
		);
		const proportionY = Math.max(
			0,
			Math.min(1, (port.y + port.height / 2 - node.y) / node.height),
		);
		const visDirs = portSideToConnDir(port.side);

		const pin = new Avoid.ShapeConnectionPin(
			shapeRef,
			current,
			proportionX,
			proportionY,
			true,
			0,
			visDirs,
		);
		pin.setExclusive(false);
	}
}

function registerEdgeConnectors(
	parsed: ParsedGraph,
	Avoid: Avoid,
	router: WasmRouter,
	shapes: Map<string, ShapeEntry>,
	portPinClassIds: Map<string, number>,
): Map<string, ConnectorEntry> {
	const connectors = new Map<string, ConnectorEntry>();

	for (const edge of parsed.edges) {
		const srcShape = shapes.get(edge.sourceNodeId);
		const tgtShape = shapes.get(edge.targetNodeId);

		if (!srcShape) {
			throw new Error(
				`Edge "${edge.id}": source node "${edge.sourceNodeId}" has no corresponding shape`,
			);
		}
		if (!tgtShape) {
			throw new Error(
				`Edge "${edge.id}": target node "${edge.targetNodeId}" has no corresponding shape`,
			);
		}

		const srcPinClass = edge.sourcePortId
			? portPinClassIds.get(edge.sourcePortId)
			: CENTER_PIN_CLASS_ID;
		const tgtPinClass = edge.targetPortId
			? portPinClassIds.get(edge.targetPortId)
			: CENTER_PIN_CLASS_ID;

		if (srcPinClass === undefined) {
			throw new Error(
				`Edge "${edge.id}": source port "${edge.sourcePortId}" has no pin class`,
			);
		}
		if (tgtPinClass === undefined) {
			throw new Error(
				`Edge "${edge.id}": target port "${edge.targetPortId}" has no pin class`,
			);
		}

		const srcEnd = new Avoid.ConnEnd(srcShape.shapeRef, srcPinClass);
		const tgtEnd = new Avoid.ConnEnd(tgtShape.shapeRef, tgtPinClass);
		const connRef = new Avoid.ConnRef(router, srcEnd, tgtEnd);

		connectors.set(edge.id, { connRef, edge });
	}

	return connectors;
}

/**
 * Create a libavoid routing session from a parsed graph.
 *
 * Registers all nodes as obstacles (ShapeRef), ports as connection pins
 * (ShapeConnectionPin), and edges as connectors (ConnRef).
 */
export function createLibavoidSession(
	parsed: ParsedGraph,
	Avoid: Avoid,
	options: LibavoidRoutingOptions = {},
): LibavoidSession {
	const routingType = options.routingType ?? "orthogonal";
	const routerFlag =
		routingType === "polyline"
			? Avoid.RouterFlag.PolyLineRouting.value
			: Avoid.RouterFlag.OrthogonalRouting.value;

	const router = new Avoid.Router(routerFlag);
	applyRoutingParameters(router, Avoid, options);

	const nodesNeedingCenterPin = new Set<string>();
	for (const edge of parsed.edges) {
		if (!edge.sourcePortId) nodesNeedingCenterPin.add(edge.sourceNodeId);
		if (!edge.targetPortId) nodesNeedingCenterPin.add(edge.targetNodeId);
	}

	const { shapes, portPinClassIds } = registerNodeShapes(
		parsed,
		Avoid,
		router,
		nodesNeedingCenterPin,
	);

	const connectors = registerEdgeConnectors(
		parsed,
		Avoid,
		router,
		shapes,
		portPinClassIds,
	);

	return { avoid: Avoid, connectors, router, shapes };
}

/**
 * Extract computed routes from a processed libavoid session.
 * Returns absolute-coordinate point arrays keyed by edge ID.
 */
export function extractRoutes(
	session: LibavoidSession,
): Map<string, ElkPoint[]> {
	const routes = new Map<string, ElkPoint[]>();

	for (const [edgeId, { connRef }] of session.connectors) {
		const displayRoute = connRef.displayRoute();
		const points: ElkPoint[] = [];

		for (let i = 0; i < displayRoute.size(); i++) {
			const point = displayRoute.at(i);
			points.push({ x: point.x, y: point.y });
		}

		routes.set(edgeId, points);
	}

	return routes;
}

/**
 * Destroy a libavoid session, cleaning up WASM memory.
 * The router destructor handles cleanup of all associated shapes/connectors.
 */
export function destroySession(session: LibavoidSession): void {
	session.router.delete();
	session.shapes.clear();
	session.connectors.clear();
}
