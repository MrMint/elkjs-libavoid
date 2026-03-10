# elkjs-libavoid

[![CI](https://github.com/mrmint/elkjs-libavoid/actions/workflows/ci.yml/badge.svg)](https://github.com/mrmint/elkjs-libavoid/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mr_mint/elkjs-libavoid)](https://www.npmjs.com/package/@mr_mint/elkjs-libavoid)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Obstacle-avoiding edge routing for ELK JSON graphs using [libavoid](https://github.com/mjwybrow/adaptagrams/tree/master/libavoid).

Use [ELK.js](https://github.com/kieler/elkjs) (or any other tool) to position your nodes, then pass the graph to elkjs-libavoid to compute edge routes that avoid overlapping with nodes.

## Installation

```bash
npm install @mr_mint/elkjs-libavoid
```

elkjs is an optional peer dependency — install it if you need ELK for node layout:

```bash
npm install elkjs
```

## Quick Start

```ts
import ELK from "elkjs";
import { routeEdgesInPlace } from "@mr_mint/elkjs-libavoid";

const elk = new ELK();

// 1. Define your graph
const graph = {
  id: "root",
  children: [
    { id: "n1", width: 100, height: 50 },
    { id: "n2", width: 100, height: 50 },
    { id: "n3", width: 100, height: 50 },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n1", target: "n3" },
  ],
};

// 2. Layout nodes with ELK
const positioned = await elk.layout(graph);

// 3. Route edges with libavoid (mutates graph in place)
const routed = await routeEdgesInPlace(positioned);
// Edges now have sourcePoint, targetPoint, and bendPoints
```

Or use `routeEdges` to get route results without mutating the graph:

```ts
import { routeEdges } from "@mr_mint/elkjs-libavoid";

const routes = await routeEdges(positioned);
// routes is a Map<string, RouteResult> with absolute coordinates
for (const [edgeId, route] of routes) {
  console.log(edgeId, route.sourcePoint, route.targetPoint, route.bendPoints);
}
```

## API

### `init(wasmPath?: string): Promise<void>`

Pre-initialize the libavoid WASM module. This is optional — `routeEdges`, `routeEdgesInPlace`, and `createRoutingSession` will call it automatically on first use in Node.js. Call it explicitly if you want to control when the WASM module loads.

**Browser environments:** You **must** call `init()` with a URL to the `libavoid.wasm` file before using the routing APIs. Copy `libavoid.wasm` from `node_modules/libavoid-js/dist/` to your public directory.

```ts
import { init } from "@mr_mint/elkjs-libavoid";

// Node.js — auto-detected, no path needed:
await init();

// Browser — must provide the WASM URL:
await init("/path/to/libavoid.wasm");
```

### `routeEdges(graph, options?): Promise<Map<string, RouteResult>>`

Compute obstacle-avoiding routes for all edges in an ELK JSON graph. Nodes must already have `x`, `y`, `width`, and `height` set. The input graph is **not** modified.

Returns a `Map` of edge ID to `RouteResult`. Coordinates are **absolute** (not relative to parent nodes).

Supports both ELK simple edge format (`source`/`target`) and extended format (`sources`/`targets`/`sections`), as well as ports and hierarchical (compound) graphs.

```ts
import { routeEdges } from "@mr_mint/elkjs-libavoid";

const routes = await routeEdges(graph, {
  routingType: "orthogonal",
  shapeBufferDistance: 8,
});

for (const [edgeId, route] of routes) {
  // route.sourcePoint, route.targetPoint, route.bendPoints — absolute coords
  // route.sourceSide, route.targetSide — "north" | "south" | "east" | "west"
}
```

### `routeEdgesInPlace(graph, options?): Promise<ElkGraph>`

Compute obstacle-avoiding routes and write them directly into the graph's edge objects. The graph is modified **in place** and also returned.

Coordinates are written **relative** to the edge's owner node's content area (inside padding), matching the ELK JSON convention.

```ts
import { routeEdgesInPlace } from "@mr_mint/elkjs-libavoid";

const routed = await routeEdgesInPlace(graph, {
  routingType: "orthogonal",
  shapeBufferDistance: 8,
});
// routed === graph, edges now have sourcePoint/targetPoint/bendPoints
```

### `createRoutingSession(graph, options?): Promise<RoutingSession>`

Create a long-lived routing session for incremental updates. Use this instead of `routeEdges()` when you need to update node positions frequently (e.g., during drag operations) without re-creating the entire router on every frame.

```ts
import { createRoutingSession } from "@mr_mint/elkjs-libavoid";

const session = await createRoutingSession(graph, {
  routingType: "orthogonal",
});

// On node drag:
session.moveNode("n1", { x: newX, y: newY });
const routes = session.processTransaction();
// routes is a Map<string, RouteResult> with absolute coordinates

// Add/remove edges dynamically:
session.addEdge({ id: "e3", source: "n1", target: "n3" });
session.removeEdge("e1");
const updatedRoutes = session.processTransaction();

// Cleanup:
session.destroy();
```

`RoutingSession` implements `Symbol.dispose` for TC39 Explicit Resource Management:

```ts
using session = await createRoutingSession(graph);
```

### `getWasmPath(): string`

Node.js helper that returns the absolute path to the bundled `libavoid.wasm` file. Available from the `./node` subpath export.

```ts
import { getWasmPath } from "@mr_mint/elkjs-libavoid/node";

const wasmPath = getWasmPath();
```

## Types

### `RouteResult`

Returned by `routeEdges()` and `RoutingSession.processTransaction()`.

```ts
interface RouteResult {
  sourcePoint: ElkPoint;
  targetPoint: ElkPoint;
  bendPoints: ElkPoint[];
  sourceSide: ConnectionSide;
  targetSide: ConnectionSide;
}
```

### `ConnectionSide`

```ts
type ConnectionSide = "north" | "south" | "east" | "west";
```

### `SelfLoopHandling`

```ts
type SelfLoopHandling = "skip" | "fallback";
```

## Options

All options are optional. Pass them as the second argument to `routeEdges` or `routeEdgesInPlace`.

### Router Options

These options are shared by `routeEdges`, `routeEdgesInPlace`, and `createRoutingSession`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routingType` | `"orthogonal" \| "polyline"` | `"orthogonal"` | Routing style — right-angle bends or diagonal segments |
| `segmentPenalty` | `number` | `10` | Cost per segment beyond the first |
| `anglePenalty` | `number` | `0` | Cost for tight bends |
| `crossingPenalty` | `number` | `0` | Cost for edge crossings |
| `clusterCrossingPenalty` | `number` | `0` | Cost for crossing cluster boundaries |
| `fixedSharedPathPenalty` | `number` | `0` | Cost for sharing a path with an immovable edge |
| `reverseDirectionPenalty` | `number` | `0` | Cost for routing backwards |
| `portDirectionPenalty` | `number` | `100` | Cost for leaving a port in the wrong direction |
| `shapeBufferDistance` | `number` | `4` | Padding around obstacles (in pixels) |
| `idealNudgingDistance` | `number` | `4` | Spacing between parallel edge segments |
| `nudgeOrthogonalSegmentsConnectedToShapes` | `boolean` | — | Nudge segments connected to shapes |
| `nudgeOrthogonalTouchingColinearSegments` | `boolean` | — | Nudge touching colinear segments |
| `performUnifyingNudgingPreprocessingStep` | `boolean` | — | Preprocessing step for unified nudging |
| `nudgeSharedPathsWithCommonEndPoint` | `boolean` | — | Nudge shared paths that share an endpoint |

### Routing Options

These additional options are available for `routeEdges` and `routeEdgesInPlace` only (not `createRoutingSession`).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `edgeIds` | `string[]` | — | Only route edges with these IDs; others are left unchanged |
| `selfLoopHandling` | `"skip" \| "fallback"` | `"skip"` | How to handle self-loop edges (source === target). `"skip"` omits them; `"fallback"` generates a synthetic route |

## Graph Format

elkjs-libavoid works with the [ELK JSON format](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html). Nodes must be positioned before routing.

### Simple Edges

```ts
{
  id: "root",
  children: [
    { id: "n1", x: 0, y: 0, width: 100, height: 50 },
    { id: "n2", x: 200, y: 100, width: 100, height: 50 },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
  ],
}
```

With `routeEdgesInPlace`, each edge gets `sourcePoint`, `targetPoint`, and `bendPoints`.

### Extended Edges

```ts
edges: [
  { id: "e1", sources: ["n1"], targets: ["n2"] },
]
```

With `routeEdgesInPlace`, extended edges get a `sections` array with `startPoint`, `endPoint`, and `bendPoints`.

### Ports

```ts
children: [
  {
    id: "n1", x: 0, y: 0, width: 100, height: 50,
    ports: [{ id: "p1", x: 100, y: 25, width: 5, height: 5 }],
  },
],
edges: [
  { id: "e1", source: "n1", sourcePort: "p1", target: "n2" },
]
```

### Hierarchical Graphs

Edges defined within compound nodes are routed correctly with coordinates relative to their parent.

```ts
{
  id: "root",
  children: [
    {
      id: "group", x: 0, y: 0, width: 400, height: 200,
      children: [
        { id: "a", x: 10, y: 10, width: 50, height: 50 },
        { id: "b", x: 200, y: 100, width: 50, height: 50 },
      ],
      edges: [{ id: "e1", source: "a", target: "b" }],
    },
  ],
}
```

## Requirements

- Node.js >= 20
- A runtime that supports WebAssembly

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Lint and format
npm run check:fix

# Type check
npm run typecheck
```

## License

[MIT](LICENSE)
