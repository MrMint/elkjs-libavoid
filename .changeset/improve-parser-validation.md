---
"@mr_mint/elkjs-libavoid": patch
---

Improve parser validation: detect duplicate node, edge, and port IDs; reject nodes with zero or negative dimensions. Support explicit `port.side` and `elk.port.side` properties on ports (case-insensitive), falling back to positional inference when not set.
