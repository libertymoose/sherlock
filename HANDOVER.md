# Handover — A Study in Boralus, picking up after v123

This replaces the earlier handover from v122. Paste this as the first
message in a new chat, then attach the v123 zip.

## Where things actually stand

- **v123 is packaged and validated** (JSON-parsed everything under
  `content/` and `public/assets/maps/`, `node --check` on all three JS
  files, em-dash grep clean) but has **not been confirmed live by Elle
  yet**.
- This was a very large bug-fix pass covering Acts 1 through 4, spanning
  several sessions worth of reports all resolved together. Keep
  incrementing normally (v124 next) from here.

## What's fixed and validated in this handover's scope

### Act 1
- The document modal's "Pick Up" button now only appears once every page
  of the item's intro text has actually been read (was previously always
  visible, overlapping the pagination text).
- The three unnamed "A Gala Guest" NPCs are now named (Baron Rutger
  Vayne, Old Salt Pemberton, Lady Prudence Harcourt) consistently across
  the map object, dialogue title, and suspect board pool.
- Added a "Review the Attendees" button next to "Review the Evidence" on
  the Suspect Board - opens a new reference modal with one line per
  named character (12 entries), purely descriptive, no suspect/evidence
  information attached, so the party can keep track of who's who without
  it doing any of the deduction for them.
- Thorne's hint text on the Suspect Board now shrinks to fit on a single
  line via a small `fitTextToOneLine` helper, instead of wrapping.
- Manor upstairs chest/movement/cutscene-framing fixes from the previous
  session (chest repositioned from a broken (4,13) to the real (3,5) per
  Elle's TMX, the map's dead top 2 rows trimmed, cutscene actor/camera
  coordinates shifted to match) are confirmed still intact.

### Act 2 (The Dungeons)
- Kennels: the urn's interact point moved 1 row down, and the hub's
  entry point into the Kennels moved 3 rows north, closer to the return
  door.
- Lower Stores corridor: a 2x2 decorative prop wrongly marked as
  collision-blocking (just above the stairs down to the maze) cleared.
- Maze collision confirmed still correct, no changes needed.
- The sewer exit cutscene ("Out of the Sewers") now has real water idle
  animation - translated the actual Tiled animation data from the
  sibling underground map (`dungeon_finale.json`, which uses the same
  source sheet in a darker palette variant) rather than guessing at a
  frame pattern.

### Act 3 (Means and Opportunity)
- Reveal text reformatted to Elle's exact requested line breaks,
  including the added "He winks at you" beat.
- **Guild Hall interior "no map" bug found and fixed.** Both
  `guild_hall_ground.json` and `guild_hall_upper.json` had a broken
  phantom tileset entry (`x500.png`, `firstgid:1, lastgid:0`) pointing
  at a file that's never existed in the project. Confirmed via Elle's
  real asset pack that the Floor layer's actual gids resolve to genuine
  wood-plank/rug art in `Walls_interior.png` - the renderer was already
  silently falling through to that correct art past the broken entry,
  so removing the dead stub was a safe, verified cleanup.
- Blacksmith: interact point moved to (11,11), matching where the
  smith's own sprite cutout actually renders (was 2+ tiles off at
  (13,11)). Forge glow and the smith's hammering animation both now use
  real frame data extracted directly from Elle's Tiled source
  (`Blacksmith_house_interior.tmx` / `Blackmith_character.tmx`) - my
  first-pass inferred versions of both turned out to match this real
  data exactly, so no changes were needed there once the source arrived,
  but the torch animation (which I'd left unwired, since the sheet has
  multiple torch instances at different offsets I couldn't confidently
  separate without the source) is now wired for real using the actual
  extracted `<tile><animation>` blocks - 21 placed torch tiles all have
  correct frame data now.
- **Dragon wing clipping fixed for real, not guessed.** Root cause: the
  Wing layer's tiles form one continuous 8-row vertical run in every
  column, and the engine's "tall object" sort rule (correctly used for
  trees/columns) collapses a whole run to one shared sort key equal to
  its bottommost row. For a sprawling wing, that meant even the topmost
  wingtip tile behaved as if it sat at the wing's base, hiding the
  player anywhere near it. Reclassified Wing from `sorted` to `floor`
  kind and removed it from the dragon's `layerGroups` entry - it's
  decorative background art draped over open ground, not something a
  player legitimately walks behind, so it never needed to participate in
  Y-sorting at all. Confirmed the grass underneath the whole wing is
  walkable.
