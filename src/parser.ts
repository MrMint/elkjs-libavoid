import type { ElkEdge, ElkGraph, ElkNode, ElkPort } from "./types";

/** Internal representation after parsing */
export interface ParsedGraph {
	nodes: Map<string, ResolvedNode>;
	ports: Map<string, ResolvedPort>;
	edges: ResolvedEdge[];
}

export interface ResolvedNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	ports: ResolvedPort[];
	parentId: string | null;
	/** Whether this node has children (is a container/group node) */
	hasChildren: boolean;
	padding: { top: number; right: number; bottom: number; left: number };
}

export interface ResolvedPort {
	id: string;
	nodeId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	side: "NORTH" | "SOUTH" | "EAST" | "WEST";
}

export interface ResolvedEdge {
	id: string;
	sourceNodeId: string;
	sourcePortId: string | undefined;
	targetNodeId: string;
	targetPortId: string | undefined;
	/** Reference to the owning parent node ID (whose edges array contains this edge) */
	ownerNodeId: string;
	/** Reference back to the original ELK edge object for write-back */
	elkEdgeRef: ElkEdge;
}

export type PortSide = "NORTH" | "SOUTH" | "EAST" | "WEST";

/** Mapping from ELK port.side property values to internal PortSide */
const ELK_PORT_SIDE_MAP: Record<string, PortSide> = {
	EAST: "EAST",
	NORTH: "NORTH",
	SOUTH: "SOUTH",
	WEST: "WEST",
};

/**
 * Determine which side of a node a port is on.
 *
 * If the port has an explicit `port.side` property (via `properties["port.side"]`
 * or `properties["elk.port.side"]`), that value is used. Otherwise, the side is
 * inferred from the port's position relative to the node bounds.
 *
 * Tie-breaking priority when inferring: EAST > WEST > NORTH > SOUTH.
 */
function inferPortSide(
	port: ElkPort,
	nodeWidth: number,
	nodeHeight: number,
): PortSide {
	// Check for explicit ELK port.side property
	const explicitSide =
		port.properties?.["port.side"] ?? port.properties?.["elk.port.side"];
	if (typeof explicitSide === "string") {
		const mapped = ELK_PORT_SIDE_MAP[explicitSide.toUpperCase()];
		if (mapped) return mapped;
	}

	const px = port.x ?? 0;
	const py = port.y ?? 0;
	const pw = port.width ?? 0;
	const ph = port.height ?? 0;
	const centerX = px + pw / 2;
	const centerY = py + ph / 2;

	const distLeft = centerX;
	const distRight = nodeWidth - centerX;
	const distTop = centerY;
	const distBottom = nodeHeight - centerY;

	const minDist = Math.min(distLeft, distRight, distTop, distBottom);

	if (minDist === distRight) return "EAST";
	if (minDist === distLeft) return "WEST";
	if (minDist === distTop) return "NORTH";
	return "SOUTH";
}

/**
 * Resolve an edge's source/target references to node and port IDs.
 *
 * Supports both:
 * - Simple format: edge.source / edge.target (node IDs), edge.sourcePort / edge.targetPort
 * - Extended format: edge.sources / edge.targets (can be node or port IDs)
 */
function resolveEdgeEndpoint(
	refs: string[] | undefined,
	nodeId: string | undefined,
	portId: string | undefined,
	nodes: Map<string, ResolvedNode>,
	ports: Map<string, ResolvedPort>,
	edgeId: string,
	endpoint: "source" | "target",
): { nodeId: string; portId: string | undefined } {
	if (refs && refs.length > 0) {
		if (refs.length > 1) {
			throw new Error(
				`Edge "${edgeId}": multiple ${endpoint}s are not supported (got ${refs.length})`,
			);
		}
		const ref = refs[0];
		const port = ports.get(ref);
		if (port) {
			return { nodeId: port.nodeId, portId: ref };
		}
		if (nodes.has(ref)) {
			return { nodeId: ref, portId: undefined };
		}
		throw new Error(
			`Edge "${edgeId}": ${endpoint} reference "${ref}" not found as node or port`,
		);
	}

	if (nodeId) {
		if (!nodes.has(nodeId)) {
			throw new Error(
				`Edge "${edgeId}": ${endpoint} node "${nodeId}" not found`,
			);
		}
		if (portId && !ports.has(portId)) {
			throw new Error(
				`Edge "${edgeId}": ${endpoint} port "${portId}" not found`,
			);
		}
		return { nodeId, portId };
	}

	throw new Error(
		`Edge "${edgeId}": no ${endpoint} specified (need source/target or sources/targets)`,
	);
}

