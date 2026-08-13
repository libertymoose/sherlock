# v106 delivery notes - NPC scaling, done properly, one area at a time

This is the "cut the character out of their own tile placement, redraw at
the right size in the same spot, keep the animation live" system, built
and applied to the three zones you asked for: Training Ground, Blacksmith,
and both floors of the Mage Tower interior. Nothing else touched.

## What's actually in this delivery

8 characters converted: the 5 Training Ground fighters, the blacksmith,
and the warlock/mage on the Mage Tower's two floors.

For each one:

1. **Found their real tile group**, not by guessing a radius around their
   object position, but by checking which specific tileset the tile
   directly under their position belongs to, then only collecting nearby
   tiles from that same tileset. This mattered - several of these
   characters stand close enough to another character or to unrelated
   furniture that a naive "everything nearby" search would have grabbed
   wrong pixels. The blacksmith specifically doesn't sit exactly under his
   own object marker (he's fused into the forge artwork a couple tiles
   over), so that one needed a direct search for his tileset rather than
   trusting the object position at all.
2. **Verified each one by actually rendering it**, not just trusting the
   tile list - every one of the 8 got composited and visually checked
   before going anywhere near the map data.
3. **Removed exactly those tiles from the original layer**, and nothing
   else - the mannequins, forge, pentagram, weapon racks all stay exactly
   as you placed them, on their own untouched layers.
4. **Redraw them live, every frame**, using the same animated-tile lookup
   that already drives every other animation in the game (water, fire,
   doors, everything). This isn't a snapshot - a sparring swing or a wave
   keeps playing, driven by the same clock as everything else, not frozen
   or running on its own separate timer.
5. **Anchored at their own feet**, not their tile block's corner, so
   shrinking them doesn't move where they're standing or float them off
   the ground.
6. **Drawn at the same size constant every other NPC in the game already
   uses** - so they're now sized consistently with the player and with
   Corwin, Thorne, and everyone else in Act 1 and 2, not against some new
   number invented for this.

## What this deliberately doesn't touch

Walls, floors, weapon racks, benches, the pentagram, the forge, the
mannequins - none of it was rescaled or moved. Only the 8 characters
themselves changed size. This was the whole point of building it this
way instead of the earlier world-shrink approach.

## Validation before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. Simulated the exact same compositing
math used in the browser in Python against the real map data and
rendered it, to catch positioning bugs before they'd ever show up live -
matched the manually-verified isolated character renders exactly.
Confirmed the original 29 tiles across the 4 maps are genuinely zeroed
out of their source layers, not just visually covered.

## Still to do, once this is confirmed working

The rest of Act 3 wasn't touched this round - Chapel, Market, Tavern,
Glass Workshop, Town Exterior, Guild Hall all still have their NPCs at
native baked size. Once you've had a chance to look at these three zones
live, the same process extends to the rest.
