---
"@mr_mint/elkjs-libavoid": minor
---

Remove `routeEdgesFlat()`, `RouteNode`, `RouteEdge`, `OutputFormat`, and `outputFormat` option. Output format is now always auto-detected from the edge format. Use `routeEdges()` with a graph directly instead of `routeEdgesFlat()`.
