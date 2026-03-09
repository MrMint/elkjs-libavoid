# @mr_mint/elkjs-libavoid

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
