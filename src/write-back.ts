import type { ParsedGraph } from "./parser";
import type { ElkEdge, ElkPoint } from "./types";

/**
 * Detect whether the edge uses extended format (sources/targets with sections)
 * or simple format (source/target with sourcePoint/targetPoint/bendPoints).
 */
function isExtendedFormat(edge: ElkEdge): boolean {
	return (
		(edge.sources !== undefined && edge.sources.length > 0) ||
		(edge.targets !== undefined && edge.targets.length > 0)
	);
}

function writeSimpleFormat(elkEdge: ElkEdge, points: ElkPoint[]): void {
	elkEdge.sourcePoint = points[0];
	elkEdge.targetPoint = points[points.length - 1];
	if (points.length > 2) {
		elkEdge.bendPoints = points.slice(1, -1);
	}
	// Clean up extended format fields if forcing simple
	delete elkEdge.sections;
}

function writeExtendedFormat(
	elkEdge: ElkEdge,
	points: ElkPoint[],
	edgeId: string,
): void {
	elkEdge.sections = [
		{
			bendPoints: points.length > 2 ? points.slice(1, -1) : undefined,
			endPoint: points[points.length - 1],
			id: `${edgeId}_s0`,
			startPoint: points[0],
		},
	];
	// Clean up simple format fields if forcing extended
	delete elkEdge.sourcePoint;
	delete elkEdge.targetPoint;
	delete elkEdge.bendPoints;
}

/**
 * Convert absolute route points to coordinates relative to the edge's owner node.
 *
 * In ELK JSON, edge coordinates are relative to the parent node that owns the edge.
 * Libavoid produces absolute coordinates, so we need to subtract the owner's
 * absolute position (including padding offset for children).
 */
function toRelativeCoords(
	points: ElkPoint[],
	ownerNodeId: string,
	parsed: ParsedGraph,
): ElkPoint[] {
	const owner = parsed.nodes.get(ownerNodeId);
	if (!owner) return points;

	// Edge coordinates in ELK are relative to the owner's content area (inside padding),
	// which is the same coordinate space as the owner's children.
	const offsetX = owner.x + owner.padding.left;
	const offsetY = owner.y + owner.padding.top;

	return points.map((p) => ({
		x: p.x - offsetX,
		y: p.y - offsetY,
	}));
}

/**
 * Write computed routes back into the ELK graph's edge objects.
 *
 * Modifies the graph in place. Auto-detects whether each edge uses
 * extended format (sources/targets/sections) or simple format
 * (source/target/sourcePoint/targetPoint/bendPoints) and writes accordingly.
 */
export function writeRoutesToGraph(
	routes: Map<string, ElkPoint[]>,
	parsed: ParsedGraph,
): void {
	for (const edge of parsed.edges) {
		const absolutePoints = routes.get(edge.id);
		if (!absolutePoints || absolutePoints.length < 2) continue;

		const points = toRelativeCoords(absolutePoints, edge.ownerNodeId, parsed);
		const elkEdge = edge.elkEdgeRef;

		if (isExtendedFormat(elkEdge)) {
			writeExtendedFormat(elkEdge, points, edge.id);
		} else {
			writeSimpleFormat(elkEdge, points);
		}
	}
}
