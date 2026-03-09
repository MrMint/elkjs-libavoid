import { AvoidLib } from "libavoid-js";
import {
	createLibavoidSession,
	destroySession,
	extractRoutes,
} from "./libavoid-session";
import type { ParsedGraph, ResolvedEdge } from "./parser";
import { parseElkGraph } from "./parser";
import { buildRouteResults } from "./route-result";
import type {
	ConnectionSide,
	ElkGraph,
	ElkPoint,
	LibavoidRoutingOptions,
	RouteResult,
} from "./types";
import { writeRoutesToGraph } from "./write-back";

let initPromise: Promise<void> | null = null;

/**
 * Initialize the libavoid WASM module.
 * Must be called once before routeEdges. Subsequent calls return the same promise.
 *
 * In browser environments, you must provide a URL to the libavoid.wasm file
 * (e.g. served from your app's public directory).
 */
export async function init(wasmPath?: string): Promise<void> {
	if (!initPromise) {
		initPromise = AvoidLib.load(wasmPath).catch((err: unknown) => {
			initPromise = null;
			if (isBrowserEnvironment() && !wasmPath) {
				throw wrapBrowserWasmError(err);
			}
			throw err;
		});
	}
	return initPromise;
}

function isBrowserEnvironment(): boolean {
	return typeof globalThis !== "undefined" && "document" in globalThis;
}

function wrapBrowserWasmError(err: unknown): Error {
	const msg = err instanceof Error ? err.message : String(err);
	if (
		msg.includes("file://") ||
		msg.includes("locateFile") ||
		msg.includes("fetch")
	) {
		return new Error(
			"In browser environments, you must call init('/path/to/libavoid.wasm') " +
				"with a URL that serves the WASM file. Copy libavoid.wasm from " +
				"node_modules/libavoid-js/dist/libavoid.wasm to your public directory.",
		);
	}
	return err instanceof Error ? err : new Error(String(err));
}

/**
 * Generate a fallback self-loop route for edges where source === target.
 */
function generateSelfLoopRoute(
	nodeX: number,
	nodeY: number,
	nodeWidth: number,
	nodeHeight: number,
	bufferDistance: number,
): {
	points: ElkPoint[];
	sourceSide: ConnectionSide;
	targetSide: ConnectionSide;
} {
	const exitX = nodeX + nodeWidth;
	const exitY = nodeY + nodeHeight * 0.4;
	const enterY = nodeY + nodeHeight * 0.6;
	const loopX = exitX + bufferDistance * 3;
	const loopTopY = nodeY - bufferDistance * 2;

	return {
		points: [
			{ x: exitX, y: exitY },
			{ x: loopX, y: exitY },
			{ x: loopX, y: loopTopY },
			{ x: exitX, y: loopTopY },
			{ x: exitX, y: enterY },
		],
		sourceSide: "east",
		targetSide: "east",
	};
}

/**
 * Partition edges into self-loops vs normal, optionally filtering by edgeIds.
 */
function partitionEdges(
	edges: ResolvedEdge[],
	edgeIds?: string[],
): { normalEdges: ResolvedEdge[]; selfLoopEdges: ResolvedEdge[] } {
	const filtered = edgeIds
		? edges.filter((e) => new Set(edgeIds).has(e.id))
		: edges;

	const normalEdges: ResolvedEdge[] = [];
	const selfLoopEdges: ResolvedEdge[] = [];

	for (const edge of filtered) {
		if (edge.sourceNodeId === edge.targetNodeId) {
			selfLoopEdges.push(edge);
		} else {
			normalEdges.push(edge);
		}
	}

	return { normalEdges, selfLoopEdges };
}

/**
 * Build self-loop RouteResults for "fallback" handling mode.
 */
function buildSelfLoopResults(
	selfLoopEdges: ResolvedEdge[],
	parsed: ParsedGraph,
	bufferDistance: number,
): Map<string, RouteResult> {
	const results = new Map<string, RouteResult>();
	for (const edge of selfLoopEdges) {
		const node = parsed.nodes.get(edge.sourceNodeId);
		if (!node) continue;

		const loop = generateSelfLoopRoute(
			node.x,
			node.y,
			node.width,
			node.height,
			bufferDistance,
		);
		results.set(edge.id, {
			bendPoints: loop.points.slice(1, -1),
			sourcePoint: loop.points[0],
			sourceSide: loop.sourceSide,
			targetPoint: loop.points[loop.points.length - 1],
			targetSide: loop.targetSide,
		});
	}
	return results;
}

async function ensureInit(): Promise<void> {
	if (!initPromise) {
		await init();
	} else {
		await initPromise;
	}
}

/**
 * Route edges on an ELK JSON graph using libavoid.
 *
 * Returns a Map of edge ID → RouteResult. The input graph is NOT modified.
 * Automatically initializes the WASM module on first call if not already done.
 */
export async function routeEdges(
	graph: ElkGraph,
	options?: LibavoidRoutingOptions,
): Promise<Map<string, RouteResult>> {
	await ensureInit();

	const Avoid = AvoidLib.getInstance();
	const parsed = parseElkGraph(graph);

	if (parsed.edges.length === 0) {
		return new Map();
	}

	const { normalEdges, selfLoopEdges } = partitionEdges(
		parsed.edges,
		options?.edgeIds,
	);

	let results = new Map<string, RouteResult>();

	if (normalEdges.length > 0) {
		const session = createLibavoidSession(
			{ ...parsed, edges: normalEdges },
			Avoid,
			options,
		);
		try {
			session.router.processTransaction();
			results = buildRouteResults(extractRoutes(session));
		} finally {
			destroySession(session);
		}
	}

	if ((options?.selfLoopHandling ?? "skip") === "fallback") {
		const loopResults = buildSelfLoopResults(
			selfLoopEdges,
			parsed,
			options?.shapeBufferDistance ?? 4,
		);
		for (const [id, result] of loopResults) {
			results.set(id, result);
		}
	}

	return results;
}

/**
 * Route edges on an ELK JSON graph, mutating the graph in place.
 *
 * This is the backward-compatible API that writes routes directly
 * into the graph's edge objects.
 */
export async function routeEdgesInPlace(
	graph: ElkGraph,
	options?: LibavoidRoutingOptions,
): Promise<ElkGraph> {
	await ensureInit();

	const Avoid = AvoidLib.getInstance();
	const parsed = parseElkGraph(graph);

	if (parsed.edges.length === 0) {
		return graph;
	}

	const { normalEdges, selfLoopEdges } = partitionEdges(
		parsed.edges,
		options?.edgeIds,
	);

	if (normalEdges.length > 0) {
		const session = createLibavoidSession(
			{ ...parsed, edges: normalEdges },
			Avoid,
			options,
		);
		try {
			session.router.processTransaction();
			const rawRoutes = extractRoutes(session);
			writeRoutesToGraph(rawRoutes, parsed);
		} finally {
			destroySession(session);
		}
	}

	if ((options?.selfLoopHandling ?? "skip") === "fallback") {
		for (const edge of selfLoopEdges) {
			const node = parsed.nodes.get(edge.sourceNodeId);
			if (!node) continue;

			const loop = generateSelfLoopRoute(
				node.x,
				node.y,
				node.width,
				node.height,
				options?.shapeBufferDistance ?? 4,
			);
			writeRoutesToGraph(new Map([[edge.id, loop.points]]), {
				...parsed,
				edges: [edge],
			});
		}
	}

	return graph;
}
