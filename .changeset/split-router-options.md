---
"@mr_mint/elkjs-libavoid": minor
---

Split `LibavoidRoutingOptions` into `LibavoidRouterOptions` (router config) and `LibavoidRoutingOptions` (adds `edgeIds`/`selfLoopHandling`). `createRoutingSession()` now accepts the narrower `LibavoidRouterOptions`.
