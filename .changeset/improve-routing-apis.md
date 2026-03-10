---
"@mr_mint/elkjs-libavoid": minor
---

Replace center-pin connection strategy with boundary auto-pins (4 per side, 16 total) for more natural edge attachment positions. Add `Symbol.dispose` support to `RoutingSession` for TC39 explicit resource management. `init()` now warns when called again with a different `wasmPath`. `RoutingSession.addEdge()` now validates port pin classes and rejects self-loop edges. `writeRoutesToGraph` throws on missing owner node instead of silently skipping. `getWasmPath()` provides descriptive errors when libavoid-js is missing.
