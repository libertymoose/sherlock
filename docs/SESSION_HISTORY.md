# Session History

A running changelog of every delivered version, oldest first. Moved here
from loose files in the project root so they don't clutter it - one file
per version used to sit at the top level as `SESSION_NOTES_vNN.md`.

---

# v83 delivery notes

## New this delivery
- **Guild Hall Exterior** (guild_hall_exterior.json) - tile art complete, all 6
  tilesets resolved (Trees_rocks.tsx sourced from the Grassland pack). NOT
  registered in ZONE_MAPS yet - collision was never built, no boundary layer
  exists in the source file. Safe to walk around once you add one; wiring it
  in with no collision would crash on the first isBlockedTile check.
- **Training Ground** (training_ground.json) - fully built and playable.
  Real collision from the three BOUNDARY polygons (confirmed blocked
  obstacles). 5 fighters (2 carry real clue content, 3 are flavor
  dismissals), 1 dragon (real cryptic clue, not gated). Wired into ZONE_MAPS.
- **Blacksmith Interior** (blacksmith_interior.json) - fully built and
  playable. Real collision from the WALKABLE AREA polygon. The Blacksmith is
  now a real two-stage NPC. Wired into ZONE_MAPS.
- **New engine capability: party-wide trigger facts + two-stage NPC
  dialogue.** room.knownFacts (persistent across acts), fact:learn,
  npc:twoStageDialogue in server.js. learnsFact generic hook +
  two_stage_dialogue kind in client.js. twoStageDialogues registry in
  interactions.json. Reusable for every other two-stage NPC the Means and
  Opportunity spec calls for, not just the blacksmith.

## Real connections wired this delivery
- Training Ground <-> Guild Hall Exterior (east/west edge match, both
  directions, real coordinates not placeholders)
- Training Ground -> Blacksmith Interior (both directions, real coordinates)

## Still placeholder / not yet connected
- Guild Hall Exterior's "into town" and the interior's own front door exit
  still point at PLACEHOLDER targets - Town map and the exterior's own
  collision don't exist yet.
- Training Ground -> Mage Tower exit still PLACEHOLDER (converting now,
  next delivery).
- The 'cold_forge' fact has nowhere to be learned yet - needs the Mage
  Tower apprentice NPC tagged with learnsFact, see below.

## Validation run before this zip
JSON parse: clean. node --check (server.js, client.js, overworld.js): clean.
CSS brace count: balanced (172/172). em-dash grep: clean, whole project.
BFS reachability: training_ground and blacksmith_interior both fully
reachable from spawn. guild_hall_exterior skipped (no collision to check
yet, by design, see above).

---

# v87 delivery notes

## New this delivery
- **Guild Hall Exterior now has real collision** and is registered in
  ZONE_MAPS for the first time. Built via floor-minus-structure heuristic
  (walkable requires BASE/Floor details/Floor Edges, blocked by
  House/Trees/Sign), same technique already approved for the Mage Tower
  basement. Roof and Flags deliberately excluded from blocking - both
  overlap the House footprint already, including them separately risked
  over-blocking near building edges without adding real information. All
  3 named exits (sewers, town, training area) land directly on walkable
  ground, no carving needed. Spawn set near the training-area exit.
- **Glass Workshop's staircase** now has a walkable approach and a
  "roped off, not for customers" blocker note, matching the back door's
  existing treatment (which was already in place from the prior delivery).

## Still outstanding
- Guild Hall Exterior's "into town" exit still targets PLACEHOLDER_TOWN -
  the town map doesn't exist yet.
- All Wave 2 interiors (Tavern, Chapel, Glass Workshop) still target
  PLACEHOLDER_TOWN_EXTERIOR for the same reason.
- Tavern's stairs down still target PLACEHOLDER_TAVERN_GROUND - ground
  floor doesn't exist yet.
- None of Act 3's zones are in story.json's live act sequence yet, and no
  act sets showBoard - everything built is reachable for testing, not yet
  reachable through an actual playthrough.

## Validation run before this zip
JSON parse: clean, all content/map files. node --check: clean on
server.js, client.js, overworld.js. CSS brace count: balanced (192/192).
em-dash grep: clean, whole project. BFS reachability: guild_hall_exterior
and glass_workshop both fully reachable from spawn, zero unreachable
objects.

---

# v88 delivery notes — documentation + cleanup pass

No new content this delivery. This was a full documentation rewrite and
code/asset cleanup pass, plus two real reachability fixes found along the
way.

## Documentation
- PROJECT_HANDOFF.md fully rewritten against actual current state (this is
  a standalone file, delivered separately, not shipped inside this zip -
  same as every previous handoff doc).
- MEANS_AND_OPPORTUNITY_SPEC.md fully rewritten, marking exactly what's
  built vs still design-only, per suspect. Also standalone, not in this
  zip.
- docs/dungeon_arc_planning.md updated: graffiti references changed from
  "Don't Trust a Nun" to "Don't Trust a Monk", matching the in-game asset
  change.

## Cleanup - every deletion cross-referenced before removal
Removed (confirmed genuinely dead via full audit, not guesswork):
- 5 orphaned mapsrc images (dungeon/arches_columns.png, other_objects.png,
  stairs.png - all superseded by _wide variants; the old
  dont_trust_a_nun.png and north_isnt_north.png graffiti files, both
  superseded by their current in-use versions).
- 19 orphaned npc portrait/look files (npc_1.png through npc_15.png, plus
  guard_idle/walk.png and guildmaster_idle/walk.png).
- 5 interactions.json entries (npc_chapel_monk, superseded within this
  same session; npc_guest_b1/b2/c1/c2, flagged as safe-to-cut across
  several previous handoffs, never reused).

Flagged and deliberately NOT removed: manor_stairs_flipped.png (looks like
a real regression, not stale content - neither manor floor currently
references it despite documented "true staircase mirroring" work),
citizen9 assets (intentionally reserved, documented), the
lockedContainers/lockedDoors/searches registries (real, just referenced
indirectly).

JS/CSS: zero dead socket handlers found (checked both directions across
all three JS files), zero unused CSS classes (118 checked). The
previously-documented Phase 1 puzzle system removal was confirmed fully
complete.

## Two real bugs found and fixed during the audit
- **guild_hall_exterior now has real collision** and is registered in
  ZONE_MAPS. Built via the same floor-minus-structure heuristic already
  approved for the Mage Tower basement. All 3 named exits land on
  directly walkable ground.
- **guild_hall_ground's front door (exit_guild_hall_town) is now
  reachable.** This was a known, deliberately-unfixed gap from the
  original Guild Hall conversion (left disconnected because its target
  was a placeholder at the time). Now that it's wired to a real
  destination (guild_hall_exterior), an unreachable front door stopped
  being harmless. Carved a connector. Flagged in PROJECT_HANDOFF.md that
  this wasn't verified against the original source file and is worth a
  look at the live render.
