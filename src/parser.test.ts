import { describe, expect, it } from "vitest";
import { parseElkGraph } from "./parser";
import type { ElkEdge, ElkGraph, ElkNode } from "./types";

describe("parseElkGraph", () => {
	describe("flat graph parsing", () => {
		it("should parse a simple 2-node 1-edge graph", () => {
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

			const parsed = parseElkGraph(graph);

			expect(parsed.nodes.size).toBe(3); // root + 2 children
			expect(parsed.edges).toHaveLength(1);

			const n1 = parsed.nodes.get("n1");
			expect(n1?.x).toBe(0);
			expect(n1?.y).toBe(0);
			expect(n1?.parentId).toBe("root");

			const n2 = parsed.nodes.get("n2");
			expect(n2?.x).toBe(200);
			expect(n2?.y).toBe(100);

			const edge = parsed.edges[0];
			expect(edge.sourceNodeId).toBe("n1");
			expect(edge.targetNodeId).toBe("n2");
			expect(edge.sourcePortId).toBeUndefined();
			expect(edge.targetPortId).toBeUndefined();
			expect(edge.ownerNodeId).toBe("root");
		});

		it("should parse 3 nodes with 2 edges", () => {
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

			const parsed = parseElkGraph(graph);
			expect(parsed.nodes.size).toBe(4);
			expect(parsed.edges).toHaveLength(2);
		});
	});

	describe("port handling", () => {
		it("should resolve ports with absolute positions", () => {
			const graph: ElkGraph = {
				children: [
					{
						height: 40,
						id: "n1",
						ports: [{ height: 10, id: "p1", width: 5, x: 80, y: 15 }],
						width: 80,
						x: 10,
						y: 20,
					},
				],
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			const port = parsed.ports.get("p1");

			expect(port?.nodeId).toBe("n1");
			expect(port?.x).toBe(90); // 10 + 80
			expect(port?.y).toBe(35); // 20 + 15
			expect(port?.width).toBe(5);
			expect(port?.height).toBe(10);
		});

		it("should infer EAST side for port on right edge", () => {
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
				],
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			expect(parsed.ports.get("p1")?.side).toBe("EAST");
		});

		it("should infer WEST side for port on left edge", () => {
			const graph: ElkGraph = {
				children: [
					{
						height: 40,
						id: "n1",
						ports: [{ height: 10, id: "p1", width: 5, x: -5, y: 15 }],
						width: 80,
						x: 0,
						y: 0,
					},
				],
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			expect(parsed.ports.get("p1")?.side).toBe("WEST");
		});

		it("should infer NORTH side for port on top edge", () => {
			const graph: ElkGraph = {
				children: [
					{
						height: 40,
						id: "n1",
						ports: [{ height: 5, id: "p1", width: 10, x: 35, y: -5 }],
						width: 80,
						x: 0,
						y: 0,
					},
				],
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			expect(parsed.ports.get("p1")?.side).toBe("NORTH");
		});

		it("should infer SOUTH side for port on bottom edge", () => {
			const graph: ElkGraph = {
				children: [
					{
						height: 40,
						id: "n1",
						ports: [{ height: 5, id: "p1", width: 10, x: 35, y: 40 }],
						width: 80,
						x: 0,
						y: 0,
					},
				],
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			expect(parsed.ports.get("p1")?.side).toBe("SOUTH");
		});
	});

	describe("extended edge format", () => {
		it("should resolve port references from sources/targets arrays", () => {
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

			const parsed = parseElkGraph(graph);
			const edge = parsed.edges[0];
			expect(edge.sourceNodeId).toBe("n1");
			expect(edge.sourcePortId).toBe("n1_p1");
			expect(edge.targetNodeId).toBe("n2");
			expect(edge.targetPortId).toBe("n2_p1");
		});

		it("should resolve node references from sources/targets arrays", () => {
			const graph: ElkGraph = {
				children: [
					{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
					{ height: 40, id: "n2", width: 80, x: 200, y: 100 },
				],
				edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			const edge = parsed.edges[0];
			expect(edge.sourceNodeId).toBe("n1");
			expect(edge.sourcePortId).toBeUndefined();
			expect(edge.targetNodeId).toBe("n2");
			expect(edge.targetPortId).toBeUndefined();
		});
	});

	describe("hierarchical graphs", () => {
		it("should compute absolute positions for nested children", () => {
			const graph: ElkGraph = {
				children: [
					{
						children: [
							{ height: 30, id: "child1", width: 60, x: 0, y: 0 },
							{ height: 30, id: "child2", width: 60, x: 100, y: 80 },
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

			const parsed = parseElkGraph(graph);

			// child1 absolute: parent.x(50) + padding.left(20) + child.x(0) = 70
			const child1 = parsed.nodes.get("child1");
			expect(child1?.x).toBe(70);
			expect(child1?.y).toBe(80); // 50 + 30 + 0

			// child2 absolute: 50 + 20 + 100 = 170
			const child2 = parsed.nodes.get("child2");
			expect(child2?.x).toBe(170);
			expect(child2?.y).toBe(160); // 50 + 30 + 80

			// Edge is owned by parent
			const edge = parsed.edges[0];
			expect(edge.ownerNodeId).toBe("parent");
		});

		it("should store padding on resolved nodes", () => {
			const graph: ElkGraph = {
				children: [
					{
						children: [{ height: 30, id: "child1", width: 60, x: 0, y: 0 }],
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

			const parsed = parseElkGraph(graph);

			const parent = parsed.nodes.get("parent");
			expect(parent?.padding).toEqual({
				bottom: 10,
				left: 20,
				right: 20,
				top: 30,
			});

			// Nodes without explicit padding should default to 0
			const child1 = parsed.nodes.get("child1");
			expect(child1?.padding).toEqual({
				bottom: 0,
				left: 0,
				right: 0,
				top: 0,
			});
		});

		it("should set hasChildren for container nodes", () => {
			const graph: ElkGraph = {
				children: [
					{
						children: [{ height: 30, id: "child1", width: 60, x: 0, y: 0 }],
						height: 200,
						id: "parent",
						width: 300,
						x: 50,
						y: 50,
					},
					{ height: 40, id: "leaf", width: 80, x: 400, y: 0 },
				],
				id: "root",
			};

			const parsed = parseElkGraph(graph);

			expect(parsed.nodes.get("root")?.hasChildren).toBe(true);
			expect(parsed.nodes.get("parent")?.hasChildren).toBe(true);
			expect(parsed.nodes.get("child1")?.hasChildren).toBe(false);
			expect(parsed.nodes.get("leaf")?.hasChildren).toBe(false);
		});

		it("should handle 3-level nesting", () => {
			const graph: ElkGraph = {
				children: [
					{
						children: [
							{
								children: [{ height: 30, id: "L3", width: 50, x: 30, y: 30 }],
								height: 150,
								id: "L2",
								width: 200,
								x: 20,
								y: 20,
							},
						],
						height: 300,
						id: "L1",
						width: 400,
						x: 10,
						y: 10,
					},
				],
				height: 500,
				id: "root",
				width: 600,
			};

			const parsed = parseElkGraph(graph);
			// L3 absolute: root(0) + L1.x(10) + L2.x(20) + L3.x(30) = 60
			const l3 = parsed.nodes.get("L3");
			expect(l3?.x).toBe(60);
			expect(l3?.y).toBe(60);
		});
	});

	describe("error cases", () => {
		it("should throw for node missing width/height", () => {
			const graph: ElkGraph = {
				children: [{ id: "n1", x: 0, y: 0 } as ElkNode],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				'Node "n1" is missing width or height',
			);
		});

		it("should throw for non-root node missing position", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80 }],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				'Node "n1" is missing x or y position',
			);
		});

		it("should throw for edge referencing non-existent node", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
				edges: [{ id: "e1", source: "n1", target: "nonexistent" }],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				'target node "nonexistent" not found',
			);
		});

		it("should throw for edge referencing non-existent port", () => {
			const graph: ElkGraph = {
				children: [
					{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
					{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
				],
				edges: [
					{
						id: "e1",
						source: "n1",
						sourcePort: "badport",
						target: "n2",
					},
				],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				'source port "badport" not found',
			);
		});

		it("should throw for extended format referencing non-existent ID", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
				edges: [{ id: "e1", sources: ["n1"], targets: ["ghost"] }],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				'target reference "ghost" not found',
			);
		});

		it("should throw for edge with no source/target", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
				edges: [{ id: "e1" } as ElkEdge],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow("no source specified");
		});

		it("should throw for edge with multiple sources", () => {
			const graph: ElkGraph = {
				children: [
					{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
					{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
					{ height: 40, id: "n3", width: 80, x: 100, y: 100 },
				],
				edges: [{ id: "e1", sources: ["n1", "n2"], targets: ["n3"] }],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				"multiple sources are not supported",
			);
		});

		it("should throw for edge with multiple targets", () => {
			const graph: ElkGraph = {
				children: [
					{ height: 40, id: "n1", width: 80, x: 0, y: 0 },
					{ height: 40, id: "n2", width: 80, x: 200, y: 0 },
					{ height: 40, id: "n3", width: 80, x: 100, y: 100 },
				],
				edges: [{ id: "e1", sources: ["n1"], targets: ["n2", "n3"] }],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				"multiple targets are not supported",
			);
		});

		it("should throw for edge referencing root node as source", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
				edges: [{ id: "e1", source: "root", target: "n1" }],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				'source node "root" is the root node and cannot be an edge endpoint',
			);
		});

		it("should throw for edge referencing root node as target", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
				edges: [{ id: "e1", source: "n1", target: "root" }],
				height: 300,
				id: "root",
				width: 400,
			};

			expect(() => parseElkGraph(graph)).toThrow(
				'target node "root" is the root node and cannot be an edge endpoint',
			);
		});
	});

	describe("edge cases", () => {
		it("should accept root node without width/height", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
				id: "root",
			};

			const parsed = parseElkGraph(graph);
			const root = parsed.nodes.get("root");
			expect(root).toBeDefined();
			expect(root?.width).toBe(0);
			expect(root?.height).toBe(0);
		});

		it("should handle graph with no edges", () => {
			const graph: ElkGraph = {
				children: [{ height: 40, id: "n1", width: 80, x: 0, y: 0 }],
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			expect(parsed.edges).toHaveLength(0);
			expect(parsed.nodes.size).toBe(2);
		});

		it("should handle graph with no children", () => {
			const graph: ElkGraph = {
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			expect(parsed.nodes.size).toBe(1);
			expect(parsed.edges).toHaveLength(0);
		});

		it("should handle simple edge format with sourcePort/targetPort", () => {
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
				height: 300,
				id: "root",
				width: 400,
			};

			const parsed = parseElkGraph(graph);
			const edge = parsed.edges[0];
			expect(edge.sourcePortId).toBe("p1");
			expect(edge.targetPortId).toBe("p2");
		});
	});
});
