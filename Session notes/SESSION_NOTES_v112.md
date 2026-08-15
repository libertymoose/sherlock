# v112 delivery notes

A bug-fix pass from your 5 screenshots plus the accompanying list. Nine
items, all grounded in the real source (no guessed fixes).

## 1. Dialogue cut off

Real bug in `paginateIntoContainer` (client.js): a single long paragraph
with no `\n\n` break inside it could never be paginated, because the
split-guard only ever breaks *between* elements, not within one. That
paragraph just silently overflowed past the box's `overflow:hidden`
edge with no continue indicator. Confirmed directly against Ashgate's
line in `interactions.json`, matching your screenshot exactly.

Fixed with a new `splitToFit` helper: any paragraph that doesn't fit the
box on its own now gets recursively split on sentence boundaries first,
falling back to word boundaries for a single very long run-on sentence.
Every dialogue and document entry in the game goes through this same
path, so this isn't a one-off fix for Ashgate's line specifically.

## 2. Inventory scroll bar

`.modal-box` set `overflow-y: auto` but never set `overflow-x`. Per the
CSS overflow spec, a browser then silently promotes the unset axis to
`auto` too, so a one/two-pixel sub-pixel rounding overflow from the item
grid was enough to show a horizontal scrollbar under a single-item
inventory that never needed to scroll sideways. Added `overflow-x:
hidden`.

## 3 & 4. Dialogue box size + Act 3 portraits

Collapsed the old three-tier box sizing (210px illustrated portrait /
130px sprite portrait / an unstyled "compact" fallback that silently
inherited 210px) into one fixed 170px height, used everywhere - the
middle ground you asked for.

Also found the actual reason Act 3 NPCs like the Armour Seller looked
different: they're baked into tile layers with no `look` or `portrait`
field at all, so they fell into that no-portrait compact path. Built a
real fix - `Overworld.getSpriteCutoutFrame()` plus `drawCutoutPortrait()`
in client.js - that composites a live portrait straight from an NPC's
own `spriteCutout` tile data. Any cutout-based NPC now gets a proper
portrait in the same 170px box as everyone else.

## 5. Act 3 fixes missing from the Inn

`tavern_1st_floor.json` had three dedicated character layers
(`Characters1/2/3`) with 12 baked NPCs and zero `spriteCutouts` - the
exact bug Training Ground had before it was fixed. Generated real
cutouts (flood-fill blob detection, nearest-object matching, alpha-
trimmed bounding boxes read straight from the actual tileset PNGs,
unioned across each tile's animation frames) and visually verified the
output before writing it in. `tavern_2nd_floor.json`'s "sleeping guy"
had the same oversized-baked-NPC problem and no object at all to anchor
a cutout to, so I added a small flavor object for it too.

## 6. Inn upstairs now inaccessible

The staircase itself (collision, both columns, the landing) is now
blocked. The old working zone_exit at the foot of the stairs is now a
note: "The stairs up are roped off... Book a room at the bar if you
need one." The 2nd floor zone file is untouched and still exists, just
unreachable from play - which is intentional, not a bug, so don't be
alarmed if a reachability check ever flags it.

## 7. Chapel NPC overlap

Found the real cause: a parishioner's baked tiles and a monk's baked
tiles occupied the exact same map cells (verified by diffing every
character layer's occupied cells against every other one - two cells,
(15,10) and (15,11), had both). Shifted the parishioner's block one
tile over and moved its object marker to match. Zero overlapping cells
remain anywhere in the chapel now.

## 8. Animation looping

This turned out to be a real, fairly serious bug, not just a couple of
maps needing tuning. The door/window "open once, hold, close once"
state machine depends on `gatedCells` - a per-layer, per-tile mapping to
a trigger zone - but that data is precomputed at conversion time and
simply never got generated for most of Act 3. Any animated tile with no
`gatedCells` entry falls through to the ambient "loop forever" branch,
which is correct for water/torches/candles/character idles but wrong
for doors and windows.

Went through every Act 3 map's animated tiles by hand: most of what's
in the chapel, mage tower, and manor upper floor really is ambient
(monks, the altar, a demon statue, lightning, a dragon child) and is
correctly left alone. Two places had genuine door/window tiles with no
gating at all - `tavern_1st_floor.json` (two back doors, one side door,
two standalone windows) and `town_exterior.json` (the tavern and glass
workshop building exteriors) - and now have real `animationZones` +
`gatedCells` built the same way manor_ground's interior doors work.

## Not fixed this pass: door interact-point depth

Sampled a few zone_exit objects against their real collision data and
the picture wasn't consistent - one looked correctly placed at the
threshold, another had no door gap in collision at all near it. With 40+
interact points across 20+ maps built from different tile packs, I
didn't want to bulk-move them from data alone without either your
screenshots of the specific ones that read wrong, or a look at each in
an actual session - moving a correct one into a wall would be a worse
regression than leaving this one for next time.

## Validation run before packaging

- JSON-parsed all 33 files under `content/` and `public/assets/maps/`
- `node --check` on `server.js`, `client.js`, `overworld.js`
- CSS brace count
- em-dash grep across every touched file
- BFS reachability, spawn to every object, across every map in the
  project (not just the ones touched this pass) - the only flagged
  object is the tavern's 2nd-floor sleeping guest, which is supposed to
  be unreachable now per item 6 above

## Merge note

A second, separately-started v112 came in with early Herbalist's Hut work
(`herbalist_hut_exterior.json`, `herbalist_interior.json`, their mapsrc
assets, and a new `herbalist` NPC look) built on top of the *pre-bugfix*
v111, not on top of the fixes above. Diffed both branches structurally
against each other rather than just overwriting one with the other:

- `content/story.json`, `interactions.json`, `items.json` were byte-for-
  byte identical between the two branches - the Herbalist's Hut act
  itself is still the placeholder text from `PROJECT_HANDOFF.md` §9, not
  wired up yet, so there was nothing to reconcile there.
- The only genuine new content on the herbalist branch, once the two
  maps/assets themselves were set aside, was one new entry in
  `npcs/looks/manifest.json` (the `herbalist` look) and two `ZONE_MAPS`
  lines in `client.js`. Everything else that differed was just that
  branch predating this session's bug fixes - not merged back in, since
  doing so would have reverted the pagination fix, the dialogue box
  sizing, and the rest.
- One small wiring gap closed along the way, not a design decision: the
  new `npc_herbalist` map object had no `look` field set even though the
  matching sprite and manifest entry both already existed, so it would
  have shown no portrait at all. Set `"look": "herbalist"` on it so it
  renders consistently with every other look-based NPC in the game.
- Both new maps pass the same reachability check as everything else.
  Neither has real puzzle/dialogue content yet (both still carry
  `[PLACEHOLDER: ...]` text) - that's expected, matching the "still
  design-only" status in `PROJECT_HANDOFF.md` §9, not something this
  merge should have tried to fill in on its own.