- **Grass border clipping (systemic, "everywhere in Act 3") found and
  fixed.** A layer named `details` (small ground decoration - grass
  tufts, flowers, pebbles) was marked `sorted` in both
  `training_ground.json` and `town_exterior.json`, the two main outdoor
  Act 3 maps, with runs up to 35 tiles tall in a single column - the
  same bug class as the wing. 87% of its tiles sit on plain walkable
  ground, confirming it's ambient decoration. Reclassified to `floor` in
  both maps. Also explicitly checked the `trees` layer in
  `town_exterior.json` as the other obvious suspect: every single tree
  tile sits on real collision (100%), so trees are genuinely solid and
  correctly excluded from this fix. Scanned every other Act 3 map for
  the same tall-run pattern; the only other hits were archery target
  poles and blacksmith walls, both of which should legitimately occlude
  the player, so left alone.
- Mage tower, warlock floor (1st floor):
  - Fixed the actual root cause of the "random NPC near the warlock"
    report: any object with `type: "npc"` was unconditionally drawn via
    the look-based `drawNpc()` fallback (defaulting to a generic
    "citizen1" sprite) even when that same object also had a
    spriteCutout entry meant to be its *only* rendering path. This
    produced a second, unintended character at the object's raw tile
    position alongside the real cutout art - a project-wide rendering
    bug, not specific to the warlock, now fixed for every cutout NPC.
    Added proper name-label support directly to the cutout draw loop so
    this fix doesn't regress the warlock's own name tag.
  - Row 7 (x5-9) made fully walkable so the player can walk behind the
    demon rather than being blocked.
  - Head warlock interact point moved to (7,6) (left of (8,6), matching
    where the cutout actually renders), and that tile's collision
    cleared.
  - Stairs down moved to (10,9), stairs up moved to (10,8), both now
    show a visible green marker dot.
  - **Demon summon/despawn animation rebuilt using the real sprite
    sheet, not a generic fade.** Inspected `Demon.png` directly - it's a
    5x4 grid of frame-blocks: 5 frames of smoke swirling into the demon
    (summon), 10 idle frames, 3 frames of it dissolving into scattered
    dust (despawn). The map's animation data already had this exact
    18-frame sequence wired as a simple loop. Rebuilt each of the 17
    demon base gids' frame arrays into: summon (5 frames, unchanged) +
    idle held for ~3s (the real 10-frame idle block repeated twice) +
    despawn (3 frames, unchanged) + a 1-second gap using a `gid: 0`
    frame, which the renderer already treats as "draw nothing." Full
    cycle is 5.2s, looping forever, entirely real authored art with no
    opacity tricks. (An earlier pass had layered a generic engine-level
    opacity fade on top of this same animation instead of using the real
    frames - that `fadeInLayers` config has been removed from this map
    now that it's unnecessary; the generic capability is still available
    in `overworld.js` if some other object genuinely needs a plain
    fade-in with no authored transition art of its own.)
- Mage tower, mage floor (2nd floor):
  - Head mage interact point moved to (7,6), matching the cutout's real
    render position (was at (6,4), well off from the sprite).
  - Stairs down now shows a visible green marker dot.
- Mage tower, basement (ground floor):
  - Stairs up now shows a visible green marker dot (was already at the
    correct (12,7) position, just not visibly marked).
  - Fixed the return-landing spot when coming back down from the 1st
    floor: now lands at (12,6), matching Elle's request, with that
    tile's collision cleared.
- The dragon riddle at the training ground statue now forces a genuine
  page break between the setup line and the riddle itself. Added a new
  "triple newline forces a new page" convention to the pagination
  engine (`\n\n\n`), distinct from the existing `\n\n` paragraph-break
  convention, since the existing auto-fit pagination would happily pack
  both onto one page if there was room.
- **Herbalist's Hut exterior (still chapter 4's opening zone) had 19
  tiles with unstripped Tiled flip-bit gids** (raw values over 2 billion
  instead of the actual tile id) in the grass, grass-details,
  small-flowers, and birds layers - these were rendering as invisible
  gaps. Stripped with the project's own documented `gid & 0x1FFFFFFF`
  convention.

### Act 4 (The Herbalist) - the actual "no working map" bug
**Root cause found: `herbalist_interior.json` (the room with the actual
cauldron puzzle) was missing `"dense": true` on every single layer** -
confirmed by comparing against every other map in the project, which all
set this flag. Without it, the layer-resolving code fell into the
sparse-cell code path and tried to call `.forEach()` on a `cells` array
that was never populated (this map only ever had the flat `data` array),
throwing on nearly every non-floor layer: the lantern, both racks, the
table, both box/sack layers, the dried greens. This is exactly why the
room looked broken - most of its furniture layers were failing to render
the moment the zone loaded. Set `dense: true` on all 18 layers and
confirmed every layer's data length still matches the map's 32x32
dimensions, so nothing else is corrupted underneath.

## Investigated, not resolved - still needs more info

