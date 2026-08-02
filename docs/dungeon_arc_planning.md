# Post-jail dungeon arc - planning status

Covers Area 1 through the Sewers, i.e. everything between the jail escape
and reaching Corwin at the Guild Hall. **Update: this entire arc is now
built and complete**, verified directly against the shipped files. This
doc is kept for the historical design reasoning (why Area 3 ended up as
candles not statues, why the mouse sprite was chosen, etc), rewritten
below to reflect what actually shipped rather than what was still open.

## A naming note, worth knowing before reading further

This doc originally called the rat maze "Area 4." In the shipped game, the
maze is `dungeon_area_5.json`. `dungeon_area_4.json` (plus its four
sub-rooms: kennels, ossuary, treasury, lower_stores) ended up being a
different room entirely, a storage/crypt area with its own separate
key-and-locked-door puzzle chain. If cross-referencing this doc against
the codebase, mentally substitute "Area 5" wherever this doc says
"Area 4 - the rat maze."

## The actual built structure

1. **jail_cells.json** - the escape. Pressure plates open cell doors for
   each other in a full 5-cell loop (cell1's plate opens cell2's door,
   ... cell5's plate opens cell1's door). Playable, complete.
2. **dungeon_area_2.json** - seeds clues. 3 notebook pages and 2 chests,
   all with real written content in `interactions.json`, plus the "The
   Rats Know" and "Don't Trust a Nun" graffiti.
3. **dungeon_area_3.json** - the directional puzzle. Built using the
   candle/shrine approach (see "Area 3 decision" below), a 4-candle
   sequence puzzle (north, west, south, east) gated behind a lever, real
   content in `candlePuzzles.dungeon_area_3`.
4. **dungeon_area_4.json** (+ kennels/ossuary/treasury/lower_stores) - a
   storage/crypt complex, side rooms with flavor content plus a real
   3-step puzzle chain: search a crate twice for a hidden key, use the
   key to open a locked chest, the chest grants a second key that opens
   the Lower Stores door forward.
5. **dungeon_area_5.json** - the rat maze (this is what earlier drafts of
   this doc called "Area 4"). Built from Elle's Tiled export, collision
   rebuilt using the PLAN/PLAN OFFSET 16/PLAN OFFSET 32 guide-layer
   convention. 5 mice placed at Elle's marked positions, animated
   (idle loop), footprint-checked against nearby walls so none visually
   overlap. **Currently decorative only** - see "Traps: deliberately
   deferred" below, this was a real design decision, not an oversight.
6. **dungeon_area_6.json** - a traversal corridor, no puzzle, connects
   the maze to the finale.
7. **dungeon_finale.json** - the sewer grate room. A lever opens the exit
   gate (real door-opening animation built from the actual tileset's
   column-block frame layout, not guessed), water and fire animations
   wired from real tileset frame data, broadcasts a party-wide "X pulled
   the lever" dialogue line.
8. **outside_sewer.json** - the surface. Hook's "Out of the Sewers" staged
   scene plays here immediately on exit (this act was originally
   misplaced at the very end of `story.json`'s acts array, after the
   finale/epilogue, making it unreachable - fixed by moving it to its
   correct position right after "The Dungeons").

## Traps: deliberately deferred

The original plan called for rats showing the correct path through the
maze, with wrong turns leading to solo or whole-party send-back traps.
None of that logic is built. This was discussed and confirmed as
intentionally out of scope for now (Elle: "we haven't included the traps,
let's just leave it be for that"), not forgotten. If revisited later, the
open questions from the original plan still stand:
- Whether triggering a trap gets any feedback (a Thorne/Corwin line, a
  sound cue) or is a silent teleport.
- Where the "correct route" data actually comes from - Elle's rough
  PATH OUT polygon sketch (present in the original Tiled export) was
  deliberately not encoded into game data, since it wasn't drawn to be
  collision-accurate. Turning that into real pathing data, or deciding on
  a cleaner authoring method, would be the first step.
- How many solo-send-back traps vs. the rare whole-party one, and
  specific placement.

## The graffiti (all three placed, jail_cells + Area 2)

- **"North Isn't North"** - jail_cells.json. Contains the actual answer to
  the Area 3 puzzle (not just a warning), so Area 3 was built as a
  challenge to *apply* the direction under pressure, not to *find* it.
- **"The Rats Know"** - dungeon_area_2.json. Ties to the maze; rats were
  meant to show the real path (see "Traps: deliberately deferred" above).
- **"Don't Trust a Nun"** - dungeon_area_2.json. Foreshadowing for the
  still-unbuilt Into Town chapter (the chapel's nun-always-lies mechanic
  in `MEANS_AND_OPPORTUNITY_SPEC.md`), no mechanical function in the
  dungeon itself.

Engine note: images render via a generic `mapData.images` array (position,
size, native aspect ratio, proper Y-sort against the wall it's mounted on)
- a reusable capability, not graffiti-specific.

## Area 3 decision (resolved)

The candle/shrine approach was the one built, not the statue-rotation
concept. Worth keeping the original reasoning on record: genuine statue
sprites exist in the dungeon tileset (a hooded knight, a praying robed
figure) but only in one fixed front-facing pose each, with no
left/right/back variants in either CraftPix pack used. True "rotate the
statue to face a direction" would need new custom art and can't be faked
with a rotation transform (a flat front-facing sprite just tilts sideways
under rotation, doesn't show a different facing). The candle version was
fully buildable with existing assets (`candles.png`, matching the
ghost-flame torches already used throughout the dungeon) and was the path
taken: a 4-candle sequence puzzle, activate in the true order derived
from the graffiti's offset, gated by a lever.

## Mouse/rat sprite (resolved, now placed)

`MouseIdle.png` (32x32 per frame, genuine native-resolution chunky pixel
art, transparent background) was the sprite chosen and is now placed at
5 positions in dungeon_area_5.json, idle-animated. Worth keeping the
rejected-candidate reasoning on record in case rat/mouse art comes up
again:
- `Rat1_Idle/Walk/Run_with_shadow.png` - best-structured (proper
  4-direction sheets, matches the project's `cell:32, cols:6, rows:4` NPC
  convention exactly) but drawn with fine soft-shaded detail that doesn't
  match the flat chunky CraftPix style, the same mismatch that got the
  orc NPC rolled back earlier in the project.
- A "gray pixelated rat" webp - same soft-shading mismatch, plus only one
  static pose, no animation.
- `fabled-frame-small-rat2.gif` - watermarked marketplace preview, not a
  usable asset as uploaded.
- `TfEC3f.gif` - genuinely low native resolution (confirmed by checking
  for clean pixel-block upscaling) but the silhouette doesn't clearly
  read as a rat.

**Known limitation, still true:** the chosen sheet is single-direction
(side-view, facing left). Left/right can be mirrored in code for free.
True up/down-facing poses don't exist in this set - not an issue for the
current decorative placement, would matter if the trap/pathing mechanic
above ever wants a rat running toward/away from the camera.

Only `MouseIdle.png` has been sent and wired in. The full originally-
planned set (`MouseRun`, `MouseEat`, `MouseDamage`, `MouseDie`) would be
needed if the path-showing/trap mechanic gets built later, since that
design calls for more than an idle loop (running to indicate direction,
damage/die as trap feedback).
