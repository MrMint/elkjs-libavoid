---
"@mr_mint/elkjs-libavoid": minor
---

`routeEdges()` now returns a `Map<string, RouteResult>` without mutating the input graph. Use `routeEdgesInPlace()` for the previous in-place mutation behavior.