- **"The maid should not be in the herbalist area at all."** Traced
  every reference to the maid actor/sprite across the whole project -
  `content/story.json`, every map file, `server.js`, `client.js` - and
  found nothing that places her in `herbalist_hut_exterior.json` or
  `herbalist_interior.json`. Both maps' own object lists were checked by
  hand; neither contains a maid object, a `citizen6` look reference, or
  a spriteCutout referencing her. The staged-scene cleanup code
  (`Overworld.stop()` clearing `stagedScene = null`) also looks correct
  and runs before every zone transition. Given the `herbalist_interior`
  `dense` bug above was serious enough to break most of that room's
  rendering, it's possible this report was actually a symptom of that
  same crash (a stale previous zone's contents still showing through
  when the new one fails to render) rather than a genuine maid-placement
  bug - worth re-testing after this fix before digging further. If she's
  still showing up, the next thing to ask for is exactly what's being
  seen (her sprite standing there, her dialogue firing, her name showing
  up somewhere) since that determines whether this is visual, data, or
  dialogue-related.

## Key technical patterns worth remembering (carried forward + new)

- **A layer's `dense: true` flag is not optional and has no safe
  default** - every other map in the project sets it, and one map
  (`herbalist_interior.json`) silently didn't, which broke nearly every
  furniture layer in that room. Worth a quick project-wide grep for any
  other map missing this flag before it causes a second "no working
  map" report somewhere else.
- **A `sorted` layer with long vertical runs in a single column silently
  hides the player near the top of that run**, because the "tall
  object" sort rule (needed for trees/columns to stay visually intact)
  collapses the *entire* run to one shared sort key equal to its bottom
  row. This is now a confirmed, recurring bug class (the dragon wing,
  the `details` ground-decoration layer in two separate maps) - any
  future "player disappears near X" report should check whether X is a
  wide/tall decorative layer that never needed real Y-sorting in the
  first place, versus genuinely solid terrain like trees (which are
  correctly excluded - checked via 100% collision overlap).
- **A `type: "npc"` object with a spriteCutout entry still fell through
  to the generic look-based fallback sprite** unless explicitly
  excluded - this was a project-wide rendering bug (fixed now), not
  specific to any one NPC. Any *new* cutout-based NPC added in the
  future needs to go through this same exclusion path automatically, so
  this shouldn't recur, but worth remembering if a similar "phantom
  extra character" report comes up for a map added later.
- **Before spending time inferring animation frame data from grid
  layout alone, check whether the actual Tiled source or asset pack is
  available first** - the torch animation guess was correctly withheld
  pending the real source, and the demon "fade" turned out to be
  actively wrong because the real summon/despawn art was already present
  in the map's own animation data the whole time, just being played as
  a simple loop instead of a scripted sequence with proper hold/pause
  timing.
- **A `\n\n\n` (triple newline) now forces a hard page break** in the
  shared VN/document pagination engine (`paginateIntoContainer` in
  `client.js`), distinct from the existing `\n\n` paragraph-break
  convention which only breaks pages when content actually overflows.
  Use this for any two-part reveal (like the dragon riddle) that needs
  to land as two separate beats regardless of how much room is left on
  the first page.
- **Raw gid values encode flip bits in the top 3 bits** - strip with
  `gid & 0x1FFFFFFF` before lookup. Found a second real instance of this
  in `herbalist_hut_exterior.json` (19 tiles) - worth a project-wide
  sweep for any other map with gids above the theoretical max (compare
  against the highest declared tileset `lastgid`) before assuming a
  "missing decoration" report is content-related rather than this.

## Standing project rules (unchanged, still apply)

- No em-dashes anywhere, ever - code, comments, dialogue, docs.
- Version number increments with every delivered zip, no exceptions.
- BFS reachability check mandatory after any collision-touching change -
  spawn to every object, every map touched, before packaging.
- Full validation pipeline before every delivery: JSON-parse everything
  under `content/` and `public/assets/maps/`, `node --check` on
  `server.js`/`client.js`/`overworld.js`, CSS brace-balance check,
  em-dash grep.
- Source files (Elle's own Tiled exports and real asset packs) are
  authoritative over whatever's already converted or inferred - when a
  real source arrives after a guessed fix, always re-verify (or replace)
  the guess against it rather than assuming the guess was close enough.
- Elle always tests the latest deployed build - if something reported
  as broken looks correct in the current data, ask which exact version
  she's testing rather than assuming the report is wrong or that the
  build is stale without checking.
- Discuss significant design/scope decisions before building; Elle's
  corrective feedback is direct and authoritative over whatever was
  previously implemented. When a fix requires a judgment call in the
  absence of an explicit instruction, make the call, ship it, but flag
  it clearly rather than presenting it as confirmed-correct.
- All of Act 3 is currently flagged P1 by Elle - treat bug reports from
  this act with urgency.