function validateNode(
	node: ElkNode,
	parentId: string | null,
): { width: number; height: number } {
	const { width, height } = node;
	if (parentId === null) {
		// Root node — dimensions not required (not used as obstacle)
		return { height: height ?? 0, width: width ?? 0 };
	}
	if (width === undefined || height === undefined) {
		throw new Error(
			`Node "${node.id}" is missing width or height. All nodes must have dimensions.`,
		);
	}
	if (width <= 0 || height <= 0) {
		throw new Error(
			`Node "${node.id}" has invalid dimensions (${width}x${height}). Width and height must be positive.`,
		);
	}
	if (node.x === undefined || node.y === undefined) {
		throw new Error(
			`Node "${node.id}" is missing x or y position. All non-root nodes must be positioned.`,
		);
	}
	return { height, width };
}

function resolvePorts(
	node: ElkNode,
	absX: number,
	absY: number,
	width: number,
	height: number,
	ports: Map<string, ResolvedPort>,
): ResolvedPort[] {
	const resolvedPorts: ResolvedPort[] = [];
	if (!node.ports) return resolvedPorts;

	for (const port of node.ports) {
		const portX = port.x ?? 0;
		const portY = port.y ?? 0;
		const portW = port.width ?? 0;
		const portH = port.height ?? 0;
		const side = inferPortSide(port, width, height);

		const resolved: ResolvedPort = {
			height: portH,
			id: port.id,
			nodeId: node.id,
			side,
			width: portW,
			x: absX + portX,
			y: absY + portY,
		};

		resolvedPorts.push(resolved);
		if (ports.has(port.id)) {
			throw new Error(`Duplicate port ID "${port.id}" found in graph`);
		}
		ports.set(port.id, resolved);
	}
	return resolvedPorts;
}

function resolvePadding(node: ElkNode): {
	top: number;
	right: number;
	bottom: number;
	left: number;
} {
	return {
		bottom: node.padding?.bottom ?? 0,
		left: node.padding?.left ?? 0,
		right: node.padding?.right ?? 0,
		top: node.padding?.top ?? 0,
	};
}

function resolveEdges(
	node: ElkNode,
	nodes: Map<string, ResolvedNode>,
	ports: Map<string, ResolvedPort>,
	edges: ResolvedEdge[],
	edgeIds: Set<string>,
): void {
	if (!node.edges) return;

	for (const edge of node.edges) {
		if (edgeIds.has(edge.id)) {
			throw new Error(`Duplicate edge ID "${edge.id}" found in graph`);
		}
		edgeIds.add(edge.id);
		const src = resolveEdgeEndpoint(
			edge.sources,
			edge.source,
			edge.sourcePort,
			nodes,
			ports,
			edge.id,
			"source",
		);
		const tgt = resolveEdgeEndpoint(
			edge.targets,
			edge.target,
			edge.targetPort,
			nodes,
			ports,
			edge.id,
			"target",
		);

		const srcNode = nodes.get(src.nodeId);
		if (srcNode?.parentId === null) {
			throw new Error(
				`Edge "${edge.id}": source node "${src.nodeId}" is the root node and cannot be an edge endpoint`,
			);
		}
		const tgtNode = nodes.get(tgt.nodeId);
		if (tgtNode?.parentId === null) {
			throw new Error(
				`Edge "${edge.id}": target node "${tgt.nodeId}" is the root node and cannot be an edge endpoint`,
			);
		}

		edges.push({
			elkEdgeRef: edge,
			id: edge.id,
			ownerNodeId: node.id,
			sourceNodeId: src.nodeId,
			sourcePortId: src.portId,
			targetNodeId: tgt.nodeId,
			targetPortId: tgt.portId,
		});
	}
}

/**
 * Parse an ELK JSON graph into a flat, indexed representation.
 *
 * Recursively traverses the graph hierarchy, computing absolute positions
 * for all nodes and ports.
 */
export function parseElkGraph(graph: ElkGraph): ParsedGraph {
	const nodes = new Map<string, ResolvedNode>();
	const ports = new Map<string, ResolvedPort>();
	const edges: ResolvedEdge[] = [];
	const edgeIds = new Set<string>();

	function visitNode(
		node: ElkNode,
		parentAbsX: number,
		parentAbsY: number,
		parentId: string | null,
	): void {
		const absX = parentAbsX + (node.x ?? 0);
		const absY = parentAbsY + (node.y ?? 0);
		const { width, height } = validateNode(node, parentId);

		const resolvedPorts = resolvePorts(node, absX, absY, width, height, ports);

		const padding = resolvePadding(node);

		if (nodes.has(node.id)) {
			throw new Error(`Duplicate node ID "${node.id}" found in graph`);
		}
		nodes.set(node.id, {
			hasChildren: (node.children?.length ?? 0) > 0,
			height,
			id: node.id,
			padding,
			parentId,
			ports: resolvedPorts,
			width,
			x: absX,
			y: absY,
		});

		if (node.children) {
			const childOffsetX = absX + (node.padding?.left ?? 0);
			const childOffsetY = absY + (node.padding?.top ?? 0);
			for (const child of node.children) {
				visitNode(child, childOffsetX, childOffsetY, node.id);
			}
		}

		resolveEdges(node, nodes, ports, edges, edgeIds);
	}

	visitNode(graph, 0, 0, null);

	return { edges, nodes, ports };
}