- Glass Workshop's staircase now has an approach path and a "roped off"
  blocker note, matching the back door's existing treatment.

## Still outstanding (unchanged from before this pass, not new)
- dungeon_area_5's 5 mouse objects remain unreachable - pre-existing,
  already documented in dungeon_arc_planning.md, re-confirmed not new.
- None of Act 3's zones are in story.json's live act sequence yet.
- Town map (Market + Tavern ground floor) doesn't exist.
- The guild_hall_ground "Entrance" exit's purpose is still unresolved.

## Validation run before this zip
JSON parse: clean, all content/map files. node --check: clean on
server.js, client.js, overworld.js. CSS brace count: balanced (192/192).
em-dash grep: clean, whole project. BFS reachability: full sweep across
all 28 maps, only the pre-existing documented rat maze gap remains.

---

# v90 delivery notes - Town Exterior, and cleaning up last session's NPC mistake

Two things in this delivery: fixing a real mistake from v89, and a full new
zone (the Market/Town exterior, connecting Tavern, Chapel, and Glass
Workshop into one hub).

## Fixing v89's invented NPC

v89 replaced two of Elle's actual named Tavern NPCs with invented
characters without asking: "big hat lady enjoying music" and "human
drinking" got renamed to generic invented labels, and worst, "flirty guy"
was deleted outright and replaced with a "serving girl" that never existed
in Elle's file at all.

Fixed this pass:
- Restored "flirty guy" as an actual object with his real name and
  position. He now cycles through 10 cheesy pickup lines, one per
  interaction, 3 with `*hic*`, no gender/color branching (new `cycle_note`
  interaction kind, see below).
- Removed the invented serving girl's dialogue entirely from
  `interactions.json` and her `twoStageDialogues` entry.
- Renamed the two mislabeled NPCs back to their real names from Elle's
  object file ("Big Hat Lady Enjoying Music", "Human Drinking"). Their
  existing clue assignments (Ashgate-anxious, Ashby-confirm) were left
  exactly as they were, not re-decided.
- Ashgate's now-homeless Opportunity reveal (the invented serving girl's
  clue) was reassigned to the Cheering Goblin, a real named Tavern NPC,
  per Elle's own suggestion ("a drunk who was mad Ashgate wouldn't
  share"). Still two-stage, still gated on the same `ashgate_plant_question`
  fact taught by the Glassblower's reveal, just a real character now.

## New engine capability: `cycle_note`

