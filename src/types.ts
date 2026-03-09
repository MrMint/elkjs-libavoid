/** ELK JSON graph types */

export interface ElkPoint {
	x: number;
	y: number;
}

export interface ElkEdgeSection {
	id: string;
	startPoint: ElkPoint;
	endPoint: ElkPoint;
	bendPoints?: ElkPoint[];
}

export interface ElkPort {
	id: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	properties?: Record<string, unknown>;
}

export interface ElkEdge {
	id: string;
	/** Simple format */
	source?: string;
	target?: string;
	sourcePort?: string;
	targetPort?: string;
	/** Extended format */
	sources?: string[];
	targets?: string[];
	/** Routing results */
	sections?: ElkEdgeSection[];
	sourcePoint?: ElkPoint;
	targetPoint?: ElkPoint;
	bendPoints?: ElkPoint[];
	properties?: Record<string, unknown>;
}

export interface ElkNode {
	id: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	children?: ElkNode[];
	ports?: ElkPort[];
	edges?: ElkEdge[];
	properties?: Record<string, unknown>;
	padding?: {
		top?: number;
		right?: number;
		bottom?: number;
		left?: number;
	};
}

export interface ElkGraph extends ElkNode {}

/** Routing configuration options */
export interface LibavoidRoutingOptions {
	/** Routing style. Default: 'orthogonal' */
	routingType?: "orthogonal" | "polyline";

	/** Per-segment cost beyond the first. Default: 10 */
	segmentPenalty?: number;
	/** Tight bend cost. Default: 0 */
	anglePenalty?: number;
	/** Edge crossing cost. Default: 0 */
	crossingPenalty?: number;
	/** Cluster boundary crossing cost. Default: 0 */
	clusterCrossingPenalty?: number;
	/** Sharing path with immovable edge. Default: 0 */
	fixedSharedPathPenalty?: number;
	/** Going backwards. Default: 0 */
	reverseDirectionPenalty?: number;
	/** Port direction penalty. Default: 100 */
	portDirectionPenalty?: number;

	/** Padding around obstacles. Default: 4 */
	shapeBufferDistance?: number;
	/** Space between parallel segments. Default: 4 */
	idealNudgingDistance?: number;

	/** Nudging options */
	nudgeOrthogonalSegmentsConnectedToShapes?: boolean;
	nudgeOrthogonalTouchingColinearSegments?: boolean;
	performUnifyingNudgingPreprocessingStep?: boolean;
	nudgeSharedPathsWithCommonEndPoint?: boolean;
}
