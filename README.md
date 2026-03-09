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
import { routeEdges } from "@mr_mint/elkjs-libavoid";

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

// 3. Route edges with libavoid
const routed = await routeEdges(positioned);
// Edges now have sourcePoint, targetPoint, and bendPoints
```

## API

### `init(wasmPath?: string): Promise<void>`

Pre-initialize the libavoid WASM module. This is optional — `routeEdges` will call it automatically on first use. Call it explicitly if you want to control when the WASM module loads.

```ts
import { init } from "@mr_mint/elkjs-libavoid";

await init();
// or with a custom WASM path:
await init("/path/to/libavoid.wasm");
```

### `routeEdges(graph: ElkGraph, options?: LibavoidRoutingOptions): Promise<ElkGraph>`

Compute obstacle-avoiding routes for all edges in an ELK JSON graph. Nodes must already have `x`, `y`, `width`, and `height` set. The graph is modified in place and also returned.

Supports both ELK simple edge format (`source`/`target`) and extended format (`sources`/`targets`/`sections`), as well as ports and hierarchical (compound) graphs.

```ts
import { routeEdges } from "@mr_mint/elkjs-libavoid";

const routed = await routeEdges(graph, {
  routingType: "orthogonal",
  shapeBufferDistance: 8,
});
```

## Options

All options are optional. Pass them as the second argument to `routeEdges`.

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

After routing, each edge gets `sourcePoint`, `targetPoint`, and `bendPoints`.

### Extended Edges

```ts
edges: [
  { id: "e1", sources: ["n1"], targets: ["n2"] },
]
```

After routing, extended edges get a `sections` array with `startPoint`, `endPoint`, and `bendPoints`.

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
