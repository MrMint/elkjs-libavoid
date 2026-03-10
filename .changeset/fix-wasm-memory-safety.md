---
"@mr_mint/elkjs-libavoid": patch
---

Fix WASM memory leaks: wrap `extractRoutes` and `createLibavoidSession` in `try/finally` to ensure all Emscripten objects (`displayRoute`, `Point`, `Rectangle`, `ConnEnd`) are freed on error. Replace `freeWasm(obj: any)` with `freeWasm(obj: unknown)` using runtime type narrowing.
