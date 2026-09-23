# Cropped Reference Assets

These PNGs were cropped from the "2D Asset Overview" concept sheet and sorted
into folders matching the structure shown in that sheet's own file-structure
panel (characters/enemies/environments/items/effects/ui).

Important notes:
- Source resolution is low (the sheet is 1536x1024 with 50+ items packed in),
  so these are reference/placeholder thumbnails, not production-ready sprite
  sheets — no transparency, no separate animation frames beyond the single
  pose shown per character.
- The current game code (src/main.js) renders everything procedurally and
  does not load any files from this assets/ folder. Wiring these images into
  the actual game would require code changes (image loading + draw calls).
- Folders:
  - characters/  hero poses + portrait, gods, key NPCs
  - enemies/     normal enemies, mini-bosses, main bosses (realm lords)
  - environments/ realm background concepts + a room-tiles/props reference sheet
  - items/       weapons and loot icons
  - effects/     combat effect sprites
  - ui/          HUD, menu, map, and dialogue box concept screenshots
