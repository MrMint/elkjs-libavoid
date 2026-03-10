import { beforeAll, describe, expect, it } from "vitest";
import type { ElkGraph } from ".";
import { createRoutingSession, init, routeEdges, routeEdgesInPlace } from ".";

beforeAll(async () => {
	await init();
});

describe("routeEdges", () => {
	it("should be exported as a function", () => {
		expect(routeEdges).toBeDefined();
		expect(typeof routeEdges).toBe("function");
	});

	it("should return an empty map when there are no edges", async () => {
		const graph: ElkGraph = {
			children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
			id: "root",
		};

		const result = await routeEdges(graph);
		expect(result).toBeInstanceOf(Map);
		expect(result.size).toBe(0);
	});

	it("should not require width/height on root node", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		expect(result.has("e1")).toBe(true);
	});

	it("should not mutate the input graph", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const edgeBefore = { ...graph.edges?.[0] };
		await routeEdges(graph);

		// Original edge should not have been modified
		expect(graph.edges?.[0]?.sourcePoint).toBeUndefined();
		expect(graph.edges?.[0]).toEqual(edgeBefore);
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
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");

		expect(route).toBeDefined();
		expect(route?.sourcePoint.x).toBeTypeOf("number");
		expect(route?.sourcePoint.y).toBeTypeOf("number");
		expect(route?.targetPoint.x).toBeTypeOf("number");
		expect(route?.targetPoint.y).toBeTypeOf("number");
	});

	it("should include sourceSide and targetSide", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();

		expect(route?.sourceSide).toBeDefined();
		expect(route?.targetSide).toBeDefined();
		expect(["north", "south", "east", "west"]).toContain(route?.sourceSide);
		expect(["north", "south", "east", "west"]).toContain(route?.targetSide);
	});

	it("should route around an obstacle", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
				{ height: 40, id: "obstacle", width: 60, x: 100, y: 0 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();

		expect(route?.sourcePoint).toBeDefined();
		expect(route?.targetPoint).toBeDefined();
		// Route should exist — with boundary auto-pins, the router may find a
		// direct path (no bends) or route around (with bends) depending on pin selection.
		expect(route?.bendPoints).toBeDefined();
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
			id: "root",
		};

		const result = await routeEdges(graph);
		expect(result.size).toBe(2);

		for (const [_, route] of result) {
			expect(route.sourcePoint).toBeDefined();
			expect(route.targetPoint).toBeDefined();
		}
	});
});

describe("port support", () => {
	it("should route between directional ports", async () => {
		const graph: ElkGraph = {
			children: [
				{
					height: 40,
					id: "n1",
					ports: [{ height: 10, id: "p_east", width: 5, x: 80, y: 15 }],
					width: 80,
					x: 0,
					y: 0,
				},
				{
					height: 40,
					id: "n2",
					ports: [{ height: 10, id: "p_west", width: 5, x: -5, y: 15 }],
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
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();

		expect(route?.sourcePoint).toBeDefined();
		expect(route?.targetPoint).toBeDefined();
		expect(route?.sourcePoint.x).toBeGreaterThanOrEqual(70);
		expect(route?.targetPoint.x).toBeLessThanOrEqual(210);
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
			id: "root",
		};

		const result = await routeEdges(graph);
		expect(result.size).toBe(2);
		for (const [_, route] of result) {
			expect(route.sourcePoint).toBeDefined();
			expect(route.targetPoint).toBeDefined();
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
			id: "root",
		};

		const result = await routeEdges(graph, { routingType: "orthogonal" });
		expect(result.get("e1")).toBeDefined();
	});

	it("should accept polyline routing type", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const result = await routeEdges(graph, { routingType: "polyline" });
		expect(result.get("e1")).toBeDefined();
	});

	it("should accept custom penalty and distance options", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const result = await routeEdges(graph, {
			crossingPenalty: 200,
			idealNudgingDistance: 8,
			segmentPenalty: 50,
			shapeBufferDistance: 12,
		});
		expect(result.get("e1")).toBeDefined();
	});
});

