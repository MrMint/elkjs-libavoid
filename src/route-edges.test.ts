import { beforeAll, describe, expect, it } from "vitest";
import type { ElkGraph } from ".";
import { init, routeEdges } from ".";

beforeAll(async () => {
	await init();
});

describe("routeEdges", () => {
	it("should be exported as a function", () => {
		expect(routeEdges).toBeDefined();
		expect(typeof routeEdges).toBe("function");
	});

	it("should return the graph unchanged when there are no edges", async () => {
		const graph: ElkGraph = {
			children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);
		expect(result).toBe(graph);
	});
});

describe("basic routing", () => {
	it("should route a simple 2-node 1-edge graph", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);
		const edge = result.edges?.[0];

		// Simple format: sourcePoint/targetPoint should be set
		expect(edge?.sourcePoint).toBeDefined();
		expect(edge?.targetPoint).toBeDefined();
		expect(edge?.sourcePoint?.x).toBeTypeOf("number");
		expect(edge?.sourcePoint?.y).toBeTypeOf("number");
		expect(edge?.targetPoint?.x).toBeTypeOf("number");
		expect(edge?.targetPoint?.y).toBeTypeOf("number");
	});

	it("should route around an obstacle", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
				// Obstacle between n1 and n2
				{ height: 40, id: "obstacle", width: 60, x: 100, y: 0 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);
		const edge = result.edges?.[0];

		expect(edge?.sourcePoint).toBeDefined();
		expect(edge?.targetPoint).toBeDefined();
		// Should have bend points since it must route around the obstacle
		expect(edge?.bendPoints).toBeDefined();
		expect(edge?.bendPoints?.length).toBeGreaterThan(0);
	});

	it("should route 3 nodes with 2 edges", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
				{ height: 40, id: "n3", width: 80, x: 100, y: 100 },
			],
			edges: [
				{ id: "e1", source: "n1", target: "n3" },
				{ id: "e2", source: "n2", target: "n3" },
			],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);

		for (const edge of result.edges ?? []) {
			expect(edge.sourcePoint).toBeDefined();
			expect(edge.targetPoint).toBeDefined();
		}
	});
});

describe("extended edge format", () => {
	it("should write sections for sources/targets format edges", async () => {
		const graph: ElkGraph = {
			children: [
				{
					height: 40,
					id: "n1",
					ports: [{ height: 10, id: "n1_p1", width: 5, x: 80, y: 15 }],
					width: 80,
					x: 0,
					y: 0,
				},
				{
					height: 40,
					id: "n2",
					ports: [{ height: 10, id: "n2_p1", width: 5, x: -5, y: 15 }],
					width: 80,
					x: 200,
					y: 100,
				},
			],
			edges: [{ id: "e1", sources: ["n1_p1"], targets: ["n2_p1"] }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);
		const edge = result.edges?.[0];

		// Extended format: should have sections
		expect(edge?.sections).toBeDefined();
		expect(edge?.sections).toHaveLength(1);

		const section = edge?.sections?.[0];
		expect(section?.id).toBe("e1_s0");
		expect(section?.startPoint).toBeDefined();
		expect(section?.endPoint).toBeDefined();
	});
});

describe("port support", () => {
	it("should route between directional ports", async () => {
		const graph: ElkGraph = {
			children: [
				{
					height: 40,
					id: "n1",
					ports: [
						// East-side port
						{ height: 10, id: "p_east", width: 5, x: 80, y: 15 },
					],
					width: 80,
					x: 0,
					y: 0,
				},
				{
					height: 40,
					id: "n2",
					ports: [
						// West-side port
						{ height: 10, id: "p_west", width: 5, x: -5, y: 15 },
					],
					width: 80,
					x: 200,
					y: 0,
				},
			],
			edges: [
				{
					id: "e1",
					source: "n1",
					sourcePort: "p_east",
					target: "n2",
					targetPort: "p_west",
				},
			],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);
		const edge = result.edges?.[0];

		expect(edge?.sourcePoint).toBeDefined();
		expect(edge?.targetPoint).toBeDefined();

		// Source point should be near the east side of n1
		expect(edge?.sourcePoint?.x).toBeGreaterThanOrEqual(70);
		// Target point should be near the west side of n2
		expect(edge?.targetPoint?.x).toBeLessThanOrEqual(210);
	});

	it("should route with multiple ports per node", async () => {
		const graph: ElkGraph = {
			children: [
				{
					height: 60,
					id: "n1",
					ports: [
						{ height: 10, id: "p1a", width: 5, x: 80, y: 10 },
						{ height: 10, id: "p1b", width: 5, x: 80, y: 40 },
					],
					width: 80,
					x: 0,
					y: 0,
				},
				{
					height: 40,
					id: "n2",
					ports: [{ height: 10, id: "p2", width: 5, x: -5, y: 15 }],
					width: 80,
					x: 200,
					y: 0,
				},
				{
					height: 40,
					id: "n3",
					ports: [{ height: 10, id: "p3", width: 5, x: -5, y: 15 }],
					width: 80,
					x: 200,
					y: 80,
				},
			],
			edges: [
				{
					id: "e1",
					source: "n1",
					sourcePort: "p1a",
					target: "n2",
					targetPort: "p2",
				},
				{
					id: "e2",
					source: "n1",
					sourcePort: "p1b",
					target: "n3",
					targetPort: "p3",
				},
			],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);

		for (const edge of result.edges ?? []) {
			expect(edge.sourcePoint).toBeDefined();
			expect(edge.targetPoint).toBeDefined();
		}
	});
});

describe("routing options", () => {
	it("should accept orthogonal routing type", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph, { routingType: "orthogonal" });
		expect(result.edges?.[0]?.sourcePoint).toBeDefined();
	});

	it("should accept polyline routing type", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph, { routingType: "polyline" });
		expect(result.edges?.[0]?.sourcePoint).toBeDefined();
	});

	it("should accept custom penalty and distance options", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph, {
			crossingPenalty: 200,
			idealNudgingDistance: 8,
			segmentPenalty: 50,
			shapeBufferDistance: 12,
		});
		expect(result.edges?.[0]?.sourcePoint).toBeDefined();
	});
});

