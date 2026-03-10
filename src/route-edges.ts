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
let initialWasmPath: string | undefined;

/**
 * Initialize the libavoid WASM module.
 *
 * Called automatically by {@link routeEdges}, {@link routeEdgesInPlace}, and
 * `createRoutingSession` on first use. You can call it explicitly to control
 * initialization timing or to provide a WASM URL in browser environments.
 *
 * Subsequent calls return the same promise (the `wasmPath` from the first call wins).
 * A warning is logged if a subsequent call provides a different `wasmPath`.
 *
 * In browser environments, you **must** call this with a URL to the libavoid.wasm
 * file (e.g. served from your app's public directory) before using the routing APIs.
 */
export async function init(wasmPath?: string): Promise<void> {
	if (!initPromise) {
		initialWasmPath = wasmPath;
		initPromise = AvoidLib.load(wasmPath).catch((err: unknown) => {
			initPromise = null;
			initialWasmPath = undefined;
			if (isBrowserEnvironment() && !wasmPath) {
				throw wrapBrowserWasmError(err);
			}
			throw err;
		});
	} else if (wasmPath !== undefined && wasmPath !== initialWasmPath) {
		console.warn(
			`elkjs-libavoid: init() already called with a different wasmPath ("${initialWasmPath}"). ` +
				`The new path ("${wasmPath}") will be ignored.`,
		);
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
	let filtered: ResolvedEdge[];
	if (edgeIds) {
		const idSet = new Set(edgeIds);
		filtered = edges.filter((e) => idSet.has(e.id));
	} else {
		filtered = edges;
	}

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

/**
 * Build self-loop raw point routes (for writeRoutesToGraph in the in-place path).
 */
function buildSelfLoopPointRoutes(
	selfLoopEdges: ResolvedEdge[],
	parsed: ParsedGraph,
	bufferDistance: number,
): Map<string, ElkPoint[]> {
	const routes = new Map<string, ElkPoint[]>();
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
		routes.set(edge.id, loop.points);
	}
	return routes;
}

/**
 * Shared routing pipeline: init WASM, parse graph, create session, route, extract.
 * The session creation is inside try/finally to prevent WASM leaks on partial failure.
 */
export function validateGraph(graph: unknown): asserts graph is ElkGraph {
	if (!graph || typeof graph !== "object") {
		throw new Error(
			`Invalid graph: expected an ELK JSON graph object, got ${typeof graph}`,
		);
	}
	if (!("id" in graph) || typeof (graph as ElkGraph).id !== "string") {
		throw new Error(
			'Invalid graph: missing required "id" property of type string',
		);
	}
}

async function executeRouting(
	graph: ElkGraph,
	options?: LibavoidRoutingOptions,
): Promise<{
	parsed: ParsedGraph;
	rawRoutes: Map<string, ElkPoint[]>;
	selfLoopEdges: ResolvedEdge[];
}> {
	validateGraph(graph);
	await init();

	const Avoid = AvoidLib.getInstance();
	const parsed = parseElkGraph(graph);

	if (parsed.edges.length === 0) {
		return { parsed, rawRoutes: new Map(), selfLoopEdges: [] };
	}

	const { normalEdges, selfLoopEdges } = partitionEdges(
		parsed.edges,
		options?.edgeIds,
	);

	let rawRoutes = new Map<string, ElkPoint[]>();

	if (normalEdges.length > 0) {
		const session = createLibavoidSession(
			{ ...parsed, edges: normalEdges },
			Avoid,
			options,
		);
		try {
			session.router.processTransaction();
			rawRoutes = extractRoutes(session);
		} finally {
			destroySession(session);
		}
	}

	return { parsed, rawRoutes, selfLoopEdges };
}

/**
 * Route edges on an ELK JSON graph using libavoid.
 *
 * Returns a Map of edge ID → RouteResult. The input graph is NOT modified.
 * Automatically initializes the WASM module on first call if not already done
 * (Node.js only; in browsers, call {@link init} with a WASM URL first).
 *
 * **Coordinate system:** The returned {@link RouteResult} points use
 * **absolute** coordinates. If you need coordinates relative to the edge's
 * owner node (as in ELK JSON), use {@link routeEdgesInPlace} instead.
 */
export async function routeEdges(
	graph: ElkGraph,
	options?: LibavoidRoutingOptions,
): Promise<Map<string, RouteResult>> {
	const { parsed, rawRoutes, selfLoopEdges } = await executeRouting(
		graph,
		options,
	);

	const results = buildRouteResults(rawRoutes);

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
 *
 * **Coordinate system:** Edge routes are written as coordinates **relative**
 * to the edge's owner node's content area (inside padding), matching the
 * ELK JSON convention. This differs from {@link routeEdges}, which returns
 * absolute coordinates.
 */
export async function routeEdgesInPlace(
	graph: ElkGraph,
	options?: LibavoidRoutingOptions,
): Promise<ElkGraph> {
	const { parsed, rawRoutes, selfLoopEdges } = await executeRouting(
		graph,
		options,
	);

	writeRoutesToGraph(rawRoutes, parsed);

	if ((options?.selfLoopHandling ?? "skip") === "fallback") {
		const loopRoutes = buildSelfLoopPointRoutes(
			selfLoopEdges,
			parsed,
			options?.shapeBufferDistance ?? 4,
		);
		writeRoutesToGraph(loopRoutes, parsed);
	}

	return graph;
}