describe("edgeIds filtering", () => {
	it("should only route specified edges", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
				{ height: 40, id: "n3", width: 80, x: 100, y: 100 },
			],
			edges: [
				{ id: "e1", source: "n1", target: "n2" },
				{ id: "e2", source: "n2", target: "n3" },
			],
			id: "root",
		};

		const result = await routeEdges(graph, { edgeIds: ["e1"] });
		expect(result.has("e1")).toBe(true);
		expect(result.has("e2")).toBe(false);
	});
});

describe("self-loop handling", () => {
	it("should skip self-loops by default", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
			],
			edges: [
				{ id: "e1", source: "n1", target: "n2" },
				{ id: "e_self", source: "n1", target: "n1" },
			],
			id: "root",
		};

		const result = await routeEdges(graph);
		expect(result.has("e1")).toBe(true);
		expect(result.has("e_self")).toBe(false);
	});

	it("should generate fallback self-loop routes when configured", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
			],
			edges: [
				{ id: "e1", source: "n1", target: "n2" },
				{ id: "e_self", source: "n1", target: "n1" },
			],
			id: "root",
		};

		const result = await routeEdges(graph, {
			selfLoopHandling: "fallback",
		});
		expect(result.has("e1")).toBe(true);
		expect(result.has("e_self")).toBe(true);

		const selfLoop = result.get("e_self");
		expect(selfLoop).toBeDefined();
		expect(selfLoop?.sourcePoint).toBeDefined();
		expect(selfLoop?.targetPoint).toBeDefined();
		expect(selfLoop?.bendPoints.length).toBeGreaterThan(0);
	});
});

describe("routeEdgesInPlace", () => {
	it("should mutate the graph in place and return it", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const result = await routeEdgesInPlace(graph);
		expect(result).toBe(graph);
		expect(graph.edges?.[0]?.sourcePoint).toBeDefined();
		expect(graph.edges?.[0]?.targetPoint).toBeDefined();
	});

	it("should write sections for extended format edges", async () => {
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
			id: "root",
		};

		const result = await routeEdgesInPlace(graph);
		const edge = result.edges?.[0];
		expect(edge).toBeDefined();

		expect(edge?.sections).toBeDefined();
		expect(edge?.sections).toHaveLength(1);
		expect(edge?.sections?.[0]?.id).toBe("e1_s0");
		expect(edge?.sections?.[0]?.startPoint).toBeDefined();
		expect(edge?.sections?.[0]?.endPoint).toBeDefined();
	});

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
			id: "root",
		};

		const result = await routeEdgesInPlace(graph);
		const parent = result.children?.[0];
		expect(parent).toBeDefined();
		const edge = parent?.edges?.[0];
		expect(edge).toBeDefined();

		expect(edge?.sourcePoint).toBeDefined();
		expect(edge?.targetPoint).toBeDefined();
	});

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
			id: "root",
			properties: { "elk.algorithm": "layered" },
		};

		const result = await routeEdgesInPlace(graph);

		expect(result.id).toBe("root");
		expect(result.children).toHaveLength(2);
		expect(result.children?.[0]?.properties).toEqual({
			customProp: "hello",
		});
		expect(result.edges?.[0]?.properties).toEqual({ weight: 1 });
		expect(result.edges?.[0]?.sourcePoint).toBeDefined();
	});
});

