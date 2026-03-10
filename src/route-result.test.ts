import { describe, expect, it } from "vitest";
import { buildRouteResults } from "./route-result";
import type { ElkPoint } from "./types";

describe("buildRouteResults", () => {
	it("should produce sourcePoint, targetPoint, and bendPoints", () => {
		const rawRoutes = new Map<string, ElkPoint[]>([
			[
				"e1",
				[
					{ x: 0, y: 0 },
					{ x: 50, y: 0 },
					{ x: 50, y: 100 },
					{ x: 100, y: 100 },
				],
			],
		]);

		const results = buildRouteResults(rawRoutes);
		const route = results.get("e1");

		expect(route).toBeDefined();
		expect(route?.sourcePoint).toEqual({ x: 0, y: 0 });
		expect(route?.targetPoint).toEqual({ x: 100, y: 100 });
		expect(route?.bendPoints).toEqual([
			{ x: 50, y: 0 },
			{ x: 50, y: 100 },
		]);
	});

	it("should return empty bendPoints for 2-point routes", () => {
		const rawRoutes = new Map<string, ElkPoint[]>([
			[
				"e1",
				[
					{ x: 0, y: 0 },
					{ x: 100, y: 0 },
				],
			],
		]);

		const results = buildRouteResults(rawRoutes);
		expect(results.get("e1")?.bendPoints).toEqual([]);
	});

	it("should skip routes with fewer than 2 points", () => {
		const rawRoutes = new Map<string, ElkPoint[]>([
			["e1", [{ x: 0, y: 0 }]],
			["e2", []],
		]);

		const results = buildRouteResults(rawRoutes);
		expect(results.size).toBe(0);
	});

	describe("inferSide", () => {
		it("should infer 'east' source side for rightward segment", () => {
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 0, y: 0 },
						{ x: 100, y: 0 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			expect(results.get("e1")?.sourceSide).toBe("east");
		});

		it("should infer 'west' source side for leftward segment", () => {
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 100, y: 0 },
						{ x: 0, y: 0 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			expect(results.get("e1")?.sourceSide).toBe("west");
		});

		it("should infer 'south' source side for downward segment", () => {
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 0, y: 0 },
						{ x: 0, y: 100 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			expect(results.get("e1")?.sourceSide).toBe("south");
		});

		it("should infer 'north' source side for upward segment", () => {
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 0, y: 100 },
						{ x: 0, y: 0 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			expect(results.get("e1")?.sourceSide).toBe("north");
		});

		it("should infer target side as the inverse of direction", () => {
			// Rightward final segment → target side is "west" (edge arrives from the west)
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 0, y: 0 },
						{ x: 100, y: 0 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			expect(results.get("e1")?.targetSide).toBe("west");
		});

		it("should prefer horizontal over vertical for 45-degree diagonal", () => {
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 0, y: 0 },
						{ x: 100, y: 100 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			// When |dx| === |dy|, horizontal wins (east/west)
			expect(results.get("e1")?.sourceSide).toBe("east");
		});

		it("should use last segment for target side inference", () => {
			// Route goes right then down — last segment is downward
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 0, y: 0 },
						{ x: 100, y: 0 },
						{ x: 100, y: 100 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			expect(results.get("e1")?.sourceSide).toBe("east");
			// Last segment is downward, so target side is "north" (arrives from above)
			expect(results.get("e1")?.targetSide).toBe("north");
		});

		it("should handle zero-length segment gracefully", () => {
			const rawRoutes = new Map<string, ElkPoint[]>([
				[
					"e1",
					[
						{ x: 50, y: 50 },
						{ x: 50, y: 50 },
					],
				],
			]);

			const results = buildRouteResults(rawRoutes);
			const route = results.get("e1");
			expect(route).toBeDefined();
			expect(route?.sourceSide).toBe("east");
			expect(route?.targetSide).toBe("west");
		});
	});
});
