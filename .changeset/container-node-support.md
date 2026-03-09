---
"@mr_mint/elkjs-libavoid": minor
---

Support hierarchical graphs with container/group nodes. Container nodes (nodes with children) are no longer registered as hard obstacles, allowing edges to route through group boundaries to reach child nodes inside. Container nodes that are direct edge endpoints still get a ShapeRef so connectors can attach to them.
