# Jail Cells (Dungeon Area 1) - conversion status

## Update: fully built and complete

This doc originally tracked an in-progress conversion. As of this update,
verified directly against the shipped files: jail_cells is complete, and
so is the entire rest of the dungeon chain through the Hook cutscene
(jail_cells -> dungeon_area_2 -> dungeon_area_3 -> dungeon_area_4 [+
kennels/ossuary/treasury/lower_stores] -> dungeon_area_5 [the maze] ->
dungeon_area_6 -> dungeon_finale -> outside_sewer). No placeholder
content, no missing tile art, no orphaned object references anywhere in
that chain.

The `other_objects.tsx` gap mentioned in an earlier version of this doc
(~53 tiles rendering blank) is resolved - `other_objects_wide.png` is
now a proper tileset in jail_cells.json's tileset list, firstgid 839.

**What's rendering:** everything. Floor, Floor Texture, Walls, Walls
Front, Outer wall, Decor items 1 and 2, all present and correctly tiled.

**The graffiti, notebook pages, and false-trail notes** mentioned as
outstanding in an earlier version of this doc are also done:
- "North Isn't North" (jail_cells), "The Rats Know" and "Don't Trust a
  Nun" (dungeon_area_2) are all placed via the `images` array and the
  actual PNG files are present on disk.
- The 3 notebook pages and 2 chests in dungeon_area_2 have real written
  content in `interactions.json` (`notebook_page_1/2/3`,
  `area2_chest_1/2`), not placeholder text.

**Two real bugs found and fixed while wiring this up originally, not map
issues, still worth knowing about for future dungeon maps:**

1. The door open/close animation heuristic (`getDoorFrameInfo` in
   `overworld.js`) assumed the "held open" frame would be the one that
   repeats most in the frame list. Some authoring styles instead mark
   "held" with one long duration instead of repeated frames. Fixed to
   use total accumulated time per frame instead of occurrence count, so
   it works for either convention. This is the same helper the sewer
   finale gate's door animation relies on.
2. Multiplayer zone rooms were only ever assigned by walking through a
   zone_exit object. Starting a brand new `explore` act at a different
   zone never told the server which zone-room to put a player in. Fixed
   generally: any `explore` act that declares its own `"zone"` in
   story.json gets this handled automatically now.

Each cell has its own spawn point (`spawnPoints` in the map JSON),
assigned to players by stable join order, so the party starts split up
across the 5 cells rather than stacked on one tile.

## What's still genuinely outstanding (not a jail_cells issue specifically)

Everything past the Hook cutscene: the actual Guild Hall content (Means
and Opportunity's motive-matching task, the two town gathering waves, the
testimony board, the vote), the Herbalist's Hut, and the Finale
presentation. See `MEANS_AND_OPPORTUNITY_SPEC.md` and
`PROJECT_HANDOFF.md` for the current state of those - none of it is a
jail_cells or dungeon-chain problem, the escape arc itself is done.
