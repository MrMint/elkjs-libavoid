# @mr_mint/elkjs-libavoid

## 0.4.0

### Minor Changes

- 5e5c5c1: Support hierarchical graphs with container/group nodes. Container nodes (nodes with children) are no longer registered as hard obstacles, allowing edges to route through group boundaries to reach child nodes inside. Container nodes that are direct edge endpoints still get a ShapeRef so connectors can attach to them.

## 0.3.0

### Minor Changes

- 6310054: Move `getWasmPath()` from the main entry to a Node-only subpath export (`@mr_mint/elkjs-libavoid/node`). This prevents bundlers from statically analyzing `node:module` and `createRequire` in browser builds. Also fix `getWasmPath()` to resolve `"libavoid-js"` (an exported subpath) instead of `"libavoid-js/dist/libavoid.wasm"` (unexported), which broke in ESM strict mode and Turbopack.
- b884fa9: Remove `routeEdgesFlat()`, `RouteNode`, `RouteEdge`, `OutputFormat`, and `outputFormat` option. Output format is now always auto-detected from the edge format. Use `routeEdges()` with a graph directly instead of `routeEdgesFlat()`.
- b884fa9: Split `LibavoidRoutingOptions` into `LibavoidRouterOptions` (router config) and `LibavoidRoutingOptions` (adds `edgeIds`/`selfLoopHandling`). `createRoutingSession()` now accepts the narrower `LibavoidRouterOptions`.

## 0.2.0

### Minor Changes

- 4bb5ca3: Add `sourceSide` and `targetSide` (north/south/east/west) to `RouteResult` for connection direction metadata
- 4bb5ca3: Add `edgeIds` option to route only a subset of edges while still using all nodes as obstacles
- 4bb5ca3: Add `routeEdgesFlat()` convenience API that accepts plain arrays of nodes and edges without requiring a full ELK graph structure
- 4bb5ca3: Add `createRoutingSession()` for long-lived incremental routing with `moveNode()`, `addEdge()`, `removeEdge()`, and `processTransaction()`
- 4bb5ca3: `routeEdges()` now returns a `Map<string, RouteResult>` without mutating the input graph. Use `routeEdgesInPlace()` for the previous in-place mutation behavior.
- 4bb5ca3: Add `outputFormat` option to `routeEdgesInPlace()`: `"auto"` (default) matches input format, `"simple"` forces sourcePoint/targetPoint/bendPoints, `"extended"` forces sections
- 4bb5ca3: Add `selfLoopHandling` option: `"skip"` (default) omits self-loops, `"fallback"` generates synthetic loop routes
- 4bb5ca3: Export `getWasmPath()` helper for resolving the libavoid WASM file path, useful for bundler copy plugins and framework configs

### Patch Changes

- 4bb5ca3: Fix WASM init race condition using promise guard and add helpful error messages for browser environments missing a wasmPath
- 4bb5ca3: Allow root node to omit width/height (defaults to 0) since the root is never registered as an obstacle

## 0.1.0

### Minor Changes

- 721eb58: Initial release