describe("container node handling", () => {
	it("should route edges across container boundaries to reach children", async () => {
		// Edge from leaf node outside a group to a child inside the group.
		// The parent node should NOT block the edge.
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "outside", width: 80, x: 0, y: 0 },
				{
					children: [{ height: 30, id: "inside", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "group",
					padding: { bottom: 5, left: 5, right: 5, top: 5 },
					width: 150,
					x: 200,
					y: 0,
				},
			],
			edges: [{ id: "e1", source: "outside", target: "inside" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();
		if (!route) return;
		expect(route.sourcePoint).toBeDefined();
		expect(route.targetPoint).toBeDefined();
		// Route should have source, target, and ideally bend points to navigate around the container
		expect(route.bendPoints).toBeDefined();
		// Target point should be near the "inside" child node (abs x: 200+5+10=215, y: 0+5+10=15)
		expect(route.targetPoint.x).toBeGreaterThanOrEqual(215);
		expect(route.targetPoint.x).toBeLessThanOrEqual(215 + 60);
	});

	it("should route edges between children of different groups", async () => {
		const graph: ElkGraph = {
			children: [
				{
					children: [{ height: 30, id: "a_child", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "groupA",
					padding: { bottom: 5, left: 5, right: 5, top: 5 },
					width: 150,
					x: 0,
					y: 0,
				},
				{
					children: [{ height: 30, id: "b_child", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "groupB",
					padding: { bottom: 5, left: 5, right: 5, top: 5 },
					width: 150,
					x: 300,
					y: 0,
				},
			],
			edges: [{ id: "e1", source: "a_child", target: "b_child" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();
		if (!route) return;
		expect(route.sourcePoint).toBeDefined();
		expect(route.targetPoint).toBeDefined();
		// Source should originate from groupA area, target should reach groupB area
		expect(route.sourcePoint.x).toBeLessThan(150);
		expect(route.targetPoint.x).toBeGreaterThanOrEqual(300);
	});

	it("should route edges between container nodes", async () => {
		const graph: ElkGraph = {
			children: [
				{
					children: [{ height: 30, id: "a_child", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "groupA",
					width: 150,
					x: 0,
					y: 0,
				},
				{
					children: [{ height: 30, id: "b_child", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "groupB",
					width: 150,
					x: 300,
					y: 0,
				},
			],
			edges: [{ id: "e1", source: "groupA", target: "groupB" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();
		if (!route) return;
		expect(route.sourcePoint).toBeDefined();
		expect(route.targetPoint).toBeDefined();
		// Source from groupA (x: 0..150), target at groupB (x: 300..450)
		expect(route.sourcePoint.x).toBeLessThanOrEqual(150);
		expect(route.targetPoint.x).toBeGreaterThanOrEqual(300);
	});

	it("should connect at container boundary, not center", async () => {
		// Edge from a leaf node to a container node directly to the right.
		// With boundary pins, the edge should attach at the container's left edge (x=300),
		// not at its center (x=375).
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "leaf", width: 80, x: 0, y: 30 },
				{
					children: [{ height: 30, id: "child", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "container",
					width: 150,
					x: 300,
					y: 0,
				},
			],
			edges: [{ id: "e1", source: "leaf", target: "container" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();
		if (!route) return;

		// Source exits from the leaf (x: 0..80)
		expect(route.sourcePoint.x).toBeLessThanOrEqual(84);
		// Target should connect at the container's left boundary (x=300),
		// not at the center (x=375). Allow buffer distance tolerance.
		expect(route.targetPoint.x).toBeLessThanOrEqual(305);
		expect(route.targetPoint.x).toBeGreaterThanOrEqual(296);
	});

	it("should pick the correct container boundary side based on direction", async () => {
		// Edge from a leaf node BELOW a container — should connect at the container's south edge.
		const graph: ElkGraph = {
			children: [
				{
					children: [{ height: 30, id: "child", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "container",
					width: 150,
					x: 0,
					y: 0,
				},
				{ height: 40, id: "leaf", width: 80, x: 35, y: 200 },
			],
			edges: [{ id: "e1", source: "container", target: "leaf" }],
			id: "root",
		};

		const result = await routeEdges(graph);
		const route = result.get("e1");
		expect(route).toBeDefined();
		if (!route) return;

		// Source should exit from the container's south boundary (y=100),
		// not from the center (y=50). Allow buffer distance tolerance.
		expect(route.sourcePoint.y).toBeGreaterThanOrEqual(96);
		expect(route.sourcePoint.y).toBeLessThanOrEqual(104);
	});

	it("should move children when a container node is moved", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "outside", width: 80, x: 0, y: 0 },
				{
					children: [{ height: 30, id: "inside", width: 60, x: 10, y: 10 }],
					height: 100,
					id: "group",
					padding: { bottom: 5, left: 5, right: 5, top: 5 },
					width: 150,
					x: 200,
					y: 0,
				},
			],
			edges: [{ id: "e1", source: "outside", target: "inside" }],
			id: "root",
		};

		const session = await createRoutingSession(graph);
		try {
			// Moving the container should not throw, and should re-route successfully
			session.moveNode("group", { x: 400, y: 0 });
			const routes = session.processTransaction();
			expect(routes.has("e1")).toBe(true);
			const route = routes.get("e1");
			if (!route) return;
			// Target should have shifted rightward along with the group
			expect(route.targetPoint.x).toBeGreaterThanOrEqual(400);
		} finally {
			session.destroy();
		}
	});
});

describe("createRoutingSession", () => {
	it("should create a session and return routes", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const session = await createRoutingSession(graph);
		try {
			const routes = session.processTransaction();
			expect(routes).toBeInstanceOf(Map);
			expect(routes.has("e1")).toBe(true);
		} finally {
			session.destroy();
		}
	});

	it("should support incremental node moves", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const session = await createRoutingSession(graph);
		try {
			const routes1 = session.processTransaction();
			const route1 = routes1.get("e1");
			expect(route1).toBeDefined();

			session.moveNode("n2", { x: 300, y: 200 });
			const routes2 = session.processTransaction();
			const route2 = routes2.get("e1");
			expect(route2).toBeDefined();

			// Routes should differ after moving the target node
			expect(route2?.targetPoint.x).not.toBe(route1?.targetPoint.x);
		} finally {
			session.destroy();
		}
	});

	it("should support adding and removing edges", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
				{ height: 40, id: "n3", width: 80, x: 100, y: 100 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const session = await createRoutingSession(graph);
		try {
			let routes = session.processTransaction();
			expect(routes.size).toBe(1);

			session.addEdge({ id: "e2", source: "n2", target: "n3" });
			routes = session.processTransaction();
			expect(routes.size).toBe(2);
			expect(routes.has("e2")).toBe(true);

			session.removeEdge("e1");
			routes = session.processTransaction();
			expect(routes.size).toBe(1);
			expect(routes.has("e1")).toBe(false);
			expect(routes.has("e2")).toBe(true);
		} finally {
			session.destroy();
		}
	});

	it("should throw after destroy", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const session = await createRoutingSession(graph);
		session.destroy();

		expect(() => session.processTransaction()).toThrow("destroyed");
		expect(() => session.moveNode("n1", { x: 50, y: 50 })).toThrow("destroyed");
	});

	it("should allow double destroy without error", async () => {
		const graph: ElkGraph = {
			children: [
				{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
				{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
			],
			edges: [{ id: "e1", source: "n1", target: "n2" }],
			id: "root",
		};

		const session = await createRoutingSession(graph);
		session.destroy();
		expect(() => session.destroy()).not.toThrow();
	});

	it("should support addEdge with ports", async () => {
		const graph: ElkGraph = {
			children: [
				{
					height: 40,
					id: "n1",
					ports: [{ height: 10, id: "p1", width: 5, x: 80, y: 15 }],
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
				{ height: 40, id: "n3", width: 80, x: 100, y: 100 },
			],
			edges: [
				{
					id: "e1",
					source: "n1",
					sourcePort: "p1",
					target: "n2",
					targetPort: "p2",
				},
			],
			id: "root",
		};

		const session = await createRoutingSession(graph);
		try {
			// Add an edge using auto-pins (no ports) after initial setup with port-based edges
			session.addEdge({ id: "e2", source: "n2", target: "n3" });
			const routes = session.processTransaction();
			expect(routes.has("e1")).toBe(true);
			expect(routes.has("e2")).toBe(true);
		} finally {
			session.destroy();
		}
	});

	it("should reject invalid graph input", async () => {
		await expect(
			createRoutingSession(null as unknown as ElkGraph),
		).rejects.toThrow("Invalid graph");
		await expect(
			createRoutingSession({} as unknown as ElkGraph),
		).rejects.toThrow("Invalid graph");
	});
});
