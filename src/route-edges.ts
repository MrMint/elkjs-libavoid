import { AvoidLib } from "libavoid-js";
import {
	createLibavoidSession,
	destroySession,
	extractRoutes,
} from "./libavoid-session";
import { parseElkGraph } from "./parser";
import type { ElkGraph, LibavoidRoutingOptions } from "./types";
import { writeRoutesToGraph } from "./write-back";

let initialized = false;

/**
 * Initialize the libavoid WASM module.
 * Must be called once before routeEdges. Subsequent calls are no-ops.
 */
export async function init(wasmPath?: string): Promise<void> {
	if (!initialized) {
		await AvoidLib.load(wasmPath);
		initialized = true;
	}
}

/**
 * Route edges on an ELK JSON graph with pre-positioned nodes using libavoid.
 *
 * Nodes must have x, y, width, and height set before calling this function.
 * The graph is modified in place and also returned.
 *
 * Automatically initializes the WASM module on first call if not already done.
 */
export async function routeEdges(
	graph: ElkGraph,
	options?: LibavoidRoutingOptions,
): Promise<ElkGraph> {
	if (!initialized) {
		await init();
	}

	const Avoid = AvoidLib.getInstance();
	const parsed = parseElkGraph(graph);

	if (parsed.edges.length === 0) {
		return graph;
	}

	const session = createLibavoidSession(parsed, Avoid, options);
	try {
		session.router.processTransaction();
		const routes = extractRoutes(session);
		writeRoutesToGraph(routes, parsed);
	} finally {
		destroySession(session);
	}

	return graph;
}
