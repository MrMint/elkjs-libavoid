---
"@mr_mint/elkjs-libavoid": patch
---

Fix `inferSide` to handle zero-length edge segments (identical source and target points) by defaulting to east/west instead of falling through ambiguous comparison logic.
