import type { ConnectionSide, ElkPoint, RouteResult } from "./types";

/**
 * Infer the connection side from the direction of the first or last edge segment.
 */
function inferSide(
	from: ElkPoint,
	to: ElkPoint,
	isTarget: boolean,
): ConnectionSide {
	const dx = to.x - from.x;
	const dy = to.y - from.y;

	// Zero-length segment: default to east/west
	if (dx === 0 && dy === 0) return isTarget ? "west" : "east";

	const horizontal = Math.abs(dx) >= Math.abs(dy);
	if (horizontal) return dx > 0 === !isTarget ? "east" : "west";
	return dy > 0 === !isTarget ? "south" : "north";
}

/**
 * Convert raw point arrays from extractRoutes into RouteResult objects
 * with source/target side metadata.
 */
export function buildRouteResults(
	rawRoutes: Map<string, ElkPoint[]>,
): Map<string, RouteResult> {
	const results = new Map<string, RouteResult>();
	for (const [edgeId, points] of rawRoutes) {
		if (points.length < 2) continue;

		const sourceSide = inferSide(points[0], points[1], false);
		const targetSide = inferSide(
			points[points.length - 2],
			points[points.length - 1],
			true,
		);

		results.set(edgeId, {
			bendPoints: points.length > 2 ? points.slice(1, -1) : [],
			sourcePoint: points[0],
			sourceSide,
			targetPoint: points[points.length - 1],
			targetSide,
		});
	}
	return results;
}
