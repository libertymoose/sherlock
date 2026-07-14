# Jail Cells (Dungeon Area 1) - conversion status

## Update: this is built and playable now

`walls_floor.png`, `plates.png`, and `Objects.png` you sent matched (or,
for walls_floor, matched exactly, 442 tiles on the nose). Combined with
`doors.png`/`torches.png` from the first pack, that's enough to render
the whole map except one layer. `content/story.json`'s "The Escape" act
now points at the real map and is playable end to end for the window
mechanic.

**What's rendering:** Floor, Floor Texture, Walls, Walls Front, Outer
wall, and most of Decor items (torches, plates, most objects).

**What's not:** ~53 tiles (50 in Decor items, 3 in Decor items 2) still
need `other_objects.tsx`/its image, which is the one file across this
whole back-and-forth I never actually got. Those tiles are just blanked
(render as nothing) rather than breaking anything. Not urgent, it's a
small fraction of one layer.

**Two real bugs found and fixed while wiring this up, not map issues:**

1. The door open/close animation heuristic (`getDoorFrameInfo` in
   `overworld.js`) assumed the "held open" frame would be the one that
   repeats most in the frame list, true for the estate's doors, not true
   for yours, which marks "held" with one long duration instead of
   repeats. Fixed to use total accumulated time per frame instead of
   occurrence count, works for both authoring styles now.
2. Multiplayer zone rooms were only ever assigned by walking through a
   zone_exit object. Starting a brand new act at a different zone (like
   this one) never told the server which zone-room to put a player in,
   they'd have stayed registered in `estate` and never received the
   plate/door events at all. Fixed generally, not just for this map, any
   future `explore` act that declares its own `"zone"` in story.json now
   gets this handled automatically.

## Still not built

The graffiti, the notebook pages, the false-trail notes, the tunnel maze,
and the Guild Hall Basement (what's past the exit, which currently leads
nowhere since that zone doesn't exist yet) are all still outstanding, per
the design doc. The window/plate escape itself is real and testable.

Each cell now has its own spawn point (`spawnPoints` in the map JSON),
assigned to players by their stable join order, so the party actually
starts split up across the 5 cells rather than stacked on one tile. This
was a real gap in the engine before this map needed it, every map before
this one only ever had a single shared spawn point.
