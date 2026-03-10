import { describe, expect, it } from "vitest";
import type { ParsedGraph, ResolvedEdge, ResolvedNode } from "./parser";
import type { ElkEdge, ElkPoint } from "./types";
import { writeRoutesToGraph } from "./write-back";

function makeNode(
	id: string,
	overrides: Partial<ResolvedNode> = {},
): ResolvedNode {
	return {
		hasChildren: false,
		height: 40,
		id,
		padding: { bottom: 0, left: 0, right: 0, top: 0 },
		parentId: null,
		ports: [],
		width: 80,
		x: 0,
		y: 0,
		...overrides,
	};
}

function makeEdge(
	elkEdge: ElkEdge,
	overrides: Partial<ResolvedEdge> = {},
): ResolvedEdge {
	return {
		elkEdgeRef: elkEdge,
		id: elkEdge.id,
		ownerNodeId: "root",
		sourceNodeId: "n1",
		sourcePortId: undefined,
		targetNodeId: "n2",
		targetPortId: undefined,
		...overrides,
	};
}

function makeParsed(
	edges: ResolvedEdge[],
	nodes?: Map<string, ResolvedNode>,
): ParsedGraph {
	const nodeMap = nodes ?? new Map([["root", makeNode("root")]]);
	return { edges, nodes: nodeMap, ports: new Map() };
}

describe("writeRoutesToGraph", () => {
	describe("simple format", () => {
		it("should write sourcePoint, targetPoint, and bendPoints for routes with >2 points", () => {
			const elkEdge: ElkEdge = { id: "e1", source: "n1", target: "n2" };
			const edge = makeEdge(elkEdge);
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 10, y: 20 },
						{ x: 50, y: 20 },
						{ x: 50, y: 60 },
						{ x: 90, y: 60 },
					],
				],
			]);

			writeRoutesToGraph(routes, parsed);

			expect(elkEdge.sourcePoint).toEqual({ x: 10, y: 20 });
			expect(elkEdge.targetPoint).toEqual({ x: 90, y: 60 });
			expect(elkEdge.bendPoints).toEqual([
				{ x: 50, y: 20 },
				{ x: 50, y: 60 },
			]);
		});

		it("should clear stale bendPoints for 2-point (straight-line) routes", () => {
			const elkEdge: ElkEdge = {
				bendPoints: [{ x: 999, y: 999 }],
				id: "e1",
				source: "n1",
				target: "n2",
			};
			const edge = makeEdge(elkEdge);
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 10, y: 20 },
						{ x: 90, y: 60 },
					],
				],
			]);

			writeRoutesToGraph(routes, parsed);

			expect(elkEdge.sourcePoint).toEqual({ x: 10, y: 20 });
			expect(elkEdge.targetPoint).toEqual({ x: 90, y: 60 });
			expect(elkEdge.bendPoints).toBeUndefined();
		});

		it("should clean up sections field when writing simple format", () => {
			const elkEdge: ElkEdge = {
				id: "e1",
				sections: [
					{
						endPoint: { x: 0, y: 0 },
						id: "old_s0",
						startPoint: { x: 0, y: 0 },
					},
				],
				source: "n1",
				target: "n2",
			};
			const edge = makeEdge(elkEdge);
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 10, y: 20 },
						{ x: 90, y: 60 },
					],
				],
			]);

			writeRoutesToGraph(routes, parsed);

			expect(elkEdge.sections).toBeUndefined();
			expect(elkEdge.sourcePoint).toBeDefined();
		});
	});

	describe("extended format", () => {
		it("should write sections for extended format edges", () => {
			const elkEdge: ElkEdge = {
				id: "e1",
				sources: ["n1"],
				targets: ["n2"],
			};
			const edge = makeEdge(elkEdge);
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 10, y: 20 },
						{ x: 50, y: 20 },
						{ x: 90, y: 60 },
					],
				],
			]);

			writeRoutesToGraph(routes, parsed);

			expect(elkEdge.sections).toHaveLength(1);
			expect(elkEdge.sections?.[0]?.id).toBe("e1_s0");
			expect(elkEdge.sections?.[0]?.startPoint).toEqual({ x: 10, y: 20 });
			expect(elkEdge.sections?.[0]?.endPoint).toEqual({ x: 90, y: 60 });
			expect(elkEdge.sections?.[0]?.bendPoints).toEqual([{ x: 50, y: 20 }]);
			// Simple format fields should be cleaned up
			expect(elkEdge.sourcePoint).toBeUndefined();
			expect(elkEdge.targetPoint).toBeUndefined();
			expect(elkEdge.bendPoints).toBeUndefined();
		});

		it("should omit bendPoints in section for 2-point routes", () => {
			const elkEdge: ElkEdge = {
				id: "e1",
				sources: ["n1"],
				targets: ["n2"],
			};
			const edge = makeEdge(elkEdge);
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 10, y: 20 },
						{ x: 90, y: 60 },
					],
				],
			]);

			writeRoutesToGraph(routes, parsed);

			expect(elkEdge.sections?.[0]?.bendPoints).toBeUndefined();
		});
	});

	describe("coordinate transformation", () => {
		it("should convert absolute coords to relative using owner's position and padding", () => {
			const elkEdge: ElkEdge = { id: "e1", source: "child1", target: "child2" };
			const edge = makeEdge(elkEdge, { ownerNodeId: "parent" });
			const nodes = new Map<string, ResolvedNode>([
				[
					"parent",
					makeNode("parent", {
						padding: { bottom: 10, left: 20, right: 20, top: 30 },
						x: 50,
						y: 50,
					}),
				],
			]);
			const parsed = makeParsed([edge], nodes);

			const routes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 100, y: 120 },
						{ x: 200, y: 220 },
					],
				],
			]);

			writeRoutesToGraph(routes, parsed);

			// offsetX = 50 + 20 = 70, offsetY = 50 + 30 = 80
			expect(elkEdge.sourcePoint).toEqual({ x: 30, y: 40 });
			expect(elkEdge.targetPoint).toEqual({ x: 130, y: 140 });
		});

		it("should throw when owner node is not found", () => {
			const elkEdge: ElkEdge = { id: "e1", source: "n1", target: "n2" };
			const edge = makeEdge(elkEdge, { ownerNodeId: "nonexistent" });
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 10, y: 20 },
						{ x: 90, y: 60 },
					],
				],
			]);

			expect(() => writeRoutesToGraph(routes, parsed)).toThrow(
				'Owner node "nonexistent" not found',
			);
		});
	});

	describe("edge skipping", () => {
		it("should skip edges not in the routes map", () => {
			const elkEdge: ElkEdge = { id: "e1", source: "n1", target: "n2" };
			const edge = makeEdge(elkEdge);
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>();

			writeRoutesToGraph(routes, parsed);

			expect(elkEdge.sourcePoint).toBeUndefined();
		});

		it("should skip edges with fewer than 2 points", () => {
			const elkEdge: ElkEdge = { id: "e1", source: "n1", target: "n2" };
			const edge = makeEdge(elkEdge);
			const parsed = makeParsed([edge]);

			const routes = new Map<string, ElkPoint[]>([["e1", [{ x: 10, y: 20 }]]]);

			writeRoutesToGraph(routes, parsed);

			expect(elkEdge.sourcePoint).toBeUndefined();
		});
	});
});
