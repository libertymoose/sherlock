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
