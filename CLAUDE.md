# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**elkjs-libavoid** is a TypeScript library that provides obstacle-avoiding edge routing for [ELK JSON](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html) graphs using [libavoid](https://github.com/mjwybrow/adaptagrams/tree/master/libavoid) (via its WASM build, [libavoid-js](https://www.npmjs.com/package/libavoid-js)). Use [ELK.js](https://github.com/kieler/elkjs) or any tool to position nodes, then pass the graph here for edge routing.

## Architecture

```
src/
  index.ts              – Public API: re-exports init(), routeEdges(), routeEdgesInPlace(), createRoutingSession()
  route-edges.ts        – Orchestration: init WASM, parse, route (routeEdges returns Map, routeEdgesInPlace mutates graph)
  session.ts            – RoutingSession class for incremental updates (moveNode, addEdge, removeEdge)
  parser.ts             – Converts hierarchical ELK JSON → flat indexed representation
  libavoid-session.ts   – Creates/manages libavoid WASM router sessions
  route-result.ts       – Builds RouteResult objects from raw point arrays
  write-back.ts         – Writes computed routes back into ELK graph edges
  types.ts              – ELK JSON type definitions, routing options, RouteResult, ConnectionSide
  wasm-path.ts          – Node.js utility to locate the bundled libavoid.wasm file
  node.ts               – Node.js subpath export (getWasmPath)
  parser.test.ts        – Unit tests for the parser
  route-edges.test.ts   – Integration tests for the full routing pipeline
  route-result.test.ts  – Unit tests for RouteResult building
  write-back.test.ts    – Unit tests for write-back logic
```

**Data flow (one-shot):** `routeEdges()` / `routeEdgesInPlace()` → `parseElkGraph()` → `createLibavoidSession()` → `router.processTransaction()` → `extractRoutes()` → `buildRouteResults()` (or `writeRoutesToGraph()` for in-place)

**Data flow (incremental):** `createRoutingSession()` → `parseElkGraph()` → `createLibavoidSession()` → `RoutingSession.moveNode()` / `addEdge()` / `removeEdge()` → `processTransaction()` → `extractRoutes()` → `buildRouteResults()`

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

- **Two routing APIs:** `routeEdges()` returns a `Map<string, RouteResult>` with absolute coordinates (graph untouched); `routeEdgesInPlace()` mutates the graph in place and returns it with ELK-relative coordinates
- **Incremental routing:** `createRoutingSession()` returns a `RoutingSession` for long-lived use (e.g., drag interactions) with `moveNode()`, `addEdge()`, `removeEdge()`, and `processTransaction()`
- Both ELK simple (`source`/`target`) and extended (`sources`/`targets`/`sections`) edge formats are supported
- Self-loop edges (source === target) are skipped by default; set `selfLoopHandling: "fallback"` to generate synthetic routes
- Port positions are relative to their parent node; the parser converts to absolute coordinates internally
- `inferPortSide()` determines port direction (N/S/E/W) from position for libavoid ConnDir hints
- WASM sessions must be properly destroyed to avoid memory leaks — `destroySession()` runs in a `finally` block; `RoutingSession` also supports `Symbol.dispose`
- In browsers, `init()` must be called with a WASM URL before using any routing API

## License

MIT
