# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**elkjs-libavoid** is a TypeScript library that provides obstacle-avoiding edge routing for [ELK JSON](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html) graphs using [libavoid](https://github.com/mjwybrow/adaptagrams/tree/master/libavoid) (via its WASM build, [libavoid-js](https://www.npmjs.com/package/libavoid-js)). Use [ELK.js](https://github.com/kieler/elkjs) or any tool to position nodes, then pass the graph here for edge routing.

## Architecture

```
src/
  index.ts              – Public API: re-exports init() and routeEdges()
  route-edges.ts        – Orchestration: init WASM, parse, route, write back
  parser.ts             – Converts hierarchical ELK JSON → flat indexed representation
  libavoid-session.ts   – Creates/manages libavoid WASM router sessions
  write-back.ts         – Writes computed routes back into ELK graph edges
  types.ts              – ELK JSON type definitions and routing options
  parser.test.ts        – Unit tests for the parser
tests/
  route-edges.test.ts   – Integration tests for the full routing pipeline
```

**Data flow:** `routeEdges()` → `parseElkGraph()` → `createLibavoidSession()` → `router.processTransaction()` → `extractRoutes()` → `writeRoutesToGraph()`

## Common Commands

```bash
npm test              # Run tests (vitest)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run build         # Build with tsdown (ESM + CJS + .d.ts)
npm run dev           # Build in watch mode
npm run check:fix     # Lint and format with Biome
npm run lint          # Biome CI check + TypeScript noEmit
npm run typecheck     # TypeScript type checking only
```

## Key Conventions

- **Module format:** ESM-first (`"type": "module"`), dual CJS/ESM output via tsdown
- **Formatter/Linter:** Biome — tabs, double quotes, semicolons, trailing commas
- **Testing:** Vitest with `globals: true` (no imports needed for `describe`/`it`/`expect`)
- **WASM:** libavoid-js WASM file is copied to `dist/` via the `postbuild` script
- **Releases:** Managed via [changesets](https://github.com/changesets/changesets) — `npm run changeset` to create, CI handles versioning and npm publish
- **Node:** Requires >= 20

## Important Patterns

- The library modifies the input graph **in place** and also returns it
- Both ELK simple (`source`/`target`) and extended (`sources`/`targets`/`sections`) edge formats are supported
- Port positions are relative to their parent node; the parser converts to absolute coordinates internally
- `inferPortSide()` determines port direction (N/S/E/W) from position for libavoid ConnDir hints
- WASM sessions must be properly destroyed to avoid memory leaks — `destroySession()` runs in a `finally` block

## License

MIT