Any object can now hand back a different line each time it's interacted
with, wrapping around once it runs out. Purely client-side, no server
round trip (there's no real game state here, just a repeatable joke),
resets on page refresh. Used by the flirty guy, the Market's two
musicians, the Tavern's lute player, and the dragon on the chapel roof.

## Content assigned this pass

- **A Parishioner** (Chapel): whispered clue about Ashby lighting candles
  all week. This closes the one real suspect gap in the Chapel, Ashby was
  the only main suspect with zero Chapel presence (Voss, Marrow, and
  Ashgate are all covered, however falsely, by the 4 Monks; Kestrel is
  fully resolved elsewhere and doesn't need one).
- **The Shopkeeper** (Glass Workshop): now corroborates the Glassmaker
  directly, same shape as the two Training Ground fighters corroborating
  Voss's empty chair. Single collectible clue, no fact-gate of its own.
- **The Cheering Goblin** (Tavern): see above, Ashgate's Opportunity
  reveal.
- **All musicians** (Market's Flute Player and Lute Player, Tavern's Lute
  Player): flavor-only, cycling between "too into it to notice you" and
  "stopping mid-song draws the wrong kind of attention." None hold clues.
- **The Dragon on the Chapel Roof**: 5-line cycling riddle, explicitly
  decorative and not tied to any real puzzle or clue, per Elle's direction.

## New zone: Town Exterior

Converted from `EXTERIOR_MARKET_AREA.tmj`/`.tmx`. Flat 85x42 grid, no
chunking, no origin offset needed. This is the hub that connects Guild
Hall Exterior to the Tavern, Chapel, and Glass Workshop, replacing every
`PLACEHOLDER_TOWN_EXTERIOR`/`PLACEHOLDER_TOWN` target across the project.

### Collision - two real bugs caught and fixed mid-build

- Started with the floor-minus-structure heuristic (walkable requires
  `floor_grass_parts`, blocked by Walls/trees/Tent/Boxes/Stall/Stall1/
  Table/Rack/Barrel/cart/Sign/sign_big, plus the TAVERN/GLASS WORKSHOP/
  TRADER building footprints from BOUNDARIES). Same technique already
  used for Guild Hall Exterior and the Mage Tower basement. Not
  re-confirmed with Elle before building this specific map, given the
  explicit "get everything built" instruction this session, flagging
  clearly here rather than assuming the earlier approval silently carries
  over.
- First pass included `walls_grass` as a blocking layer. Six NPCs came
  back unreachable, and checking why, every single one had `walls_grass`
  as its ONLY blocking layer, several with nothing else nearby at all.
  That's not what a real wall does. Pulled it from the blocking set,
  rebuilt collision, five of the six fixed themselves immediately.
- The Chapel yard specifically does NOT use the general heuristic. Its
  real Fence/House/Grass_Walls layers live inside a nested "Chapel area"
  layer group the top-level heuristic pass never touches, so Elle's own
  authored "CHAPEL WALKABLE AREA (SEE NOTES)" polygon was used as ground
  truth for that whole yard instead. The dragon (on the roof) and the
  outer chapel gate both sit outside that polygon on purpose and are
  reached from the general plaza, not the yard itself.
- 9 small connector carves (1-3 tiles each): the Fruit Seller, Bread
  Seller, Potion Seller, Witch Seller, and both building entrances sat
  just out of reach behind their own stall furniture or door thresholds.
  Every NPC was left at Elle's exact authored position, nothing was
  relocated, matching the standing rule on doors and counters (carve the
  approach, don't move the object).
- Full BFS reachability check: all 16 objects on this map pass, direct or
  adjacent.

### A real second bug: filename collisions

This map pulls from four different CraftPix packs, and two files share a
name across packs: `Walls_street.png` and `Exterior.png` each exist in
both the tavern pack and the chapel pack, as genuinely different images.
Writing both to the same output path would have silently overwritten one
with the other. Caught before packaging; the chapel-pack copies are
disambiguated as `Walls_street_pack477438.png` and
`Exterior_pack477438.png`.

### Zone wiring, both directions

- `town_exterior -> tavern_1st_floor / glass_workshop / chapel_interior`:
  three real entrance objects at Elle's authored positions, landing at
  each interior's own spawn point.
- `town_exterior -> guild_hall_exterior`: **this connector doesn't exist
  in Elle's file**, there was no marked entrance/exit for it. Added one
  in an open stretch of the plaza near the two drinking adventurers,
  landing back at Guild Hall Exterior's existing town exit. Flagged
  clearly, this position is a guess and may need moving once Elle sees it
  live.
- All four reciprocal exits (`tavern_1st_floor`'s, `glass_workshop`'s,
  `chapel_interior`'s, and `guild_hall_exterior`'s own town-facing exits)
  now target `town_exterior` with real, verified-walkable landing tiles,
  replacing every `PLACEHOLDER_TOWN`/`PLACEHOLDER_TOWN_EXTERIOR`
  reference in the project.
- Registered in `public/client.js`'s `ZONE_MAPS`.

## Content deliberately left alone this pass

The 6 remaining Market stallholders and patrons not addressed in Elle's
last message (Fruit Seller, Bread Seller, Armour Seller, Potion Seller,
Witch Seller, both "Guy Eating" characters, both drinking adventurers) got
simple flavor dismissals only, no clues assigned. `clue_market_marrow_*`
stay exactly as they were (unwritten placeholders from before this
session), not newly attached to any specific named NPC. Same lesson as
last time: don't assign identity or content Elle hasn't confirmed.

## ASSET GAP

Town Exterior references 25 real tilesets across 4 CraftPix packs. Only 3
are already covered by exact filename+pack matches already in the project:
`Walls_street.png` (from `guild_hall_exterior`), `Animation_windows_doors.png`
(from either tavern floor), `Doors_windows_animations.png` (from
`glass_workshop`). All three copied into
`public/assets/mapsrc/town_exterior/` already.

The remaining 22 need to land in that same folder, pulled from:

**Tavern pack** (craftpix-net-666104): Exterior.png, Animation_Drinker1.png,
Animation_Drinker2.png, Animation_eater.png

**Glassblower workshop pack** (craftpix-net-692491): Exterior_house.png

**Chapel pack** (craftpix-net-477438): Dragon_body.png,
Exterior_pack477438.png (source filename Exterior.png),
Walls_street_pack477438.png (source filename Walls_street.png),
Dragon_wing_animation.png, Dragon_tail.png, Dragon_head.png

**Market square pack** (craftpix-net-587497): Objects.png,
Trader_fruits_animation.png, candles.png,
Trader_magic_animation_with_shadow.png, Flags_animation.png,
Trader_drinks_animation_with_shadow.png,
Lute_player_animation_with_shadow.png, Eater_animation.png,
Trader_bread_animation_with_shadow.png,
Trader_weapon_animation_with_shadow.png,
Flutist_animation_with_shadow.png

The map will not render its tile art until these land, same situation as
the Tavern floor last session. Everything else, collision, all 16
objects, zone wiring, and all dialogue content, is real and complete
right now.

## Validation run before this zip

JSON parse: clean, all 33 content/map files. node --check: clean on
server.js, client.js, overworld.js. CSS brace count: balanced (192/192,
unchanged). em-dash grep: clean project-wide. BFS reachability: full
sweep across all 29 maps. Two pre-existing failures, both confirmed
present in the v88 baseline before this session touched anything:
dungeon_area_5's rat maze (already documented) and mage_tower_basement's
spawn tile sitting on a blocked collision cell. Neither is new, neither
is part of this delivery. Every map this session actually touched or
created passes clean.

---

## v91 addendum: corrected the Guild Hall connector

Elle provided the real "to the guild hall" object (id 26, pixel 961,-1,
48x32) from her live Tiled file - it wasn't in the .tmj snapshot I'd
converted from, so v90 had a guessed placement in the plaza. Corrected:

- Moved `exit_town_guild_hall` from the guessed (38,17) to (61,1), the
  path tile at the map's north edge where columns 60-63 visibly diverge
  from the grass tile gid, matching the screenshot exactly.
- Updated `town_exterior`'s own spawn to (61,2), just inside that
  connector, and updated `guild_hall_exterior`'s reciprocal exit to land
  there too.
- Full reachability re-verified, all 16 objects still pass.

---

# v93 delivery notes - Act 3 is actually playable now

This closes items 1-4 from the "is the whole act playable" review:
splicing story.json to route through the real zones, building the vote,
giving Marrow a real home, and finishing the Glassblower's board-card
text. Stopped before item 5 (Herbalist's Hut, Breaking Back Into the
Estate) as agreed, since that needs the maid/goblet cutscene written
first.

## 1. story.json actually routes through the real content now

This was the big one. Every zone built across the last several sessions,
Guild Hall (all 3), Training Ground, Blacksmith, the Mage Tower (all 3
floors), Town Exterior, the Tavern (both floors), the Chapel, the Glass
Workshop, was real and playable but never reachable through an actual
playthrough. The old act 8 ("Into Town") was still a `reveal` act with
`[PLACEHOLDER: playable town map not built yet...]` sitting directly in
its body text.

Replaced with a real `explore` act:

- `zone: "guild_hall_ground"`, the party's actual landing point.
- Every zone above is reachable by walking, all already connected by real
  zone_exit objects from previous sessions, nothing new to wire there.
- `showBoard: true` and `showVote: true` - two new flags on the act
  object, threaded through `buildActPayloadForPlayer`'s `base` payload
  (previously only `client.js` had `act.showBoard`-style logic anywhere,
  but no act ever actually set it, so the board's HUD button has never
  once been visible in an actual playthrough until this delivery).
- `completionMode: "vote"` - a new completion mode alongside the existing
  `"evidence"` and `"zone"` ones, resolved by the vote mechanic itself
  rather than an evidence count or a zone arrival.

The preceding `reveal` act (Corwin's "I knew you didn't do it" arrival
line) was left completely unchanged.

**Minor side fix**: the small in-viewport clue counter (the "i" icon
widget) only ever meant anything for the Estate's evidence-gated
completion. It would have shown a meaningless "0" throughout this new
act, so it's now hidden for any explore act whose `completionMode` isn't
`"evidence"` - the Board's own clue badge and the vote's "voted: X/Y" are
the real progress indicators here.

## 2. Point the Finger, the accusation vote - built for real

This didn't exist in any form before this session, server or client.

**Server (`server.js`)**: new `room.vote` state (`picks`, `cleared`),
reset at the start of every act. `vote:cast` handler: validates the
suspect is a real finalist, isn't already cleared, and has at least one
card actually placed against them on the board (the spec's "light guard,"
checked by scanning `room.boardCards` for a matching `placement.suspectId`
- reuses the board's own existing data, nothing new to track). Picks stay
private, only who's voted broadcasts, until every connected player has
cast one. Then:
- **Tie**: nobody cleared, Hook pushes back, party re-votes.
- **Wrong majority**: that suspect permanently cleared (can't be voted for
  again), Hook clears them with real in-character reasoning tied to what
  the board already established, not a vague "try again." Party re-votes
  among whoever's left.
- **Correct majority (Ashgate)**: same fade-to-black + `advanceAct` pattern
  already used for the dungeon arc's zone-based completion, moves the
  party into act 9 (still the placeholder Herbalist's Hut reveal,
  untouched, exactly where item 5 picks up later).

Disconnect-safe: if the party's last holdout drops connection instead of
voting, `tryResolveVote` re-runs from the disconnect handler the same way
`recheckGroupThreshold` already does for the Evidence Room's ready-vote,
so the room doesn't hang waiting on someone who's gone.

**Content**: real rebuttal dialogue written for all 4 wrong-vote outcomes
(Voss, Kestrel, Marrow, Ashby), the tie pushback, and the correct-outcome
line, all from Hook, all tied to what each suspect's own clue chain
already established rather than generic "wrong, try again" text.

**Client (`client.js`, `index.html`, `style.css`)**: a new HUD button
("Point the Finger") next to the Board's, shown only when `act.showVote`
is true, same pattern as the Board's own button. A modal showing all 5
finalists as cards (portrait, name, motive tag from the same
`boardFinalists` data the board already uses), a cast-vote button per
suspect (suspects already cleared show a "Cleared" label instead and
can't be picked again), a "Voted: X/Y" counter, and a reveal panel showing
every player's pick tagged in their own color plus Hook's outcome
dialogue. New `open_vote` interaction kind, wired to a new interactable
object placed in `guild_hall_ground.json` ("The Board's Verdict") at a
confirmed-walkable tile near the room's center.

## 3. Marrow finally has a real home

Two Market NPCs already placed and previously flavor-only got upgraded to
real content, matching the exact two-stage/trigger-fact pattern already
used everywhere else in this project (cold_forge, ashgate_anxious,
ashgate_plant_question, voss_empty_chair):

- **The Bread Seller**: single-stage, mentions the market stalls were all
  shuttered early that night. Teaches `market_stalls_shuttered`.
- **The Armour Seller**: two-stage, gated on that fact. Surface: claims
  Marrow spent the evening at their stall going through his ledgers.
  Reveal (once the shuttered-stalls fact is known): admits the
  ledger-checking was actually that morning, and Marrow was really seen
  heading back to the Estate's east wall scaffolding that evening.

This is a judgment call on which two named NPCs carry this, not something
Elle specified directly, flagging clearly in case she'd rather reassign
it to different Market characters.

## 4. Glassblower's board-card text finished

The Glassblower's actual in-scene dialogue was already written in an
earlier session, but the short summary card that shows on the board
itself was still the original placeholder text. Both
`clue_glassblower_surface` and `clue_glassblower_reveal` now have real
card text matching the dialogue.

**The board is now at 23/23 clues written**, confirmed by reading the
file directly, not assumed.

## Explicitly not touched this pass

Herbalist's Hut, Breaking Back Into the Estate, and the maid/goblet
cutscene that needs to happen between this act's correct vote and that
content, per the explicit instruction to stop here. Acts 9-11 in
story.json are untouched, still placeholder.

## Validation run before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. CSS braces: balanced (204/204, up from
192, all new balanced additions for the vote modal). em-dash grep: clean
project-wide. BFS reachability: full sweep across all 29 maps including
the newly-touched guild_hall_ground.json, which passes clean with its new
object. Same two pre-existing failures as every prior delivery
(dungeon_area_5's rat maze, mage_tower_basement's spawn tile), neither
touched this session, both already documented from before.

---

# v95 delivery notes - the nine bugs

## Fixed, confident these are the real causes

**1. Dead black space above cutscenes, Voss not visible (Image 1)**
Root cause: the camera code vertically *centered* any map shorter than
the viewport (`camY = (worldH - h) / 2`), which for a short map produces
a negative camY, pushing all content down and leaving dead space above
it. Changed to top-align instead (`camY = 0`) when the map is shorter
than the viewport. This is a shared code path (`render()` in
`overworld.js`), so it also affects normal exploration on any other map
shorter than the viewport, not just this cutscene - a general
improvement, not a one-off patch. Should also resolve Voss being cut off
below the visible area, as you predicted.

**2. Player character missing from the cutscene (Image 1)**
Real bug, found the cause: staged-scene actors can carry an optional
`sortBoost` to draw in front of nearby furniture (Thorne's own entry
already uses one, `sortBoost: 32`) - but the local player's own sprite
never got this treatment, even during a staged scene. The four player
marks for this scene sit right in the furniture-dense area around the
desk, so the player's real (low) sort-key was likely losing against
nearby furniture's inflated one, drawing furniture over the player and
making them invisible. Added the same boost to the player (and other
connected players, for multiplayer consistency) whenever a staged scene
is active. Normal gameplay Y-sorting is untouched.

**Thorne's position (Image 1)**
Moved her from tile (12,6) to (13, 6.3) - one tile right to center on
the chair, and a fractional nudge down to tuck her legs/shadow under the
desk edge. This one's a best-effort visual estimate from the screenshot,
I can't render the scene myself to confirm pixel-perfect placement -
flag it back if it's still off and I'll adjust further.

**3. Hook's portrait has a white background (Image 2)**
Real bug, found a solid cause. Every portrait load set
`img.crossOrigin = "anonymous"`, but the server never sends CORS
headers, and every portrait is a same-origin asset - nothing here is
actually cross-origin. That mismatch can taint the canvas depending on
caching/load-order, which silently skips the chroma-key step and leaves
the original flat background showing - exactly the symptom in the
screenshot. Removed the unnecessary attribute. This should fix every
portrait that was intermittently affected, not just Hook's.

**4. Sewer map too narrow, dialogue box overlapping the map edges (Image 2)**
The exploration viewport had no width cap beyond a very generous
1500px/96vw ceiling on wide desktop screens. Small maps (the sewer room
is only 17 tiles wide) render camera-clamped to their real, much
narrower width, while the dialogue panel and HUD stretched to fill the
full oversized container - creating exactly the mismatch in the
screenshot. Capped the exploration frame at a more reasonable max-width.
Very small maps may still show some letterboxing either side, that's
expected, but nothing should overlap or look broken now.

**6. Interact buttons overlapping bottom-right (Image 3)**
Real bug. The three HUD buttons (Inventory, Board, Vote) were each
individually positioned with a hand-picked `right: Npx` offset, sized on
the assumption every button was roughly icon-width. The Board button's
"23/23" text badge is wider than that assumption, so it was overlapping
the Vote button next to it. Replaced the manual pixel offsets with a
single flex container that lays all three out based on their actual
rendered width - can't drift out of sync again as button content
changes, and any future 4th button just drops into the same row for
free.

## Investigated and flagged, needs your input rather than a guess

**5. Guild Hall map renders blank (Image 3)**
Checked this thoroughly and could not find the cause in the files
themselves - the tile data is real (190+ floor tiles, walls, furniture
all populated), every tileset image the map references exists on disk
with real pixel content, and the tileset column counts all match the
actual image dimensions exactly. Everything I can check from the data
says this should render correctly. Possible explanations I can't rule
out from here: a stale deployment (the live Railway instance not
actually running the latest build), or something specific to that
browser session. Could you confirm this is from a fresh redeploy of this
zip, and if it's still blank, check the browser console for any 404s or
errors when that map loads? That'll tell us a lot more than I can from
the file data alone.

**7. "The Front Door" labelled at the back (Image 3)**
Checked the actual collision geometry. The object currently named "The
Front Door" (`exit_guild_hall_town`, connects to Guild Hall Exterior)
sits at row 4, near the top of the room, and *does* have a genuine
doorway carved through the wall there (a real 2-tile gap in an otherwise
solid wall row) - it's a real, working threshold, not a rendering
glitch. The "Entrance" object at row 12 (near the bottom) does *not* have
a matching gap in the wall below it, and its target is still an
unresolved placeholder, so it isn't functional yet either way. I don't
have a way to visually confirm which one Elle's original Tiled art
actually intends to read as the "front" without seeing it rendered, so I
didn't rename or move anything - wanted to flag the actual geometry
first rather than guess and possibly make it more confusing. Let me know
which one should be the real front door once you've had a look, and
I'll fix the naming/wiring to match.

**8. The Blacksmith's appearance (Image 4)**
Found the cause, and confirmed I didn't touch this - `npc_blacksmith`'s
object data sets `"look": "citizen9"`, a generic townsperson sprite, not
anything smith-specific. That assignment predates every session I've
worked on this project; I never edited this object's `look` field. The
manifest has a few more physically rugged options that might read
better for a blacksmith (`fighter2` through `fighter5`, `guard`), but I
didn't want to swap it without knowing whether any of those are already
claimed by another named NPC, or whether you have a specific look in
mind. Let me know which direction you want and I'll wire it in.

## Not a bug - explained

**9. Act 3 dialogue boxes look plainer than Act 1/2's (Image 5)**
Confirmed there's no code difference between them. The VN dialogue panel
automatically shows a portrait frame when the NPC object has a
`"portrait"` field set, and collapses to a compact text-only box when it
doesn't - the Bartender (and every other Act 3 NPC right now) simply
doesn't have one yet, which is exactly the gap the portrait prompts
document from last session was written to close. Once real portrait art
lands and gets wired in via that field, Act 3's dialogue boxes will
render identically to Thorne's and Corwin's, same code path, no further
fix needed here.

## Validation run before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. CSS: balanced braces (203/203, net -1
from removing the old fixed-offset HUD button rules). em-dash grep:
clean across every touched file.

---

# v99 delivery notes - the real Tavern bug, and a more honest look at the cutscene

## The big one: the Tavern was never actually rendering, anywhere

Went back and checked every single Act 3 map's tileset paths against
what's actually on disk, file by file, rather than trusting my earlier
notes. Found it: **`tavern_1st_floor` was missing 20 of its 22 tileset
image files.** I flagged this exact gap all the way back when the
Tavern floor was first built, and again after the CraftPix pack zips
were uploaded - but when those zips landed, I only pulled the specific
files `town_exterior` needed from the tavern pack, and never actually
went back and finished the Tavern's own original gap. That's on me, it
sat unresolved for several deliveries. All 20 files were sitting right
there in the already-uploaded tavern pack the whole time. Verified every
one against the map's declared column counts before copying (all
matched exactly, no surprises), copied them in, and confirmed all 22 of
the Tavern's tilesets now resolve.

This is very likely most of what "no map rendering anywhere in Act 3"
actually was - the Tavern is one of the most-visited zones (Voss's
alibi, Ashgate's reveal, the goblin, the flirty guy, the whole musicians
pass all live there), so a completely blank Tavern would read as a huge
chunk of the act just not working.

**Checked everywhere else too, not just the Tavern.** Ran a full sweep
of all 13 Act 3 maps for missing files (all clear now) and separately
checked every single tileset path for a case-sensitivity mismatch
between what the JSON references and the actual filename on disk - a
real, sneaky class of bug that works fine locally on Mac/Windows but
silently fails on a case-sensitive Linux host like Railway. None found,
anywhere.

**Guild Hall's blank map (bug 5 from before) is still unresolved.**
Given the Tavern turned out to have a real, concrete cause, I want to be
honest that I don't have the same confidence here - I checked file
existence, tile data, tileset dimensions, and now case-sensitivity too,
and everything genuinely looks correct in the files. If it's still blank
after this delivery (with the Tavern fix in place too), I'd really
appreciate a browser console screenshot when that map loads - a 404 or a
JS error there would tell us far more than another round of me checking
files that keep checking out fine.

## The manor cutscene camera - a more honest pass

I need to walk back part of my last fix. I'd diagnosed the black space
above the scene as the camera centering a map shorter than the viewport,
and "fixed" it by top-aligning in that case. Going back through the math
properly this time: the viewport height is CSS-capped at 820px maximum,
and this map's real height is 960px - meaning the "shorter than viewport"
condition can mathematically never be true here, so that fix never
actually applied to this scene at all. I got the diagnosis wrong.

Rather than keep guessing at the exact cause without being able to see
it render, I've added a more robust, timing-independent fix: the game
canvas now uses a `ResizeObserver` to keep its actual pixel dimensions
continuously synced with its real on-screen size, instead of relying on
manual resize() calls at specific moments in the code that can run
before a fade-in or layout settle has actually finished. This covers a
real, plausible class of bug (a stale canvas size from before a
transition) regardless of whether it's the exact cause here, and it's a
strict improvement either way - it can't make anything worse.

**Held off on moving Captain Thorne again.** Her exact position relative
to the book only makes sense to fine-tune once we know the scene is
rendering at the right scale and position - adjusting her tile
coordinates against a screenshot that's affected by this sizing bug
risks chasing the wrong target. Once this lands, if she's still off,
send a fresh screenshot and I'll get her properly centered on the book.

## Validation run before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. em-dash grep: clean.

---

# v103 delivery notes - every map in the project, 100% resolved

Elle sent the real .tmx exports for Chapel, all 3 Mage Tower floors, and
Training Ground - the actual authoritative Tiled source, not just
individual .tsx files. Parsed all 5 directly and rebuilt each affected
map's tileset list from that ground truth rather than inferring.

## Chapel and all 3 Mage Tower floors: clean, complete rebuilds

Every single tileset image these four maps reference already existed in
the project with exactly matching dimensions - confirmed file by file,
not assumed. Rebuilt all four maps' tileset lists directly from the tmx
data (real columns, real tile counts, real lastgid for every entry).

**All four now resolve 100%.**

## Training Ground: two real gaps, one closed by data already in the
project, one inferred and flagged

- **Second `Walls_street.png` (336x384) and `Exterior.png` (416x240)**:
  neither exists anywhere in any uploaded pack under those names, but a
  dimension-based search across every PNG in every pack found both
  already sitting in the project under different names -
  `Walls_street_magetower.png` and `Exterior_magetower.png` - left over
  from whoever handled this map's original conversion, correctly
  disambiguated already, just never pointed at by the map's tileset
  list. Wired both in directly, no new files needed.
- **`Walls_street2.tsx`**: a genuinely external tileset reference with no
  embedded image in the tmx, and no `.tsx` file was sent for this one.
  This wasn't decorative - it turned out to cover about three quarters
  of this map's placed tiles, not a handful. Rather than leave that
  large a gap, inferred its real dimensions from a clean pattern: every
  other Walls_street variant in this project is 336px wide, and this
  tileset's gid range works out to exactly 378 tiles - 21 columns x 18
  rows at 16px, giving 336x288, which happens to be the single most
  common Walls_street size already in several other packs. Used that
  file. **This one is a well-grounded inference, not confirmed from the
  actual source** - if you have the real `Walls_street2.tsx` or a
  different intended image, let me know and I'll swap it in properly.

## Full project sweep

Ran the same tile-resolution simulation against all 29 maps in the
project, not just the ones touched this round.

**Every map is 100%.** Every zone in Act 1, 2, and 3 should now be fully
visible and correctly rendered from the game's own data.

## Validation run before this zip

node --check: clean on server.js. JSON parse: clean, all 33 content/map
files. Tile-resolution simulation re-run project-wide as the final step,
numbers above are from that run.

---

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

---

# v110 delivery notes

Large batch since v109: the actual maze collision investigation (and the
correction after it), the fireplace animation, several precise Act 3
fixes, and a full pass on the Means and Opportunity board. Flagging
clearly below what's verified versus what still needs your eyes on it
live, same as always.

## The maze - real fix, with a real correction along the way

Went looking in the wrong map first (jail_cells instead of the actual
maze, dungeon_area_5) - once pointed at the right one, found a genuine
mismatch between the wall art and the collision grid and rebuilt it.
That rebuild was wrong: you'd already told me the collision was
intentionally offset from the wall art (collision at the base of each
wall, so a player can walk behind the tall part of it - the birds-eye
depth effect for a big room). Restored your original collision data for
every map I'd touched (dungeon_area_5, dungeon_area_4 and its kennels
and ossuary sub-rooms, dungeon_finale) once that was clarified. Confirmed
by you as correct as of this delivery.

## Fireplace animation - real source data, not guessed

Used the Nobles Manor pack you uploaded. Found the real tileset and
animation frames in `Interior_2nd_floor.tmx`, matched the gid range
against what's already in `manor_upper.json` (confirmed exact match),
and wired in the real 6-frame flame flicker. Verified by rendering three
actual frames side by side, not just trusting the data.

## Precise, verified fixes

- **Guild Hall upstairs pentagram** - was blocking movement because it
  shared a layer with a genuine bookshelf; a blanket "this layer blocks"
  rule caught the flat floor decal along with it. Cleared collision for
  exactly the pentagram's own tiles, left the bookshelf blocking as it
  should.
- **Dragon dialogue format** - checked all three dragon objects in the
  game; all three already use the correct kind (the chapel roof dragon
  intentionally cycles as a 5-part riddle, the other two are proper
  single popups). No change needed, already correct.
- **Inventory thumbnail** - checked the icon file's own content bounds
  and the full CSS chain; found nothing currently wrong. Believe this
  was already resolved by an earlier icon rework.

## The Means and Opportunity board - full pass

- **Height/zoom problem, real bug**: the modal itself had no max-height
  or scroll, so content just grew past the screen in both directions
  when it didn't fit - that's why zooming out was the only way to see it
  all. Capped it with a proper scrollable max-height.
- **Clue text length**: cards now show a short preview with a "more"
  link rather than every full quote sitting expanded at once.
- **"More" opens a modal**, per your request, instead of expanding the
  card in place and reflowing the board around it.
- **The "ignore" button doing nothing**: found the actual cause - it
  sits inside a draggable card, and a browser can read the small mouse
  movement during a click as the start of a card drag instead, so the
  button's own click never fired. Explicitly marked it (and the new
  "more" button) as non-draggable.