describe("hierarchical graphs", () => {
	it("should route edges inside a compound node", async () => {
		const graph: ElkGraph = {
			children: [
				{
					children: [
						{ height: 30, id: "child1", width: 60, x: 0, y: 0 },
						{ height: 30, id: "child2", width: 60, x: 150, y: 100 },
					],
					edges: [{ id: "e1", source: "child1", target: "child2" }],
					height: 200,
					id: "parent",
					padding: { bottom: 10, left: 20, right: 20, top: 30 },
					width: 300,
					x: 50,
					y: 50,
				},
			],
			height: 400,
			id: "root",
			width: 500,
		};

		const result = await routeEdges(graph);
		const parent = result.children?.[0];
		const edge = parent?.edges?.[0];

		expect(edge?.sourcePoint).toBeDefined();
		expect(edge?.targetPoint).toBeDefined();
	});

	it("should produce edge coordinates relative to the content area (inside padding)", async () => {
		// parent at (50,50) with padding left=50, top=50
		// child1 at content-relative (0,0) → absolute (100,100)
		// child2 at content-relative (200,0) → absolute (250,100)
		const graph: ElkGraph = {
			children: [
				{
					children: [
						{ height: 30, id: "child1", width: 60, x: 0, y: 0 },
						{ height: 30, id: "child2", width: 60, x: 200, y: 0 },
					],
					edges: [{ id: "e1", source: "child1", target: "child2" }],
					height: 200,
					id: "parent",
					padding: { bottom: 10, left: 50, right: 10, top: 50 },
					width: 400,
					x: 50,
					y: 50,
				},
			],
			height: 400,
			id: "root",
			width: 600,
		};

		const result = await routeEdges(graph);
		const parent = result.children?.[0];
		const edge = parent?.edges?.[0];

		// sourcePoint should be near child1 in content-area-relative coords
		// child1 spans x: [0, 60] in content-area coords
		expect(edge?.sourcePoint?.x).toBeGreaterThanOrEqual(-5);
		expect(edge?.sourcePoint?.x).toBeLessThanOrEqual(70);

		// targetPoint should be near child2 in content-area-relative coords
		// child2 spans x: [200, 260] in content-area coords
		expect(edge?.targetPoint?.x).toBeGreaterThanOrEqual(190);
		expect(edge?.targetPoint?.x).toBeLessThanOrEqual(270);
	});
});

describe("round-trip integrity", () => {
	it("should preserve original graph structure", async () => {
		const graph: ElkGraph = {
			children: [
				{
					height: 40,
					id: "n1",
					properties: { customProp: "hello" },
					width: 80,
					x: 0,
					y: 0,
				},
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [
				{
					id: "e1",
					properties: { weight: 1 },
					source: "n1",
					target: "n2",
				},
			],
			height: 300,
			id: "root",
			properties: { "elk.algorithm": "layered" },
			width: 400,
		};

		const result = await routeEdges(graph);

		// Graph structure preserved
		expect(result.id).toBe("root");
		expect(result.children).toHaveLength(2);
		expect(result.children?.[0]?.properties).toEqual({
			customProp: "hello",
		});
		expect(result.edges?.[0]?.properties).toEqual({ weight: 1 });

		// Route data added
		expect(result.edges?.[0]?.sourcePoint).toBeDefined();
	});

	it("should modify graph in place (same reference returned)", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			height: 300,
			id: "root",
			width: 400,
		};

		const result = await routeEdges(graph);
		expect(result).toBe(graph);
	});
});
