---
"@mr_mint/elkjs-libavoid": minor
---

Move `getWasmPath()` from the main entry to a Node-only subpath export (`@mr_mint/elkjs-libavoid/node`). This prevents bundlers from statically analyzing `node:module` and `createRequire` in browser builds. Also fix `getWasmPath()` to resolve `"libavoid-js"` (an exported subpath) instead of `"libavoid-js/dist/libavoid.wasm"` (unexported), which broke in ESM strict mode and Turbopack.