- **Cards not appearing after a successful drop**: ran the server's own
  placement and state-broadcast logic directly with real data - it's
  correct on paper. Rather than leave this dependent on a network
  round-trip I couldn't fully trace end to end, changed it so dropping a
  card updates your own board immediately, with the server call right
  behind it as the source of truth for syncing everyone else. Also found
  and fixed a real, separate bug alongside this: the tray was picking up
  a duplicate drop-listener on every board update instead of being wired
  once.

**This is the one area I most want your eyes on.** The reasoning behind
each board fix is sound and I traced the server logic directly rather
than guessing, but I have not been able to watch any of it run live.

## Still open, not touched this round

- **Hook cutscene, player not rendering.** Made the sort-boost that
  keeps the player visible over furniture scene-specific rather than a
  blanket constant (a real improvement either way), but was upfront I
  couldn't confirm that's the actual root cause of this one.
- **Guild Hall upstairs "teleport into void-wall by the stairs."**
  Checked thoroughly, could not reproduce from the map data - still
  unconfirmed either way.
- **Manor cutscene framing.** You have the current camera center,
  player marks, and actor coordinates from a couple of exchanges back to
  adjust in Tiled - sitting with you now, not blocked on my end.

## Validation before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. CSS brace count and HTML div tag count
both balanced. Every collision change this round that touched an
existing map was BFS-reachability-checked from spawn to every object
after the change.

