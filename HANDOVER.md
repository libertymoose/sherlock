# Handover — A Study in Boralus, picking up after v133

This replaces the earlier handover from v122 (v123's own testing pass
hadn't happened yet when this was written). Paste this as the first
message in a new chat, then attach the v133 zip.

## Where things actually stand

- **v133 fixes a real, disclosed-as-a-judgment-call scale bug** on the
  two "stands behind a counter" NPCs (the tavern bartender, the glass
  workshop's shopkeeper) - see "v133" below. Also confirmed the card-
  game group merge from v132 renders at the correct size, no further
  splitting needed.
- v123 through v132 remain otherwise as documented.
- Packaged and validated (JSON parse, `node --check`, CSS braces,
  em-dash grep, all clean). No collision touched this round.
- Keep incrementing normally (v134 next) from here.

## v133: Bust-only NPCs were rendering as giant floating heads

### Card game group size, confirmed correct
Elle asked to double-check the merged card-game cutout (drow + orc)
from v132 wasn't accidentally shrunk by the merge, the same way the
Glass Workshop's glassblower bug had been. Rendered it at the true
in-game draw size next to two ordinary single-person NPCs with their
top/bottom edges aligned: both people in the group reach the exact same
66px height band as everyone else. The extra width (78px vs ~51-55px
for a lone NPC) is expected and already how every other multi-person
cutout in the game works (`flavor_tavern_drinkers`, the seated
adventurers bench) - not a bug. No split needed.

### The real bug: two "behind the counter" NPCs rendering as giant heads
Elle flagged the bartender specifically: his cutout is *only* his face
and beard (his body is behind the bar counter by design), but the
renderer scales every cutout's content to the same fixed 66px height
regardless of how much of a body that content represents. A 22px-tall
face crop stretched to fill the same slot as a 29px-tall full standing
body comes out roughly 3x too large - a giant disembodied head.

Checked whether this was bartender-specific or systemic: the Glass
Workshop's shopkeeper (also stationed behind her own counter, per
earlier notes) has nearly identical content dimensions (15x21 vs the
bartender's 17x22) - same bug, same cause, just never flagged yet
because there was nothing to visually compare her against directly
before.

**Fix, disclosed as a visual judgment call, not extracted data** (there's
no real "full body" reference for either of these characters to derive
an exact ratio from - both packs only ever drew them as a bust): measured
a real full-body character in the same art style (the tavern's lute
player) to see what fraction of total height a head actually occupies in
this style - roughly 40-45%. Rendered the bartender at several candidate
`drawScale` values (0.45, 0.5, 0.6) against that reference before
picking one. Landed on **`drawScale: 0.5`** for both `npc_bartender_tavern`
and `npc_shopkeeper_glass` - rendered the final result next to the lute
player to confirm it reads as a proportionate head, not a giant face.
This is the same kind of disclosed, reversible scale call as the
Blacksmith's earlier (now-removed) override, not treated as definitively
"correct" the way real extracted animation/collision data is - flag it
if it still looks off once seen live.

**Worth checking for elsewhere:** any other NPC standing behind a fixed
counter/desk with only their upper body visible (the Guild Hall's
Guildmaster, if similarly posed, hasn't been checked) may have the same
issue. Not audited this round - only the two already-confirmed cases
were fixed.

## v132: Tavern verified against real source - one real bug found, layering confirmed fine

Elle sent the actual Tiled export for the tavern's ground floor
specifically to check the Y-sorting/layering complaint. Did a full
tile-by-tile diff between that source and the shipped
`tavern_1st_floor.json`:

- **Every non-character layer matches the source exactly** - `floor`,
  `Walls`, `Stairs`, `Walls_top1`/`2`, `Furniture1`/`2`/`3`,
  `Stuff_on_tables`. Zero mismatches across 700+ tiles. No native Tiled
  `<group>` elements exist in the source either (checked directly), so
  there's no authored grouping relationship this project's `layerGroups`
  mechanism could even be restoring - confirming last round's instinct
  not to add speculative layer-grouping was correct. The furniture
  layering complaint doesn't appear to be a real Y-sort bug.
- **A genuinely empty scratch layer** (`Tile Layer 13`, 0 tiles) exists
  in the source and was correctly left out of the conversion - not a
  missed-content bug.
- **Found a real bug the diff surfaced: `flavor_tavern_sleeping_drunk`
  had two different characters baked into one cutout.** Its 12 tiles
  were actually a clean 4-tile sleeping figure (`Animation_sleep_guy2.png`)
  plus 8 tiles of a completely separate orc character
  (`Animation_orc_player.png`) sitting with dice, wrongly swept in
  together. Rendered both halves separately to confirm: the orc is
  holding dice, and the existing (separate) `flavor_tavern_card_game`
  cutout already showed a drow holding cards - same table, two players,
  meant to be one group scene. Split them correctly: sleeping drunk is
  now just its own 4 tiles, and `flavor_tavern_card_game` now contains
  both the drow and the orc (14 tiles total), rendered and confirmed as
  one coherent card-game scene. Swept every other cutout on this map
  afterward for the same "mixed tileset in one cutout" signature -
  nothing else has it.
- **Both objects' marker positions corrected** to their real source feet
  positions (`flavor_tavern_sleeping_drunk` to (21,10),
  `flavor_tavern_card_game` to (19,13)) - they'd previously been sharing
  one identical position, a symptom of the same merge.
- Cross-checked every NPC's object-marker position against the real
  source using a feet-anchor conversion (bottom-center of the Tiled
  object's bounding box, matching how this project already anchors
  every character) - 8 of 12 matched exactly, the rest were off by at
  most 1 tile, well within normal variance for hand-placed markers.

**Not yet checked:** the same real-source diff for `tavern_2nd_floor.json`
or any other Act 3 map - only the file Elle actually sent this round got
the full treatment. If the same class of bug (two characters merged into
one cutout) is suspected elsewhere, the same technique applies.

## v131: Real animation data for both interiors

Confirmed via the source `.tmx` files that both rooms' existing tileset
`firstgid` values in `glass_workshop.json`/`blacksmith_interior.json`
already match these packs exactly - these are genuinely the same source
data the maps were built from, just never had their animation blocks
extracted.

- **Glass Workshop went from 0 animated tiles to 38.** Previously
  nothing in this room animated at all - not the forge, not the light
  effect, not either NPC. Extracted every `<animation>` block from
  `Interior.tmx`, scoped down to only the gids actually placed or used
  in this map (105 animated tiles exist in the source pack overall,
  38 are relevant here), and confirmed directly: the glassblower's 4
  tiles now each carry a real 33-frame idle animation, the shopkeeper's
  4 tiles a real 12-frame one. Forge, light, and door/window ambient
  animation are all wired too.
- **Blacksmith's two frozen ambient elements fixed**, same method: the
  "Floor_light" glow effect (21 frames) and the water trough (6 frames)
  were placed in the room but had zero animation data, unlike the torch
  and forge fire which were already working. Extracted from
  `Blacksmith_house_interior.tmx`, same firstgid match confirmed.
  Animation count for this map went from 42 to 69. The blacksmith
  character himself and the torch/forge fire were already correct and
  untouched.
- Both extractions only pulled in animation entries for gids actually
  present in that specific map (checked against every tile layer plus
  the sprite-cutout tile lists) rather than dumping the whole pack's
  animation set in wholesale - keeps the `animations` dict scoped to
  what's real for each room, matching how every other map in the
  project already does this.

**Not yet checked:** whether either pack's `Characters.tmx` (glass) or
`Blackmith_character.tmx` (blacksmith) contains additional idle-pose
variety beyond what's already placed in these two interior maps - out of
scope for this round, flagging only in case a richer idle cycle is
wanted later.

## v130: NPC size audit - Glass Workshop and Blacksmith fixed

Computed the actual final rendered pixel height of every cutout NPC in
the game (all of Act 3 plus the Blacksmith): **every one of them was
already rendering at a uniform 66px tall, except two** - confirming the
"some tiny, some huge" problem from earlier rounds really was fixed by
the sprite-cutout work, with two real exceptions found on direct audit:

- **The Glass Workshop's "teeny tiny" glassblower, root-caused.** His
  cutout wasn't a sizing bug at all - it was scooping up **20 tiles**
  (a 4x5 block) instead of the 4 tiles that are actually him, sweeping
  in his own table and a second side-table with two bottles on it.
  Since every cutout gets force-scaled to the same fixed height
  regardless of its content box, cramming furniture into that box
  shrank his actual character down to a fraction of the frame - while
  the Shopkeeper, whose crop was already correctly tight, filled her
  frame properly and read as comparatively huge by contrast. Rendered
  the full over-broad crop to see exactly what was in it, identified the
  real character tiles by eye against a labeled grid, rebuilt his cutout
  tight (4 tiles, not 20), and **restored the 16 furniture tiles that
  had been incorrectly zeroed out of the map along with him** - the
  table and the side-table with its bottles were completely missing
  from the room until this fix, not just misjudged in size.
- **The Blacksmith's `drawScale: 1.6` override removed.** Verified
  directly rather than taking the old justification on faith: both
  `blacksmith_interior.json` and `training_ground.json` use identical
  16x16 native tile art, and the blacksmith's own crop is already tight
  and correct (his fused-into-anvil pose is deliberate, not a stray
  furniture sweep like the glassblower's was). With no technical
  difference found anywhere, Elle's direct read ("nothing about it is
  any different, it shouldn't be bigger or smaller") is correct - the
  override was a subjective call from an earlier session that doesn't
  hold up under a real side-by-side check. Removed it; he now renders at
  the same 66px as everyone else.
- **Swept every map's `spriteCutouts` afterward** for the same class of
  bug (`drawScale` overrides, unusually large content boxes relative to
  tile-count) - nothing else in the project has either issue.

### The separate, bigger question: NPCs vs. the player
Every NPC in the game (not just Act 3 - Act 1's fixed sprites, Act 2,
staged-scene actors, all of it) renders at 66px tall via one shared
constant (`WORLD_CHAR_SIZE` in `overworld.js`), while the player renders
at 150px (`PLAYER_DRAW_SIZE`). This is a real, confirmed, project-wide
gap, not an Act 3 inconsistency - it's been true since before this
project's own handoff notes existed. Flagged to Elle as a genuinely
separate, much bigger decision (rescaling every NPC in the entire game
at once) from the "some were tiny, some were huge" bug that's now fixed
- **not yet actioned, waiting on her call.**

## v129: Chapel and Tavern fixes

### Chapel - root cause found and fixed
Confirmed exactly what last round's investigation predicted:
`chapel_interior.json` had **zero** `spriteCutouts` entries despite 11
Parishioner sheets and 4 Monk sheets baked into its tile layers - it
never got the sprite-cutout treatment every other Act 3 room already
has. Built real cutout data for all 8 baked NPCs (the Priest, 4 Monks,
3 Parishioners) using the established technique: detected each
character's own tile blob by cross-referencing object position against
the tile data, then computed a genuinely alpha-trimmed bounding box from
the real source PNGs (unioned across all 12 animation frames per
character, not just the resting frame, so a praying animation doesn't
clip). Every crop was rendered and visually checked before being written
- all 8 came out as clean, complete figures. This should resolve the
"floating NPC models" report; what was actually happening is these 8
characters were rendering at native tile-block scale and position
instead of being cut out and re-composited like every other Act 3 NPC,
which reads as things being scattered/misplaced.

### Tavern - two real, separate bugs found (not a missing-asset problem)
The map's own `_incomplete` note claims 19 of 21 tileset images were
never uploaded - **checked directly, and this is stale.** All 21 files
now exist in `public/assets/mapsrc/tavern_1st_floor/`, added in some
later session without the note being updated. Don't trust that note
going forward; the real bugs were these two:

1. **`flavor_tavern_drinkers`'s entire cutout was invisible.** All 4 of
   its tiles had a raw Tiled horizontal-flip bit still baked into their
   stored `gid` (`2147485520` instead of the real `1872`, etc) -
   `resolveGid()` in `overworld.js` does a direct range comparison
   against tileset firstgid/lastgid with no flip-bit masking, so these
   simply never matched anything and silently failed to draw. This
   wasn't a case of stripping the flip and moving on, though - the flip
   was genuine, deliberate Tiled data (one of the pair authored facing
   the other), so **added real horizontal-flip support to the sprite-
   cutout renderer** (`overworld.js`, a per-tile `flip` field, mirrored
   via canvas `scale(-1,1)` when compositing) rather than just erasing
   the mirroring. Rebuilt this cutout's data with clean gids, the `flip`
   flag preserved, and a flip-aware alpha bbox (the source tile's alpha
   region gets mirrored before measuring). Rendered and visually
   confirmed - a complete character now, correctly facing the other way.
   Swept every other map's `spriteCutouts` for the same contamination -
   nothing else affected, this was the only occurrence project-wide.
   This new flip capability is also exactly what's needed for the still-
   open outdoor tavern-NPC flip request from v128 - ready to use the
   moment Elle confirms which NPC (dude or lady) needs it.
2. **30 NPCs across 5 maps had no name tag at all**, including every
   single named character on both tavern floors. The cutout renderer
   only draws a name label when the object's own `type` is exactly
   `"npc"` - `blacksmith_interior.json` (1), `tavern_1st_floor.json`
   (12, all of them), `tavern_2nd_floor.json` (1), `town_exterior.json`
   (11), and `training_ground.json` (5) were all missing this despite
   already having real `name` fields. Set `type: "npc"` on all 30. This
   alone probably explains a good chunk of "the tavern reads as broken"
   - a room full of nameless characters looks wrong even when everything
   else about them is correct.

Both of these were genuinely provable from data (a malformed gid,
missing type fields), not guessed. The tavern's furniture-layer Y-
sorting (`layerGroups`) wasn't touched - nothing in the data pointed at
a real bug there, and I didn't want to add speculative layer-grouping
without something concrete backing it up. If Elle still sees layering
oddities after this, that's the next thing to chase with a fresh
screenshot.

---

## v128: Bug-fix pass from Elle's first live test

### Fixed and verified against real data
- **Ashgate's chest** was at (3,5), visually sitting in wall art. Moved
  to (3,7) per Elle's direct instruction, confirmed walkable and
  reachable.
- **Manor upper floor, rows 12 and 13** are now fully walkable (both set
  to all-zero collision, per Elle's explicit ask) - these previously had
  several blocking segments splitting the rows into separate walkable
  pockets.
- **Three whole maps were missing `dense: true` on every layer** -
  `guild_hall_ground.json`, `guild_hall_upper.json`, and
  `herbalist_hut_exterior.json`. This is the exact same bug already
  fixed once for `herbalist_interior.json` (v123), just never applied to
  these three. `overworld.js`'s floor renderer skips any layer without
  this flag entirely (`if (!layer || !layer.dense) return;`), so all
  three rendered as a completely blank canvas - which explains **four**
  separate reports at once: no guild hall interior map, the maid
  cutscene's blank map, the blank "Board's Verdict" screen (all three
  use `guild_hall_ground.json`), and no herbalist map. Swept every map
  in the project afterward and confirmed nothing else has this issue.
- **The "running quotation marks" bug throughout Act 3.** Root cause
  found and reproduced exactly: the dialogue pagination's sentence-
  splitting regex (`splitToFit` in `client.js`) didn't treat a closing
  quote mark right after a period as part of that sentence, so any line
  like `...redo it." She chuckles. "We all knew...` got split with the
  closing quote torn off into its own stray fragment - reproduced the
  precise broken output Elle screenshotted (`["\" She chuckles.", "\""]`)
  before the fix and confirmed clean output after, then regression-
  tested against several other real dialogue lines from the project to
  confirm nothing else broke.
- **Suspect board now sorts both columns alphabetically** by full
  display name.
- **Act 1 evidence no longer carries into Act 2's inventory** - removed
  `prefillInventoryFromEvidence` from the Dungeons act in `story.json`
  per Elle's explicit instruction (this reverses the original "you're
  still carrying what you had when arrested" design intent from an
  earlier session - noting the change of direction here in case anyone
  wonders why that flag disappeared).
- **The Finale's grammar bug**, confirmed and fixed: "On the night of the
  gala, was buried in paperwork..." was missing a subject entirely. The
  passage template now includes "they" before the `{OPPORTUNITY}` blank,
  and the affected option texts were corrected for verb agreement
  (`was` -> `were`) to match.
- **The Finale no longer auto-advances to Case Closed on a timer.**
  Replaced the `setTimeout(3500)` with a proper party-wide manual
  "Continue" button (`finale:acknowledgeResult` on the server, gated the
  same ack-counted way every other reveal/cutscene "I'm Ready" button
  already works) - the party can sit with a correct result for as long
  as they want before moving on.
- **Maid cutscene fade-in** was already `fadeIn: true` in `story.json` -
  almost certainly just looked broken because the underlying map was
  blank (see the `dense: true` fix above). No change needed once that's
  fixed, but flagging so nobody "fixes" this again unnecessarily.
- **Dialogue/document panel height** increased from 170px to 260px
  (`.vn-portrait-frame`/`.vn-text-frame`). Even a single modest sentence
  (confirmed: `doc_marrow`'s intro is one ~150-character sentence) was
  triggering pagination's word-by-word fallback split, leaving most of
  the visible panel empty below just one line - this is the exact
  "small red box vs the space actually available" Elle screenshotted.
- **The end-of-cutscene "I'm Ready" transition screen** - the next-act
  title was pinned near the very top of the screen (64px) while the
  button sat at 62% down, reading as two disconnected messages on a
  plain black fade. Moved the title to sit just above the button instead
  (`calc(62% - 110px)`), so they compose as one "pause screen" moment.

### Investigated, root cause identified, needs Elle's input before fixing
- **Chapel's floating/misplaced NPCs.** Confirmed root cause via data:
  `chapel_interior.json` has **zero** `spriteCutouts` entries despite
  having 11 Parishioner sheets and 4 Monk sheets baked into its tile
  layers - meaning it never got the sprite-cutout treatment that
  Training Ground, the Blacksmith, the Mage Tower, and the Market all
  already have. This was explicitly predicted as a likely future report
  in an earlier handoff ("if a similar baked-NPC report comes in for
  Chapel, Tavern, or Glass Workshop, this is the established technique
  to reuse") - it's now actually happened. Building the real cutout data
  (each NPC's exact tile positions, anchor point, content bounds) is a
  real per-NPC data-authoring task, doable with the established
  technique, just needs doing for the 7 chapel NPCs (4 monks, 3
  parishioners) - didn't want to do this blind without confirming
  whether the actual symptom is "too large" (the Blacksmith-style issue)
  or something else "floating" might imply (a Y-sort/anchor issue), since
  those would need different fixes.
- **Glass Workshop sizing "AGAIN".** Unlike the chapel, this map
  *already has* spriteCutout data for both NPCs (the Glassmaker,
  the Shopkeeper) - so this isn't the "never got the treatment" bug,
  it's more likely the same "this room's furniture reads larger than
  the base scale" issue the Blacksmith needed a `drawScale` override
  for. Didn't want to guess a scale multiplier blind - a corrected
  screenshot or an explicit "make it N% bigger/smaller" would let this
  get fixed precisely rather than guessed.
- **The flipped tavern-exterior adventurer.** Found both candidates in
  `town_exterior.json` (`npc_market_adventurer_dude` at (39,17) and
  `npc_market_adventurer_lady` at (37,17), the two "Drinking" NPCs
  outside the Tavern) - neither has an actual Tiled flip-bit set on its
  tiles, and the sprite-cutout renderer has no flip/mirror capability at
  all right now, so this isn't a data toggle, it's real new code (adding
  a horizontal-flip option to the cutout draw call). Didn't want to
  build that and guess which of the two NPCs to apply it to blind -
  confirming which one (dude or lady) is the grey-haired one needing the
  flip would let this land correctly the first time.

### Not yet investigated this round
- **The tavern interior "entirely broken"** (missing animations, wrong
  layering, characters out of place) - this reads as a real multi-part
  rebuild (`tavern_1st_floor.json`/`tavern_2nd_floor.json`), not a single
  fix, and there wasn't room left in this pass to do it justice. Next
  thing to pick up.
- **Player character occasionally disappearing** - no repro steps yet,
  need more detail (which act/zone, does it come back, does moving fix
  it) before this is chaseable.
- **The Case Closed screen's wall of text, and whether NIGHTSHADE stays
  the Discord word or the epilogue becomes a puzzle command instead** -
  this is a real design question, not a bug, flagged for discussion
  rather than something to unilaterally redesign.

---

## v127: Lobby layout rework, from a live screenshot

Elle's screenshot of v125's lobby showed two real problems: the single
stacked column was too tall and scrolled, and `.subtitle` ("The gala is
gathering.") was nearly illegible.

- **Contrast bug, found via the screenshot, not guessed:** `.subtitle`
  used `--parchment-dim`, which in the Nyx (out-of-game) palette is a
  dark maroon (`#522747`) - correct for text sitting on the light
  `.card` surface (`--ink-surface: #e7e1e5`), completely wrong for text
  sitting directly on the dark screen background (`--ink: #34202f`),
  which is what `.subtitle` actually does. `#screen-lobby .hint-text`
  had already hit this exact same bug and been fixed before; `.subtitle`
  hadn't. Fixed the same way: `var(--parchment)` at reduced opacity
  instead. `.subtitle` is only used in this one place, so this couldn't
  regress anything else.
- **Two-column layout** (`.lobby-layout`, `index.html`/`style.css`): pen
  on the left, everything else (header, roster, host controls, the new
  invite box, leave button) in a right-hand sidebar. Height is capped to
  the viewport (`calc(100vh - 140px)`, `max-height: 760px`) instead of
  growing with content, and the sidebar itself scrolls internally
  (`overflow-y: auto`) if a big roster ever runs long, rather than the
  whole page scrolling. Collapses back to a single stacked column under
  760px, matching how every other bento-style layout on the site already
  handles narrow screens.
- **Invite link generator, new:** a `.lobby-invite-box` with "Copy Code"
  and "Copy Invite Link" buttons (`currentInviteLink()` builds
  `location.origin + location.pathname + ?code=...`), using the
  Clipboard API with a manual `execCommand("copy")` fallback for contexts
  where that API isn't available. The case code itself is shown directly
  now, no longer tucked behind the `<details>` toggle from v124/v125 -
  that de-emphasis made sense when the code was just "in case you need
  it," it doesn't once generating/sharing the link is a first-class
  sidebar feature.
- **Player names above heads in the pen** (`LobbyPen.drawNameLabel` in
  `client.js`), copied stroke-for-stroke from `overworld.js`'s own
  `drawNameLabel` so a name reads identically here and in the actual
  game, not as a visually distinct lookalike. Own name is looked up from
  `currentPlayers` by `state.myId` rather than tracked separately -
  that list already includes the caller's own entry (confirmed via
  `publicPlayerList` in `server.js`), so there was no need for new
  client state just to know your own name.

**Not yet tested live**, same as v124-126. This was built directly off
one screenshot rather than a full playthrough, so it's worth a fresh
screenshot (or better, an actual live look) to confirm the height math
holds up on Elle's actual screen size before assuming it's fixed for
good - viewport-relative sizing like this is exactly the kind of thing
that can look right on one monitor and wrong on another.

---

## v126: The Finale - accusation puzzle, epilogue, and the tunnel

### New act type: `finale_accusation`
Replaces the old `puzzle_group` stopgap (single typed answer, "ashgate")
entirely - that placeholder act, and its `answer`/`hint` fields, are gone
from `story.json`. In their place, chapter 5 is now three acts:

1. **`reveal` - "The Tunnel Back"** (`content/story.json`). Corwin's
   north-then-east smuggler's-route line, text only. **No map exists
   yet** - this is explicitly a placeholder bridge so the transition
   reads sensibly, flagged in its own body text as `[PLACEHOLDER]`.
   Once Elle delivers a Tiled export (Cave pack, confirmed unused
   project-wide via a full hash check against every asset already in the
   project, short corridor, no puzzles, matching the "Out of the Sewers"
   pattern), this should become a real `explore` or `staged_scene` act
   instead.
2. **`finale_accusation` - "The Finale"** (new act type, this is the
   actual puzzle). All its content, the passage template, the 4 blanks'
   word-bank options, the suspect defense lines, Hook's pushback lines,
   lives in `content/interactions.json` under a new `finaleAccusation`
   key - same "story.json just says which act, interactions.json holds
   the real content" pattern the Suspect Board already uses for
   `suspectBoard.pool`.
3. **`final` - "Case Closed... Or Is It?"** - same act as before, body
   rewritten with the actual epilogue (was a `[PLACEHOLDER]` bracket
   before). See "Epilogue" below.

### The accusation puzzle itself
- **Passage:** "Lord Duskmere was murdered by {WHO}. He was poisoned
  with {PLANT}, which the herbalist can verify. They wanted him dead
  because {MOTIVE}. On the night of the gala, {OPPORTUNITY}." Fully
  gender-neutral by design (no suspect names or pronouns in any option
  text except the WHO blank itself) - the murderer's identity isn't
  telegraphed by elimination anywhere in the word banks.
- **4 blanks, 5 options each**, matching the 5 suspects one-to-one for
  WHO/MOTIVE/OPPORTUNITY. PLANT deliberately does *not* map to
  suspects (nobody else is characterized as having considered a
  different poison) - its 5 options are the Herbalist's Hut's 5 real
  non-harmless specimens (monkshood correct, foxglove/nightshade/
  oleander/hemlock as decoys), confirmed against the actual cauldron
  puzzle data rather than assumed.
- **The old "THE LIE" blank (the Monk's false alibi) was cut entirely**,
  per Elle's decision - the Monk (already gender-neutral in the shipped
  content; "nun" was stale terminology from an old planning doc, not
  what's actually in `interactions.json`) only has a planted lie for 3
  of the 5 suspects, and inventing lore for the other 2 to force a 5th
  option would have contradicted what's already built.
- **Check order, server-side, in `evaluateFinaleSubmit` (`server.js`):
  WHO checked first, in total isolation.** Wrong WHO returns that
  suspect's own defense line and nothing else - the rest of the
  selections aren't even evaluated that attempt. Right WHO moves to
  checking PLANT/MOTIVE/OPPORTUNITY together, returning only a count of
  how many are wrong (1/2/3), never which ones - same "vague pushback,
  no specifics" principle the Suspect Board already uses for its own
  wrong-answer messages.
- **Shared, party-wide state**, not per-player: any player can set any
  blank (`finale:select`), everyone sees the same passage fill in live
  (`finale:state` broadcast). Submission is a unanimous ack
  (`finale:submit`), same pattern as the Suspect Board's `board:submit` -
  editing any blank after an agreement clears everyone's ack and
  requires re-confirming, also matching the board's existing behavior.
- **Answer keys never reach the client.** `buildActPayloadForPlayer`
  strips each blank's `correct` field before sending - the Suspect Board
  already does this (never sends `correctSet`), the first draft of this
  feature didn't match that convention and got caught and fixed before
  shipping.
- UI reuses existing classes throughout (`.fragment-card` for the
  passage, `.feedback`/`.progress-text` for status text, a new
  `.finale-chip`/`.finale-tray-*` set styled to match `.height-btn`'s
  existing look) rather than introducing a new visual language for one
  screen.

### Epilogue (the `final` act's body)
Ashgate's actual confrontation dialogue is written now (was bracketed
placeholder before): admits it without denying, delivers the "I wasn't
owed nothing, I was owed everything" line, then turns on Corwin exactly
as previously drafted. Added two small new beats around the existing
Corwin/Ashgate exchange (Thorne noting Corwin's gone quiet, twice) so the
Discord reveal about Corwin and Alaric's marriage lands as a pattern in
hindsight rather than one isolated moment. The Discord-side reveal text
itself (Hook and Alaric's secret marriage) lives outside this codebase,
in whatever delivers the Discord bot command - drafted in chat, not part
of this zip.

**Not yet tested live:** the entire accusation puzzle end to end - the
shared-selection sync, the WHO-then-count check order, the ack/submit
flow, and the UI itself on an actual screen. This is new game logic with
zero prior play history, treat it accordingly.

---

## v125: Character creation layout + walkable waiting room

### Character creation layout
- `.card-wide`'s contents split into `.character-options` (name/model/
  colour) and the existing `.avatar-preview-wrap`, both inside a new
  `.character-card-body` wrapper. IDs unchanged (`input-name`,
  `gender-row`, `preset-row`, `avatar-preview`), so nothing downstream in
  `client.js` needed touching.
- **Host mode (unchanged look):** `.character-card-body` stays `display:
  block`, same stacked layout as before - it sits in one half of a
  two-column bento next to Host/Join, not enough width for a side-by-side
  split there.
- **Invite mode (new layout):** once the Host/Join cards are hidden
  (`.landing-bento.invite-mode`), the card gets the full page width.
  `.character-card-body` becomes a centered flex row: customization
  options on the left, the avatar/character panel on the right, both
  wrapped and centered as one ~560px-wide composition. The "Join the
  Gala" button (`#landing-invite-action`) sits centered below the whole
  card, unchanged in function, just visually now reads as "bottom
  center" beneath the two-column layout above it.

### Walkable waiting room
Replaces v124's static roster-only lobby with a small walkable pen above
the roster. Deliberately **not** built on the Overworld tile engine - no
map exists for this yet, and the ask was explicitly "no collision needed,
just a boundary the size of the game window," so this is a standalone,
much smaller system:

- **New `LobbyPen` module in `client.js`.** Reuses the same character
  sprite manifest (`BASE_MANIFEST`, already loaded for the avatar
  preview) and the same direction-row/frame-grid convention as
  `overworld.js`'s `drawFrame`/`drawPlayer` (down/left/right/up rows,
  walk vs idle frame sets), but with its own tiny update/render loop
  running on `#lobby-pen-canvas`. No tiles, no collision grid - the
  canvas's own pixel bounds are the boundary, movement is just clamped to
  stay inside them.
- **Movement:** WASD/arrow keys, same key-handling and diagonal-movement
  math as `overworld.js`'s `update()` (horizontal wins ties), at 200px/sec
  in plain canvas pixel space (no world-scale concept here).
- **Multiplayer sync, server side (`server.js`):** new
  `room.lobbyPositions` (socketId -> {x,y,dir,moving}), following the
  exact same lifecycle pattern as `room.inventories` - initialized in
  `host:createRoom`, remapped on reconnect in `remapSocketId`, cleaned up
  in `player:leave`, included in every `broadcastRoomState` payload as a
  snapshot. New `lobby:move` handler relays a player's position to
  everyone else in the room; deliberately a no-op once `room.started` is
  true, since gameplay movement is the Overworld engine's job from there.
- **Multiplayer sync, client side:** `LobbyPen.onRoomUpdate()` seeds a
  starting spot for any newly-seen player (the server's last-known
  position if there is one, otherwise a deterministic scattered spot so
  nobody stacks exactly on top of anybody else) and drops anyone no
  longer connected. `LobbyPen.onRemoteMove()` updates a remote player's
  network-target position on every `lobby:move` event; a per-frame ease
  (`dispX`/`dispY` chasing `x`/`y`) smooths the visible motion between the
  ~80ms-throttled updates instead of visibly hitching.
- **Lifecycle:** `LobbyPen.start()`/`stop()` are wired into `showScreen()`
  itself - starts whenever `screen-lobby` becomes active, stops on every
  other screen transition (game start, leaving the lobby, reconnecting,
  etc). No screen-specific handler elsewhere needed to remember this.
- **Own colour/gender always read live** from `state.myGender`/
  `state.myColor` at draw time rather than being baked in on start, so a
  player still adjusting their look while standing in the pen (entirely
  possible, character creation and the pen are the same screen-adjacent
  flow) sees it update immediately, same as the existing avatar-preview
  canvas already does.

**Not yet tested live:** the whole pen, especially with more than 2-3
simultaneous connections (untested at real 6-10 player scale), and the
character-creation layout on an actual narrow/mobile viewport (checked
the CSS logically but not in a real browser at small widths).

**Decided against, not deferred:** a real Tiled-authored courtyard map for
the waiting room. Elle confirmed the blank pen is the intended final
version of this feature, not a placeholder waiting on a map - don't
resurface this as an open item.

---

## v124: Invite link and waiting room (superseded in part by v125 above -
## the invite-link mechanism below is unchanged, the "waiting room" it
## refers to is the earlier static version, now replaced)

Picks up the concept discussed in an earlier chat: guests should arrive
through an invitation, not a Host/Join screen, with a "waiting room" for
character creation before the gala begins. Implemented as a lighter-touch
version of that original plan, chosen deliberately over a bigger rebuild:

- **No server changes.** `host:createRoom` / `player:joinRoom` / the
  reconnect-token system are untouched. The host still clicks "Host a New
  Game" and gets a code exactly like before - the only difference is she
  now shares a link with the code baked in (`?code=F4K2Q`) instead of
  reading the code aloud. Chosen over building a persistent pre-created
  session system, since the existing room/token flow already does
  everything needed here with zero risk of regressing something that
  currently works.
- **New `#screen-invite` screen** (`index.html`): a House Duskmere
  invitation card, styled entirely with existing classes (`.card`,
  `.seal`, `.eyebrow`, `.btn-primary`), added to the Nyx out-of-game
  palette scope alongside landing/lobby. One button, "Accept Invitation."
- **Boot logic** (`client.js`, `boot()`): checks `?code=` in the URL on
  load. A saved session (returning player, refreshed tab) always wins and
  goes through the existing `attemptResume()` path unchanged. Only a
  fresh arrival with no session and a code param gets routed to
  `screen-invite`. Anyone opening the site directly with no code param
  (the host) sees the plain landing screen exactly as before.
- **Landing screen, invite mode:** "Accept Invitation" doesn't skip
  character creation - it reveals the same name/gender/colour card
  already used by both Host and Join, just hides the Host/Join cards
  (`.landing-bento.invite-mode` collapses to one column) and swaps in a
  single "Join the Gala" card that joins using the code from the URL, no
  typing required.
- **`joinRoomWithCode()` helper:** the manual "Join a Case" button's
  original logic was extracted into a shared function so the invite-flow
  join button reuses the exact same success/error handling rather than
  duplicating it.
- **Waiting room reskin** (`screen-lobby`): reused as-is functionally
  (same roster sync, same host "Begin" gating), reworded to gala framing
  ("The gala is gathering," "Guests arrived: N" live count, "Begin the
  Gala"). The case code moved behind a `<details>` toggle, kept for the
  host's own reference rather than removed outright, but no longer
  front-and-center for guests who don't need to see or share it.

**Explicitly deferred, per Elle's decision this session:** a walkable
waiting-room map (players see each other's characters arriving in a
courtyard before the gala starts) instead of this static screen. Elle may
build a Tiled map for this later; picking it up would mean teaching the
overworld engine to run a zone with no puzzle/act attached and a
host-only "Begin" trigger, real new scope, not a small add-on to what
shipped here.

**Not yet tested live:** the whole flow above, especially the boot-order
interaction between a saved session and a `?code=` URL param, and the
`joinRoomWithCode` extraction (behavior should be identical to the old
inline `btn-join` handler, but worth confirming the manual Join card
still works exactly as before now that the code moved into a shared
function).

---

## v123 (still unconfirmed - everything below is unchanged from the
## previous handover)

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