---

# v111 delivery notes

Three core session/party mechanics fixes.

## 1. Rejoin with just the join code

Previously, once a game started, `player:joinRoom` unconditionally
rejected everyone - the only way back in was the same browser having
quietly saved a reconnect token in localStorage. A player on a different
device, or with a cleared browser, had no way back in at all. Now, if
the room's already started and the name typed matches a currently
disconnected seat, it reclaims that seat properly (same inventory, same
act, fresh token saved going forward) - the same outcome the existing
token-based auto-reconnect already gives, just reachable by typing the
code and name again instead of depending on browser storage surviving.

## 2. Catch-up prompt instead of forced teleport

Built per your steer away from "just teleport everyone" - the server
tracks each player's progress rank through the dungeon's one-way chain
(the four Area 4 side-rooms count as the same rank as the hub, since
they're detours, not forward progress). When the party's front-runner
moves further ahead than a teammate, that teammate is offered a prompt
- "the rest of your group has moved ahead, want to jump forward and join
them?" - rather than being forcibly moved or left stuck. Declining
doesn't get re-asked on every subsequent unrelated step; a new prompt
only appears if the gap grows past what they already saw.

## 3. Cutscenes close dialogue and fade consistently

Found a real, concrete gap while checking this: fade-to-black was only
wired into two of three places an "explore" act could actually complete
(a successful vote, and the whole party reaching a shared zone) - the
Estate's evidence-based completion had no fade at all, so that specific
transition could cut straight into whatever came next with no warning.
Centralized all three completion paths into one shared function so a
fourth completion mode can't silently skip this again. The fade now also
explicitly closes any open dialogue box and any open modal (inventory,
board, etc.) the instant it starts, not only once the new act has
finished loading.

## Validation before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. HTML div tag count balanced.

## Not tested live

All three of these touch core session/party plumbing that's hard to
fully exercise without a live multiplayer session - the reasoning is
sound and each piece was checked against the actual existing code paths
it needed to match, but none of the three has been watched running in a
real browser yet.

---

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

---

# v115 delivery notes

## The Inn's NPC sizing

Already fixed, and still there in this build - I checked before touching
anything else. `tavern_1st_floor.json` has all 12 patron cutouts,
`tavern_2nd_floor.json` has the sleeping guest's. If it's still showing
wrong in a live session, that's a genuinely different bug from what I
fixed and I'll need a fresh screenshot to chase it, since the data
itself checks out.

## Guild Hall - all three things

**No animations at all.** Turned out to be a bigger gap than "missing
gatedCells" - the door, its two flanking windows, and the flag banners
had never been wired as animated tiles in the first place, even though
the source art has real frames for all of them
(`Flags_animation.png`, `Windows_doors.png`). Had to build the frame
data from scratch by reading the actual tileset images rather than just
adding gating to something already authored:

- The flags are a genuine 12-frame waving-banner cycle (confirmed by
  comparing frames directly, not just assuming). These are ambient -
  built to loop always, no proximity gate, per what you asked for.
- The door is a real 6-frame swing (closed to fully open, confirmed
  visually frame by frame). The two windows share the same 6-frame
  structure with a subtler lit/unlit change. All three are now gated to
  one shared proximity zone around the entrance, same open-on-approach/
  hold/close-on-leave behavior as every other building door in the
  game.

**Couldn't be re-entered.** Found the actual cause: `guild_hall_exterior.json`
had exits going *out* to the sewers, into town, and to the training
ground, but no object anywhere on that map pointing back *into* the
building. Once you left, there was nothing to walk into. Added the
missing entrance at the foot of the door, landing at the same spot
inside `guild_hall_ground.json` its own front door already uses.
Confirmed the full loop (arrive from town, reach the entrance, go in,
come back out, reach the exits) is genuinely walkable, not just object
data that looks right.

## The broader "windows should work like doors" pattern

Swept every map in the project for animated tiles with no proximity
gate at all, not just the ones literally named "door" or "window" -
that naming assumption is exactly what let the Guild Hall's door (baked
into a layer called "House") slip through unnoticed twice already. Real
findings beyond Guild Hall:

- **The Herbalist's Hut's own front door** - had real authored
  open/close animation data, just never gated. Fixed the same way as
  the tavern's doors last session.
- **Training Ground's blacksmith building** - the door itself was
  already gated from an earlier pass, but the building's own windows
  next to it were still looping ambiently. Added them to the same
  zone the door already uses.
- **Dungeon Area 4's four side-room doors** - these actually already
  had their trigger zones authored, matching the pressure-plate
  mechanic in that room, just never linked to the door tiles
  themselves. Wired each to its correct existing zone rather than
  inventing a new one.

Everything else the sweep found (water, birds, fish, fountains,
candles, torches, character idle animations, the dragon's wings and
tail, chapel statues and altar candles, smoke) is genuinely ambient
decoration and was already behaving correctly - left those alone.

Mage Tower's Pupils/Demon and Chapel's Priest/Monks/Statues are still
flagged from last time as the same kind of connected-blob set-dressing,
not individually gateable doors - still waiting on your call on whether
those are meant to be something else.

## Validation run before packaging

- JSON-parsed all 36 files under `content/` and `public/assets/maps/`
- `node --check` on `client.js`, `overworld.js`
- BFS reachability, spawn to every object, across every map in the
  project, plus a specific check that Guild Hall's town-arrival point,
  new entrance, and existing exit-landing point are all mutually
  walkable, not just individually reachable from spawn
- Only flagged object is the tavern's sealed 2nd floor, expected

---


---

# v116 delivery notes

## Housekeeping: session notes moved out of the root

All 13 `SESSION_NOTES_vNN.md` files that were sitting loose at the top
level (v83 through v115) are now consolidated into this file, oldest
first, each version's original notes kept intact under its own heading.
Nothing was rewritten or summarized, just concatenated in order and
moved out of the project root.

Going forward, each new delivery's notes get appended here instead of
dropping a new loose file in the root - this entry included.

Root now just has `README.md` and the two Act 3 script docs
(`ACT_3_DIALOGUE_SCRIPT.md`, `ACT_3_PORTRAIT_PROMPTS.md`), left where
they were since they're reference material you actively use, not
session history.


---

# v117 delivery notes

## Also in this delivery, from the screenshot round

A few fixes made before your maze file arrived, not yet packaged until
now:

- **The bedroom chest** - added the real 2-tile chest sprite from the
  dungeon asset pack at Ashgate's Travelling Chest position, which had
  no visual sprite at all before.
- **The vote's "does nothing" bug** - a real one: the UI marked your
  pick as chosen the instant you clicked, before the server had a
  chance to reject it. When it did reject (no board support yet), the
  card was left looking picked with no visible sign anything failed.
  Fixed the reset, and made the rejection message itself impossible to
  miss (was a quiet text swap; now bold and holds for 3 seconds).
- **Chapel entry point** - moved out from the doorway to the walkway in
  front of it.
- **Guild Hall's upper floor landing spot** - the stairs-up teleport
  technically landed you in a connected part of the room (I checked -
  100% of the floor is reachable from there), but it's a 3-tile-wide
  alcove near the map's edge where most of the camera frame shows
  nothing but void. Moved the landing point to open floor nearer the
  room's center instead.
- **The maze** - I'd checked for genuinely floating/bugged collision
  (solid cells with no matching wall art nearby) across the whole map
  and found none, which is why I held off touching it and asked for
  the exact spot instead - see below for what actually turned out to
  be needed.

## The maze - fixed properly, from your source file

Used the `PLAN OFFSET 32` layer from `DUNGEON_MAZE_finished.tmj` as the
sole source of truth, exactly as instructed: rebuilt `dungeon_area_5`'s
entire collision grid from that layer plus the map's own outer edge as
a hard boundary, nothing else contributing. Only 6 cells actually
differed from what was already there, which explains why my earlier
"floating collision" analysis came up empty - the existing data was
already almost entirely correct, just not byte-identical to your
authored plan. It's an exact match now. Reachability re-confirmed
clean afterward.

## Herbalist's Hut - both issues

**Map not hooked up.** Found the actual cause: `ALL_ZONE_MAPS` in
`server.js` (used for any zone transition that isn't the current act's
own starting zone, plus the host skip-tool) was missing both
`herbalist_hut_exterior` and `herbalist_interior` entries entirely -
every other sub-zone in the game (barn, dock, both manor floors, both
guild hall floors) had one, these two never did. Added both. The
exterior map itself loads fine via the act's own `mapUrl`, but walking
from the exterior into the interior - a different zone - was going
through this table and coming back empty.

**The maid was implied to be at the hut in person, and there was no
handoff scene.** You're right on both counts, and they're the same
underlying gap: nothing ever staged the moment where she rejoins the
party with the goblet. Built it as a new cutscene, "The Maid Returns" -
staged at the Guild Hall right after the vote, before Corwin leads the
party to the swamp, following the exact same `staged_scene` pattern as
"Out of the Sewers" (actor walks in, two lines of dialogue, fades into
the next act). She hands over the goblet and the guard's report there,
in person, at the Guild Hall - not at the hut. Rewrote the report's
own text to stop implying she was still standing right there when you
reread it ("slipped you back at the Guild Hall," not "presses into
your hands").

Story sequence is now 14 acts. The new one sits between "Means and
Opportunity" and "The Herbalist's Hut."

## Validation run before packaging

- JSON-parsed all 36 files under `content/` and `public/assets/maps/`
- `node --check` on `server.js`, `client.js`
- BFS reachability, spawn to every object, across every map in the
  project, including the rebuilt maze - only flagged object is the
  tavern's sealed 2nd floor, expected


---

# v118 delivery notes

## Guild Hall - rebuilt from your source files

**Exterior**: tile data is byte-for-byte identical to what was already
converted, so nothing needed changing there.

**Ground floor**, rebuilt from `Interior_1st_floor_EDITED.tmx`: found a
real, concrete bug while doing it - a decorative hanging chain and a
corner armchair were sealing off the only corridor connecting the back
door to the rest of the room, so the door was flat-out unreachable.
Checked which pieces were genuinely decorative versus real furniture by
looking at the actual tile art before touching anything (the chain
wasn't blocking anything real; the armchair was legitimate, so a narrow
bypass was carved around it instead of through it). Confirmed full
reachability afterward.

**Upper floor**, rebuilt from `GUILD_HALL_INTERIOR_UP.tmx`: the file
registers a long list of character tilesets (fighters, mages,
mannequins, a reader, fire) but none of them are actually placed
anywhere on the map yet - so there's nothing to extract into cutouts on
this floor yet, that's not a bug, they just haven't been placed in
Tiled. Moved the stairs-down landing point from a mostly-isolated
corner to open floor near the room's center.

## The tavern sizing/layering bug - found the actual cause

You were right to push back - this was real, and it was the same root
cause behind several of the specific things you described. Found it in
`overworld.js`'s draw-order logic:

Every other thing in the game sorts its draw order by a **tile-rounded**
Y value - furniture, the player, every other NPC. The cutout-based
NPCs (the tavern patrons) were sorting by the **exact, alpha-trimmed
pixel** position of their own art instead. Those two numbers are
almost never equal - character art essentially never fills a tile
right down to its last pixel row - so a cutout NPC standing in the
same row as a table or rack would consistently get sorted as "further
back" than furniture next to it and draw underneath it. That reads as
the character being shrunk to a sliver, because most of them actually
was hidden behind the table. This explains the card player and the
dracthyr specifically - "shrunk" and "below the table" were the same
bug described two ways. Fixed the sort key to use the same
tile-rounded convention as everything else; the actual draw position
is untouched.

Also found and fixed a real typo while in there: one of the tavern's
own character layers was named `Charactes3` (missing the "r")
throughout the file - internally consistent so it wasn't itself
causing a visible bug, but a landmine for anything that ever
cross-references layer names correctly spelled. Fixed everywhere.

**Not yet resolved**: the draenei and the flirty guy going fully
invisible. I traced this as far as finding that both have tiles
carrying a genuine 12-frame animation cycle that, when rendered in
isolation, shows mostly near-empty content rather than a full
character - which would explain intermittent full disappearance
depending on where in the cycle a screenshot lands. I wasn't able to
confirm whether that animation data legitimately belongs to a tiny
decorative detail that got swept into their cutout by mistake, or
something else, without more time than I had left this pass. Flagging
this rather than shipping a guess.

## Validation run before packaging

- JSON-parsed all files under `content/` and `public/assets/maps/`
- `node --check` on `overworld.js`
- BFS reachability, spawn to every object, across every map in the
  project, including both rebuilt Guild Hall floors - only flagged
  object is the tavern's sealed 2nd floor, expected


---

# v119 delivery notes

## Guild Hall ground floor - three changes

- **Chain and armchair are now walkable.** Straightforward - both are
  non-blocking now instead of the narrow bypass carve from last time.
- **The back door is locked.** No longer a functional exit - walking up
  to it now gives: "Locked. \"Don't you have a murder to solve instead
  of running away?\" Corwin's voice, from somewhere behind you, not
  even looking up from what he's doing." Also stopped the door's own
  swing-open animation, since a door that visibly opens on approach
  contradicts being locked - it now just stays shut.
- **Added a real desk**, roughly centered in the room (the exact
  center was already claimed by the existing weapon racks/bookshelf
  against the back wall, so it sits in the nearest open floor to that,
  toward the front of the room). Both puzzle boards are anchored there
  now: the vote sits right at the desk, and a new flavor note on the
  desk itself ties it to the deduction board (still opened the same
  way it already was, via the board button - this just gives it a
  physical home to point at).

## Validation run before packaging

- JSON-parsed all files under `content/` and `public/assets/maps/`
- `node --check` on `overworld.js`
- BFS reachability, spawn to every object - only flagged object is the
  tavern's sealed 2nd floor, expected


---

# v120 delivery notes

## Cauldron smoke, replaced

Confirmed the row before touching anything: cropped row 9 from the
full sheet (`Free_Smoke_Fx__Pixel_06.png`, 64px-tall rows, row 9 =
y512-576) and compared it directly against the partial crop you'd
already started - matches exactly, including the bit of row 10 bleeding
into the bottom of your crop.

Extracted all 12 frames (768px wide / 64px each), built a new animated
GIF from them with proper transparency (indexed-palette with a
transparent index, not plain RGBA - GIF alpha doesn't animate reliably
otherwise), and swapped it in at
`public/assets/ui/cauldron/smoke/smoke.gif`, the same path the cauldron
overlay already points to, so no other wiring was needed. Verified by
reading the saved GIF back out frame by frame against a solid
background to confirm transparency survived the save.

12 frames at 90ms each, looping - a touch slower than the old asset's
60ms since this one has a real grow-then-dissolve arc to read, not just
a fast wisp.
