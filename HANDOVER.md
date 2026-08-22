# Handover — A Study in Boralus, picking up after v148

This replaces the earlier handover from v122. Paste this as the first
message in a new chat, then attach the v148 zip.

## Where things actually stand

- **v147 was a bug-fix pass** driven entirely by Elle's live-tested
  screenshots: real dialogue that had been silently overwritten during
  the v146 tavern rebuild, a genuinely swapped-columns sprite, a missing
  animation frame, a dragon skeleton split across two layers, and an
  evidence object placement. See "v147" below for the full breakdown.
- **v148 adds late-join**: a player can now connect with the room code
  after the game has already started and actually join, not just
  reconnect to a seat that already existed. See "v148" below.
- **The Finale revamp is designed but not yet built.** Full agreed spec:
  static (non-walkable) estate backdrop, players on one side and the 5
  suspects on the other (both rendered with their real sprites/looks,
  not a placeholder illustration), Hook and Thorne centered and apart
  from both groups, the accusation "book" moved to the bottom of the
  screen as two side-by-side panes (blanks on the left, word-bank
  options on the right), and all pushback/reveal text (wrong-suspect
  rebuttals, Thorne's confirmation) rendered above the book, text only,
  no portrait reaction. Confirmed reusable as-is: all of
  `finale:select`/`finale:submit`/`finale:acknowledgeResult` and their
  evaluation logic - this is a client-side rendering and layout rebuild,
  not a server-side one. Suspect sprite `look` values already confirmed:
  Voss=fighter4, Kestrel=citizen3, Marrow=citizen2, Ashgate=ashgate_fancy
  (Ashby's still needs confirming), Hook=fighter3, Thorne=fighter5. This
  is the next thing to build.
- **One open item from v147, can't fully confirm without a fresh
  screenshot**: "the Maid clips through the rug" during her Act III
  staged scene. Checked her scripted path and the rug's actual tile
  extent - her endpoint sits just outside the rug, not overlapping it.
  Her path does cross right through where the dragon skull used to sit
  disconnected from its own spine (see the layer-split fix in v147
  below), so there's a real chance this was the same bug wearing a
  different description and is already fixed - but this needs eyes on
  the actual next build to confirm, not another guess.
- Packaged and validated (JSON parse, `node --check`, CSS braces,
  em-dash grep, BFS reachability across every touched map, all clean).
- Keep incrementing normally (v149 next) from here.

## v148

### Late joining

A player can now join a room after the game has started, not just
reconnect to a seat that already existed - `player:joinRoom` had exactly
one path for `room.started`, and it only matched a disconnected seat by
name; anyone else got a hard "this game has already started" error with
no way in.

Allowed at any point in the story, no cutoff - the party's evidence, the
board, and shared progress all live on the room itself, not on any one
player, so a latecomer isn't blocked by (or blocking) anything. They get
a fresh seat, an empty private inventory (evidence they didn't personally
collect just isn't theirs to hold; the shared Evidence Table and board
are unaffected either way), and land at the entrance of whatever zone the
story is currently in.

That last part turned out to already be free: every zone entry, for any
player, already goes through `enterExplore`/`enterStagedScene` on the
client, which always positions a fresh player at that map's own `spawn`
point via `Overworld.init`. Sending a late joiner the current act's
payload (`act:show`, same as the existing reconnect path already sends)
was enough - no new client code needed at all.

One real trap along the way: the natural-looking first draft pre-set the
new player's `zone` field and pre-joined their socket to that zone's
socket.io room, on the assumption that would just save a step. It
actually broke the join silently - `player:changeZone`'s own early-exit
guard (`oldZone === zone && already in that room`) would then fire the
instant the client's own `enterExplore` called `player:changeZone` a
moment later, skipping the entire announce/roster/occupancy-door setup
that handler is actually responsible for. The player would render into
the map correctly for themselves, but nobody else in that zone would
ever be told they'd arrived. Fixed by leaving `zone: null` and not
pre-joining any zone room at all - `player:changeZone` does the real
work exactly once, the same way it already does for every other kind of
zone entry in the game.

## v147

### Real dialogue restored after being silently overwritten

While rebuilding the tavern's 17 individual character cutouts last
round, every NPC's `interaction` field got set to a placeholder
`{"kind": "note", "text": name + "."}` - including three that already
had real, load-bearing dialogue: `npc_bartender_tavern` and
`npc_goblin_tavern` (both `two_stage_dialogue`, gated on
`voss_empty_chair` / `ashgate_plant_question`, part of the Means and
Opportunity clue chain) and `npc_gossip_guest` (a real one-shot
dialogue). Restored all three to their correct interaction configs.
Every other tavern NPC that only ever had flavor text now has an actual
written line instead of just restating its own name.

**Human Drinking removed entirely**, per explicit request, after
repeated visual problems. His dialogue turned out to be real content
(an alibi witness for Ashby, "buried in paperwork... talking about the
books not adding up") - rather than lose it, reassigned it to
`flavor_tavern_knight` ("A Weary Knight," who didn't have anything of
his own yet, and the "weary" framing already fit). Retitled the
dialogue entry to match; the actual lines are unchanged.

### San'layn duplication and five other silent duplicates

Root cause: the individual-cutout rebuild recorded only one layer name
per character (taken from its first tile) instead of each tile's own
true source layer - but six characters had tiles genuinely split across
different layers in the original art. That mismatch meant some tiles
never got zeroed out of the raw map data, so they kept rendering as
frozen, unanimated duplicates underneath the live sprite. Found this by
checking every registered cutout's tiles against what's *actually* at
that position on every character layer right now (not trusting the
recorded metadata), rather than re-deriving anything indirectly.
Zeroed all 17 stray tiles empirically; confirmed no non-zero tiles
remain anywhere on `Characters1/2/3`.

### The market adventurer, split and flipped

`npc_market_adventurer_lady`'s two tile columns were genuinely swapped
left-for-right at all three rows (confirmed by rendering the broken
composite, then the corrected one side by side). Swapped the gids back,
recomputed her content bounds from the corrected crop.

### The glassmaker, large on one half and tiny on the other

Real gap, not a rendering issue: 7 of his 8 tiles have a full 33-frame
animation, but one (the top-right corner) had no animation entry at
all, so it stayed frozen on frame 0 while the rest of him cycled
through motion. Reconstructed the missing sequence from the confirmed
+1 gid-offset pattern shared by every other left/right tile pair in his
sheet, verified every generated frame resolves inside the correct
tileset, and confirmed by rendering him at three different animation
frames that he's now consistently one figure throughout.

### The dragon skeleton, missing its own skull

The spine (43 tiles, `Objects3`) and the skull (6 tiles) were on two
different layers with no grouping between them, so the skull's Y-sort
key was computed completely independently from the rest of the coil it
belongs to - meaning it could (and did) end up hiding behind other
content the spine itself wasn't hiding behind. Confirmed by rendering
`Objects3` in total isolation: the coil was complete but genuinely
had no head. Merged the skull's 6 tiles directly into `Objects3` (the
layer it was always conceptually part of) rather than reach for
`layerGroups`, since the two are one physical object and belong on one
layer, not two coordinated ones. Re-rendered in isolation to confirm
the skull now moves and sorts as a single connected piece with the rest
of the spine.

### Herbalist's note repositioned

Moved onto the desk, matching the exact spot in Elle's screenshot
(next to the mushroom plate and open book) rather than its earlier
position over by the cauldron.

### Guild Hall desk interact points nudged down half a tile

## v146

### Tavern interior (`tavern_1st_floor.json`) - full rebuild from the real source

Elle provided the actual `.tmx` and its tileset PNGs, which made this a
real fix instead of more guessing. Parsed the infinite-map chunks directly,
confirmed the origin offset (-11,-10, matching this file's 26x20
dimensions exactly), and cross-referenced the TMX's own `NPCs` object
group (real names, real bounding boxes) against every character tile
cluster in the `Characters1/2/3` layers.

Found real, confirmed bugs, not guesses:
- **"Adventurers planning" was missing two of its three people** - only
  the seated planner was ever registered; the knight and the thinker
  existed as dead, unregistered tiles that never went through the
  cutout system at all (same class of bug as below).
- **"Card game" was missing its dwarf** - same pattern, one of three
  people never registered.
- **The draenei and San'layn were showing the wrong art at swapped
  positions** - one position had the correct (flipped) San'layn slot but
  was rendering the draenei's tiles instead, and the true draenei
  position wasn't rendering anyone.
- **The bartender had a leftover `drawScale: 0.5`**, rendering him at
  half the height of every other NPC in the room. Removed.
- **6 of 12 NPCs had zero animation data** despite using tiles from
  dedicated `Animation_*.png` source sheets - real frame sequences
  existed in the art, just never got extracted into the map's
  `animations` dict. Replaced entirely with the TMX's own authoritative
  `<animation>` definitions (no more inferring frame layouts by eye).

First attempt merged each multi-person scene (adventurers, card game,
drinkers) into one combined cutout per name, matching the original
12-object structure - this was wrong, since scaling a 3-person spread
down to one NPC's fixed height just crushed everyone into an overlapping
pile. Caught this from a render, split back into one cutout per
individual character (17 total now), each independently sized from its
own alpha-trimmed content bounds. Confirmed by rendering the actual
tables: the adventurers' table now shows all three people distinctly
seated, the card table shows three separate players, the draenei and
San'layn sit together correctly.

### Chapel (`chapel_interior.json`) - real placement bug found and fixed

Cross-referenced against the real chapel `.tmx`. `flavor_parishioner_3`
was sitting a full tile to the left of its true position (x12-14 instead
of the correct x13-15) - every other character (both other parishioners,
the priest, all 4 monks) matched the source exactly. Fixed the tile
positions, anchor, and map-linear `index` field, confirmed with a render.

**Separately diagnosed, fix designed but not yet applied**: all three
parishioners still read as oversized next to the priest and monks. Root
cause isn't a data bug like the above - it's that the parishioners are
captured as bust-only crops (seated, shoulders-up) while the priest and
monks are captured as full standing figures, and both get stretched to
the same fixed on-screen character height. The parishioners' small crop
gets inflated disproportionately as a result. Fix is a `drawScale`
correction on the three parishioner cutouts, sized to preserve their
true proportion relative to the monks (same asset pack, same native
pixel scale) - worked out but not yet written to the file as of this
delivery.

### Project-wide latent bug found and fixed: sprite cutout `index` field

While rebuilding the tavern, noticed the `index` field on cutout tiles
is meant to be the tile's position in the map's own flat array
(`y * width + x`) - used for door/gating-state lookups - not a local
tileset index. Every NPC rebuilt this session (the tavern's 17, plus the
glassblower fix from a few rounds back) had this wrong, computed as
`gid - firstgid` instead. Had zero visible effect currently (none of the
affected layers use gating), but swept the whole project and corrected
every instance (102 total) for correctness going forward. Flagged in
case this pattern shows up again in future map work - the two fields are
easy to conflate.

### Verified clean, no changes needed

- **Market exterior (`town_exterior.json`)**: checked all 11 named NPCs
  against the real TMX (name, position, animation) - all correct. The
  two that looked static (witch seller, guy eating chicken) are
  correctly static per the source data itself, confirmed byte-for-byte
  against the TMX's own animation definitions.
- **Tavern's exterior building**: rendered in isolation, roof correctly
  caps the walls, sign/balcony/ivy all layer correctly.
- **Act 3 portraits**: searched the entire project (`interactions.json`,
  `story.json`, every map file) for any active `portrait` field - none
  found. This already appears to be off everywhere; worth confirming
  against whatever build gets tested next, since this project has hit
  the "fixed here, not sure what's live" gap more than once this
  session (see the cave map and herbalist note from earlier rounds).

## v145

### UI/UX pass

- **Lobby**: removed the separate "Copy Code" button entirely, keeping
  just "Copy Invite Link". Clicking it now shows a checkmark on the
  button itself (swaps in for the label text for 2s, then reverts) -
  no more separate feedback line below the box. The Case Code box wraps
  tightly now that that line is gone. Root-caused the lingering
  scroll-on-page issue from a previous pass: `.lobby-layout`'s height
  calc (`100vh - 260px`) was undercounting the page's real chrome
  (header, hint lines, `#app`'s own padding) by close to 150px on
  typical viewports. Corrected the math and gave the lobby its own
  tighter bottom padding via a new `#app.app-lobby` class, toggled the
  same way `#app.app-wide` already was for the game screen.
- **Invitation screen**: reskinned onto the game's own wood-framed
  parchment panel art (`panel_dialogue.png`, the same border-image the
  in-game dialogue boxes use) instead of the plain dark settings-card
  look, and extended the copy to be more theatrical, per request.
- **Character creation**: the "Your Name" input was practically
  invisible (an 8%-opacity tint on a light card, with matching
  low-contrast text) - given real contrast instead (solid light fill,
  dark ink text). Shrunk the "Join the Gala" box, removed the dead space
  above its button (the shared `.error-text`'s reserved height plus the
  default button margin, neither of which this one-line confirmation
  card needed), and added real spacing above it from the character
  card.
- **The Frame-Up cutscene**: Thorne shifted from x=13 to x=12.5,
  centering her in the red chair, which the map data confirms spans
  tiles 12-13. Voss given a `sortBoost` so he renders in front of the
  desk instead of behind it, and his walk-in slowed (1600ms default ->
  4500ms). Found and fixed the actual cause of leftover interact
  tooltips bleeding into the cutscene: `enterStagedScene` was hiding the
  interact button once on entry, but never clearing the underlying
  `isNearInteractable`/`currentNearbyObj`/`activeVnObjId` state - so
  closing a leftover dialogue panel, or a candle-state broadcast
  arriving mid-scene, could resurrect the old prompt. Now cleared
  explicitly alongside the button hide.

### Guild Hall desk & walkability pass

Driven by two rounds of Elle's own annotated screenshots, the second
pass measured pixel-precisely against the actual uploaded image (not
eyeballed) to get exact tile coordinates for every red/yellow/purple
region:

- Walkable area reshaped to match Elle's traced path: several rows at
  the top (1-3) sealed back up, the bottom hallway narrowed to specific
  gaps rather than being fully open edge-to-edge, and a new path opened
  through cols 12-16/rows 8-10 past the dragon's tail.
- The two interact points moved twice this round, ending at the exact
  tiles Elle marked: **"The Evidence"** at (9,6) and **"The Vote"** at
  (10,6), sitting directly on the desk itself (the drawer box and the
  open book respectively). Since the desk stays solid furniture, carved
  a one-row walkable approach strip directly in front (row 7) so there's
  always a tile to interact from - same pattern as every other
  "interact with something sitting on a solid surface" spot in the
  project.

### Root-cause investigation pass

- **Guild Hall layering ("periodically incorrect")**: found a real bug,
  not a guess. `guild_hall_ground.json` had a `layerGroups` entry
  lumping all five `Objects1`-`Objects5` layers into one shared Y-sort
  key - correct for a single structure split across purpose-named
  layers (a roof + walls), wrong here, since these five layers actually
  hold five *unrelated* furniture pieces (bookshelves, the side
  boards, the desk, the dragon skeleton, the stool), each already fully
  self-contained within its own layer. The grouping meant the desk or
  bookshelf could get dragged into sorting against the dragon's tail or
  the bench several rows away, purely from sharing a layer-name prefix -
  exactly the intermittent symptom reported, since it only misfires
  when the player's position falls between an object's real depth and
  the group's borrowed one. Removed the grouping. Fixes both the live
  player and the Maid's "The Maid Returns" cutscene, since both read the
  same map data. Checked every other map's `layerGroups` for the same
  overbroad pattern - none found, the other three are legitimate
  single-structure splits.
- **Herbalist's Hut - "nowhere to read the note"**: the note itself
  (`prop_victim_notes` in `herbalist_interior.json`) was always
  correctly wired - it's the one object that actually unlocks the
  herbalist's real dialogue via `learnsFact: "read_victim_notes"`. The
  bug: it sits on bare floor with zero visual representation. `"note"`-
  kind objects are deliberately excluded from the generic interact-dot
  marker project-wide, on the assumption they always sit on some
  existing visible prop (a door, a plant) - this one doesn't, so it was
  genuinely undiscoverable even though mechanically reachable. Added
  `showMarker: true`, the documented opt-in for exactly this case.
- **"No cave map"**: could not reproduce. `cave_shortcut.json` exists,
  every one of its 11 referenced tileset PNGs is present on disk, it
  renders as a complete cave scene when composited directly, and every
  waypoint in its walk path is open and mutually BFS-connected. Best
  guess, stated plainly rather than invented as a fix: this file made it
  into a working session's files at some point but was never actually
  included in a zip that got tested live. It's included in this
  delivery either way - worth a fresh look once it's live.

## v144: Glassmaker reachability and animation, root-caused and fixed

Elle reported the Glassmaker still couldn't be reached by walking (not
just "interact doesn't fire" - literally couldn't get close), plus a
specific animation gap ("something missing on top of his head when he
turns back to the furnace"). Rendered the actual map (tiles + collision
composited together, not just read numbers) to see what a player
actually sees, rather than trusting the raw grid alone - this is what
found both real bugs.

**Reachability, root-caused:** his registered interact position (9, 6)
sat on a walkable tile, but that tile is visually *inside* the
furnace's stonework - nowhere a player would ever think to walk. His
actual visible sprite (the animated cutout) stands a full row further
south, right at the workbench - and that tile (row 7) was collision-
blocked. Players were walking up to where they could see him, hitting
an invisible wall, and never reaching the tile the game was actually
checking proximity against. Fixed by opening collision at (9-10, 7) and
moving the interactable to (9, 7), matching where he visibly stands.
Confirmed with a fresh composite render (his marker and his visible
feet now land on the same open tile) and a full BFS reachability sweep.

**Animation gap, root-caused:** his sprite cutout only ever captured a
2-tile-tall block (map rows 5-6). Checked the source spritesheet
directly against every stage of his 33-frame work cycle (sitting,
turning to the furnace with the pipe raised, the glass bulb growing,
turning back) and found real content above *and* below that captured
block for several stages - the raised pipe/head during the "turning to
the furnace" frames (rows 12-17 of the cycle) sits one tile above what
was captured, and his feet/shadow sit one tile below, in *every* stage.
That upper-row content was still being drawn, just as an ordinary
animated map tile completely separate from his cutout - and once
separated from the rest of his body by the cutout's own Y-sort logic,
it now had no vertical run beneath it and sorted as pure background,
drawing *behind* his own body instead of on top of it. Invisible, not
missing - exactly matching "something's not there when he turns back."

Per your instruction, fixed this the way you asked rather than patching
around it: pulled all four extra tiles (top row and bottom row, both
columns) directly into the cutout itself, so the whole 4-row block
renders as one coherent draw call using the same animated-tile lookup,
instead of some of it being handled by Tiled's separate per-tile
animation system. Recomputed the crop bounds properly too - not
guessed, taken as the true pixel union across all 33 animation frames
(the same standard already used elsewhere in this project for anything
with an extended-reach animation, like a sword swing), so nothing in
any stage of his cycle clips again. Confirmed by rendering sample
frames across the full cycle, including the previously-broken "pipe
raised" stage - the top of his hair and the glowing glass tip both draw
correctly now, in every frame.

**Parishioners - genuinely still open, and here's exactly why.** Went
back through this map's data specifically looking for a reason two
parishioners would render larger than a third. Found none: all three
parishioner cutouts use the same fixed draw-height formula every other
cutout NPC in the game uses, their aspect ratios are within a few
percent of each other (0.77-0.82), and none of them has a `drawScale`
override (the mechanism this project already uses when something
genuinely does need to render bigger, like the Blacksmith). Based on
the data alone, there's no reason these three should look different
sizes on screen right now. Two honest possibilities: either this was
already resolved by unrelated work between when that screenshot was
taken and now, or the "large" objects in that screenshot are actually
the big decorative ghost/dragon statue figures on either side of the
pews (background art, not parishioners at all, and not sized via this
same system). A fresh screenshot of the current build would settle it
either way - not fixing blind against a screenshot that may already be
stale.

## v143: bug-fix pass from live testing (on top of v142)

Elle tested v137 live and reported ten issues. Checked each directly
against the current (v142) codebase before touching anything, since
v137 predates v142's tavern fix - none of the ten turned out to already
be fixed by that work, all ten were still live.

**Fixed:**

- **Lobby case-code box background.** `.lobby-invite-box` was using
  `var(--ink-surface)`, which resolves to the light Nyx card color in
  the lobby - looked like a separate pale card floating on the dark
  page, not matching the darker in-game panel color from the reference
  screenshot. Hardcoded that box specifically to the in-game
  `--ink-surface` value (`#3e3546`) rather than following the lobby's
  light theme, and lightened its label text to match.
- **Lobby layout - case code box and Begin button not aligned to the
  pen's bottom edge.** Only the Leave button had `margin-top: auto`,
  which pushed it alone to the bottom while the roster and everything
  above it (host controls, invite box) stayed packed at the top -
  leaving a large gap. Moved `margin-top: auto` to the host-controls/
  waiting-text block instead (whichever is visible - they're never both
  shown at once), so the whole bottom cluster travels down and lands
  together, flush with the pen box's bottom edge.
- **Players not appearing in the "Means and Opportunity, Interrupted"
  cutscene.** Found a real gap in `player:changeZone`'s rejoin guard:
  when a player's stored zone already matched the target zone (e.g. the
  last player to visit the Evidence Table upstairs, right before this
  same-zone cutscene fires), the server skipped resending them a fresh
  `zone:roster`, leaving their view of who else is in the room stale.
  Fixed by always sending the roster on zone entry, not just on a real
  zone change. This is a genuine, general fix, not scene-specific - it
  protects every same-zone reload in the game, not only this one scene.
  **Flagging honestly: this could not be tested in true multiplayer
  here, so this is the most likely cause based on direct code reading,
  not a confirmed-live fix. Worth being first checked in the next live
  session.**
- **Commodore not visible during the Frame-Up cutscene.** His scripted
  walk ended at `[12, 9]`, well outside the camera frame (centered on
  `[12, 5]`, where the desk and Thorne actually are). Moved his endpoint
  to `[12, 6]`, right at the desk, confirmed walkable.
- **Guild Hall: extra desk removed.** Both the redundant desk object
  (`flavor_guild_hall_desk`, "The Desk") and its underlying tile art (a
  3x3 furniture block in the `Objects5` layer at the same position) are
  gone. The real desk, under the dragon skeleton, is untouched.
- **Guild Hall: the board split into two real interact points, per
  Elle's direction.** Rather than relabeling the existing vote trigger
  as "the board" (which would have made a walk-up object named "The
  Board" silently open the wrong thing), added a genuinely new
  interaction kind (`open_board`, opens the same Means/Opportunity panel
  the HUD button already does) and placed it as **"The Evidence"** at
  the desk (11, 12) - right where the old duplicate desk used to be, now
  freed up. The existing vote trigger was kept in place and renamed to
  **"The Vote"** at (9, 12), no behavior change. Both confirmed walkable
  and reachable.
- **"Exit" vs "Enter" labeling, fixed project-wide, not just Guild
  Hall.** The button text was hardcoded to say "Exit" only when a
  zone_exit's `targetZone` was literally `"estate"` - correct for the
  original estate/manor exits, but wrong for every Act 3 building, whose
  exits target a town zone instead (`guild_hall_exterior`,
  `town_exterior`, `training_ground`, etc.), so they all read "Enter" on
  the way out. Re-derived the label from each object's own name instead
  (things named "Outside," "Exit," "Back to...," "Out to...," "A Way
  Out" read as exits; everything else - "Manor Stairs," "Guild Hall
  Entrance," "The Tavern," and so on - stays "Enter"). Checked this
  against every `zone_exit` object in the project before shipping:
  fixes Guild Hall, Blacksmith, Chapel, Glass Workshop, the Tavern, and
  Training Ground's own "Back to the Guild Hall," without touching the
  dungeon (which already overrides to "Continue" regardless, untouched)
  or any of the correctly-labeled entrances.
- **Chapel: plants and stained glass behind the priest getting cut off.**
  This turned out to be the same root cause already found and fixed in
  the tavern this same round (see v142) but not yet swept into other
  maps: `chapel_interior`'s `Walls` and `Walls_top` layers are both
  full-width background wall art tagged `sorted` (competing for Y-sort
  priority against nearby low-numbered rows) instead of `floor` (a
  static backdrop that never fights for priority). Confirmed by direct
  occupancy check before touching anything - `Walls` is 100% occupied
  across rows 0-5, `Walls_top` 100% occupied across rows 13-16, both
  clear signs of architecture, not furniture. Reclassified both to
  `floor`, same fix already proven on the tavern and the manor before
  it. This was on the v142 "found but not yet fixed" list for exactly
  this map - now done.

**Investigated, not fixed - genuinely unresolved, flagging rather than
guessing:**

- **Glassmaker still not interactable.** Checked his dialogue wiring
  end to end (map object, `two_stage_dialogue` interaction, server
  handler, both surface and reveal entries in `interactions.json`) and
  it's all correctly present - he should always have *something* to say,
  even before his trigger fact is known. Checked collision around him
  too; he's standing on open floor with a walkable approach. Nothing
  found that would explain a dead interact button. This needs a fresh
  screenshot or a live repro to chase further rather than a guess.
- **Missing animation tiles in the Glass Workshop.** Not chased down yet
  - didn't want to spend the remaining budget guessing at which of the
  8 tilesets this map references might be affected without a specific
  symptom to check against (the tavern had a similar, confirmed gap of
  entirely un-uploaded tileset PNGs this same project - worth checking
  `glass_workshop`'s own tileset files exist under
  `public/assets/mapsrc/glass_workshop/` next, same way that was
  diagnosed there).
- **Front parishioners too large.** Genuinely inconclusive. The sprite
  cutout system normalizes every cutout to the same fixed render height
  regardless of its own crop box dimensions, so a simple size/aspect
  difference between parishioners shouldn't produce this on its own -
  which means if it's real, something else is off (a bad crop that only
  captured part of a figure, similar to the tavern's earlier "giant
  head" bug, is the leading guess but unconfirmed). Needs a closer look
  at the actual crop data with a live screenshot in hand before
  touching it, rather than an unverified fix.

## v142: the tavern's real root cause, found

Elle asked directly whether the tavern NPCs were actually fixed, given
they'd come up in every single bug-testing round, and floated rebuilding
the room from scratch. Worth being straight about this: every earlier
fix (the flip-bit bug in v129, the merged-two-characters bug in v132,
the giant-head bust-NPC bug in v133, the below-table sort-key bug in
v136) was real and correctly diagnosed at the time - but none of them
were tested live before the next round, and this round's investigation
found a genuinely different, bigger bug underneath all of them that
none of the earlier passes had touched.

**Re-verified the v136 sort-key fix mathematically first**, since it
was shipped untested. Simulated the exact same logic the game runs and
checked every one of the tavern's 12 NPCs against every "sorted" layer
in the room, not just the narrow window the fix itself checks - and
found 10 of 12 still had furniture that would out-sort them, contrary
to what the earlier verification (which only checked "did the number
change," not "is it actually now correct") had shown.

**Root cause: `Walls_top1` was misclassified.** Checked its actual tile
occupancy directly rather than assuming - it's fully occupied across
the *entire width* of the room at rows 16 through 18. Rendered it in
isolation to confirm: it's not furniture at all, it's the room's own
back wall and baseboard. Because it was tagged "sorted" (competing for
Y-sort priority against players, same as furniture) instead of "floor"
(a static backdrop that never fights for priority), and its "bottom of
run" reached row 18, *any* character standing anywhere in the room with
a smaller row number - which is most of the room - was sorting behind
the entire wall, not just its own nearby furniture. This is almost
certainly what's been reading as "NPCs bugging out and hidden" across
multiple rounds, distinct from (and underneath) every other bug already
fixed.

Reclassified `Walls_top1` from `sorted` to `floor` (matching the exact
same fix already used successfully elsewhere in this project for
decorative wall trim, e.g. the manor's own `Walls`/`Walls2` layers).
Re-ran the full 12-NPC verification afterward: 8 of 12 immediately came
back clean. Two of the remaining four turned out to be a second,
smaller instance of the same root cause - `Furniture3` on the 2nd
floor... 

**Checked the 2nd floor too, found the identical bug.** `Walls_top1`
there is fully occupied at rows 0 and 14-16 (top and bottom walls,
joined by a single-tile support beam) - reached a bottom-of-run of 16
out of 17 total rows, while the floor's only NPC sits at row 7.
`Walls_top2` was also suspiciously wide (24 of 26 columns at rows 8-10,
immediately next to that same NPC) - almost certainly another wall
segment, not furniture, given real furniture doesn't typically span
that much of a room's width. Reclassified both.

**Swept every other map with cutout NPCs for the same pattern**
(any "sorted" layer with a row that's 90%+ occupied across the map's
full width, a strong signal of a wall rather than individual furniture)
- found similar full-width wall layers in `blacksmith_interior`,
`chapel_interior`, `glass_workshop`, and both `mage_tower` floors.
**Not yet investigated or fixed** - none of these have been reported
as currently broken, and given the Saturday timeline, chasing bugs
nobody's hit yet felt like the wrong priority over verifying the one
actually reported. Worth checking this same pattern first if any of
those rooms come up in a future round, rather than starting from the
merge/size/flip-bug checklist again.

**Final state, re-verified with a tighter, more meaningful check** (only
counting furniture within plausible visual-overlap distance of a
character, not "anywhere in the same column at any distance," which was
producing false positives): **10 of 12 tavern NPCs are now fully clean.**
The remaining two ("A Sleeping Drunk" and "the Draenei/San'layn pair")
were checked directly with a render - the "remaining" furniture flagged
for them is a separate, unrelated table elsewhere in the room that
doesn't actually visually overlap either character, confirmed by eye,
not just by the numbers.

**On "should we start from scratch":** no - the underlying architecture
(tile-based Y-sort plus the sprite-cutout system) is the same one
working correctly in every other room in the game. The tavern took
several rounds because it's genuinely the busiest, most furniture-dense
room in the project, and it had four distinct, unrelated bugs stacked
on top of each other (flip corruption, a bad character merge, oversized
busts, and now this wall misclassification) - not one bug that kept
surviving fixes. This round's finding was the last and biggest of them,
not evidence the approach itself doesn't work.

**Not yet tested live** - same caveat as everything else touched this
week. High confidence based on direct measurement and visual spot-
checks, but this specifically deserves to be the first thing looked at
in Saturday's pass, given the history.

## v141: one consistent title pattern across all five chapters

v140 flagged a real split rather than guessing which way to resolve it:
chapters 2 and 5 had the title card announce the chapter's puzzle name
while a separate intro card carried its own distinct scene title, but
chapters 3 and 4 just reused one title straight through everywhere.
Elle confirmed she prefers the distinct-title version. Applied it to the
two chapters that didn't have it yet:

- **Chapter 3's intro card** ("Corwin brings you to the Guild Hall...")
  retitled from "Means and Opportunity" to **"The Guild Hall"** - names
  the actual place, same convention "The Cells" already uses for
  chapter 2. The title card and the puzzle itself both stay "Means and
  Opportunity," unchanged.
- **Chapter 4's intro card** ("Corwin leads you off the road and into
  the swamp...") retitled from "The Herbalist" to **"Into the Swamp"** -
  a journey/arrival beat, same shape as chapter 5's "Behind the Garden
  Wall." The title card and puzzle both stay "The Herbalist," unchanged.

No body text, chapter numbers, or anything else touched - this was
purely the two `title` fields. Every chapter now reads the same way:
title card announces the chapter's puzzle name, the intro card in
between has its own distinct scene-specific title, the puzzle itself
matches the title card. Confirmed by re-running the same sequence check
from v140 - full breakdown below.

```
[game start] -> Act I title card
Ch1: The Gala / The Investigation Begins (intro) -> Investigate the Estate (puzzle) -> ...
Ch2: Act II title card "The Dungeons" -> The Cells (intro) -> The Dungeons (puzzle)
Ch3: Act III title card "Means and Opportunity" -> The Guild Hall (intro) -> Means and Opportunity (puzzle)
Ch4: Act IV title card "The Herbalist" -> Into the Swamp (intro) -> The Herbalist (puzzle)
Ch5: Act V title card "The Finale" -> Behind the Garden Wall (intro) -> The Finale (puzzle)
```

Chapter 1 is the one natural exception, kept as-is (two intro cards
sharing the chapter's own opening rather than a single distinct-title
one) - it's the chapter without a preceding title card of its own to
announce a separate name against, so the pattern doesn't quite apply
there the same way.

## v140: Act number consistency, checked programmatically

Elle asked to confirm every Act number and title lines up across every
title card and intro card. Rather than eyeball the sequence again after
getting it wrong once already (see v138/v139), wrote a small script to
check it directly: every act's own `chapter` field, whether the number
ever goes backward or skips, and whether every title card's announced
number matches what the very next act actually displays.

**Found two real bugs**, both the same shape: a closing cutscene tagged
with the chapter it was *about to announce* instead of the chapter it
was *actually finishing*.

- `"Out of the Sewers"` was tagged chapter 3, but it's the cutscene that
  closes chapter 2 (`"The Dungeons"`) - same role "Means and Opportunity,
  Interrupted" plays for chapter 1, and that one was already correctly
  tagged chapter 1, not chapter 2. Fixed to chapter 2.
- `"The Tunnel Back"` and `"Through the Tunnels"` were both tagged
  chapter 5, but they close chapter 4 (`"The Herbalist"`). Fixed both to
  chapter 4.

Neither was visibly broken before this - `staged_scene` acts don't show
their own chapter eyebrow during play, so nothing was actually on
screen showing the wrong number. But it's real data inconsistency all
the same (fails the exact check being asked for here, and would bite
the moment anything else ever reads `act.chapter` for these two scenes),
so worth fixing regardless of whether it was currently visible.

Re-ran the check after fixing: chapter numbers now climb cleanly
(I -> I -> II -> III -> IV -> V, every act, no skips or reversals), and
every title card's announced number now matches the next act's own
number exactly, 4 for 4.

**One thing surfaced, not changed - a genuine judgment call worth a
quick decision:** titles don't follow one single rule the same way
numbers now do, and it's a real but*intentional*-looking split:

- Chapters 3 and 4 reuse one title straight through (title card, intro
  card, and puzzle are all "Means and Opportunity" / all "The
  Herbalist").
- Chapters 2 and 5 instead have the title card announce the chapter's
  puzzle name ("The Dungeons", "The Finale") while a separate intro card
  in between carries its own distinct scene title ("The Cells", "Behind
  the Garden Wall").

Both patterns are internally consistent with themselves, and the second
one is used identically in two different chapters now, so it doesn't
read as a mistake - but it does mean the game doesn't follow one single
title convention throughout. Didn't force these into uniform matching
strings unilaterally, since that would mean either flattening two
evocative scene-specific titles into duplicates of their chapter's
puzzle name, or renaming puzzle titles instead - a real content
tradeoff, not a bug fix. Flagging for a decision rather than guessing.

## v139: title card vs intro card, actually correct this time

v138's audit treated "title card" as satisfied by the small persistent
"Act N" eyebrow every act already shows, and let a couple of chapters'
inline intro text stand in for a real "intro card." Elle sent two direct
screenshots clearing this up - they're two completely different, both
genuinely necessary screens:

- **Title card**: black background, nothing but the eyebrow ("ACT III"),
  the title, and a single "I'm Ready. Continue" button. No body text at
  all. This already existed as its own mechanism
  (`showStagedSceneReadyButton`), just wasn't being shown at every
  transition.
- **Intro card**: the normal in-game dark panel, same eyebrow + title,
  but with real narrative body paragraphs underneath, its own "I'm
  Ready. Continue" button, and a live "X / Y ready" progress line. This
  is a full `reveal`-type act - a separate screen the party clicks
  through, not text folded into the puzzle screen that follows it.

Re-checked every chapter against that precise definition and found two
real, genuine gaps (not the one I'd dismissed before):

- **The game had no title card at all before Chapter 1.** Every later
  chapter gets one automatically (a `staged_scene`'s fadeOut with
  `nextActEyebrow`/`nextActTitle` triggers it), but the very first thing
  anyone ever saw was "The Gala" reveal directly - no black card first.
  This needed genuinely new plumbing, since the existing mechanism only
  ever fires off the back of a staged scene's own fadeOut, and there
  isn't one before the game has even started. Added it properly: on
  `host:startGame`, the server now holds `actIndex` at `-1` (an already-
  established "not really started yet" sentinel elsewhere in this
  codebase, not something new I invented) and broadcasts a
  `game:titleCard` event ("Act I" / "The Gala") synced the same
  party-wide-ready way every other transition already works, only
  loading the real act 0 once everyone's clicked through. Client-side,
  reused the exact same title-card rendering function chapter
  transitions already use (just made its acknowledgment event
  configurable, since there's no real "current act" yet for the
  existing `act:acknowledgeReveal` handler to check against) - so this
  is visually and behaviorally identical to every other title card, not
  a new one-off look.
- **Chapter 5's Finale had no intro card either** - it only had inline
  text (`introThorne` in `interactions.json`) shown as part of the same
  screen as the accusation puzzle itself, which is exactly the pattern
  I'd wrongly treated as "close enough" in v138. Added a real, separate
  `reveal` act, "Behind the Garden Wall," carrying the actual narrative
  beat (climbing out of the tunnel, Thorne waiting, "might as well hear
  what you've got"). Trimmed the old inline `introThorne` down to a
  short one-line bridge ("Lay it out for her, then...") so the same beat
  doesn't play twice in a row - the full version now lives in the real
  card, the puzzle screen just picks up from there.

### The full sequence now, chapter by chapter
```
[game start] -> Act I title card
Ch1: intro card, intro card -> puzzle -> evidence_room -> cutscene -> Act II title card
Ch2: Act II title card -> intro card -> puzzle -> cutscene -> Act III title card
Ch3: Act III title card -> intro card -> puzzle -> cutscene -> Act IV title card
Ch4: Act IV title card -> intro card -> puzzle -> cutscene, cutscene -> Act V title card
Ch5: Act V title card -> intro card -> puzzle -> final
```
Every chapter now has a genuine, separate title card *and* a genuine,
separate intro card, matching the two example screenshots exactly.
Chapter 1's second intro card and the extra `evidence_room` step are
still deliberately left as-is (real, working, tested content that adds
depth rather than breaking the pattern) - flagged again here in case
that read differently once the actual definitions were corrected, but
the reasoning from v138 still holds under the corrected definitions too.

**Not yet tested live** - the new pre-game title card in particular is
genuinely new plumbing (the only piece of this whole sequence that
wasn't just rearranging existing, already-working mechanisms), worth
being first on the list for Saturday's live pass.

## v138: story structure audit against title/intro/puzzle/cutscene

Checked every act in `story.json` end to end against the requested
rhythm. Two real bugs found and fixed, one real content gap filled, and
a few deliberate non-changes explained below rather than silently left
unaddressed.

### Fixed
- **"The Maid Returns" mislabeled its own transition.** Its
  `nextActEyebrow`/`nextActTitle` said "Act III / The Herbalist's Hut",
  but the act it actually transitions into is chapter 4's "The
  Herbalist" - a real off-by-one in the chapter number, plus a title
  that didn't match the real next act's title at all. Now correctly
  reads "Act IV / The Herbalist".
- **Chapter 2 had no intro card at all** - every other chapter has a
  dedicated `reveal` beat before its puzzle; chapter 2 jumped straight
  from the "Act II" title card into "The Dungeons" explore act, with
  nothing but a brief mechanical one-liner ("get back together, get out
  of the dungeons") and no bridge from actually being arrested at the
  end of the previous scene. Added a short new reveal, "The Cells",
  narrating the walk down and the party being split into separate
  cells - picks up directly from Thorne's "take them down to the cells"
  line, sets mood before the mechanical explore-act intro takes over.

### Checked, confirmed already fine, no change needed
- **Chapter 1's opening has no title card before it** - true, but
  every reveal and explore act already shows its own persistent "Act
  N" eyebrow automatically (confirmed directly in the render code, not
  assumed), independent of the separate, more dramatic full-screen
  transition card shown at `staged_scene` handoffs. Chapter 1's very
  first screen ("The Gala") already displays "Act I" as part of its
  normal heading the instant it loads. Building a whole new synced
  pre-game title-card screen just to add a redundant, more dramatic
  version of information that's already visible felt like the wrong
  trade against a Saturday deadline - flagging this explicitly as a
  conscious call, not an oversight, in case the dramatic full-screen
  version specifically is wanted later.
- **Chapter 5's puzzle (the Finale accusation) has no separate intro
  card either** - checked its own inline intro text
  (`finaleAccusation.introThorne` in `interactions.json`) and it
  already covers this beat properly ("Captain Thorne is waiting when
  you climb out from behind the garden wall..."), same pattern every
  explore act already uses (an inline intro paragraph rather than a
  separate reveal screen). Didn't add a redundant standalone card on
  top of already-good existing content.
- **Chapter 1 has two reveal cards in a row before its puzzle** ("The
  Gala" then "The Investigation Begins") rather than one. Both are
  short, serve genuinely different narrative beats (the murder's
  discovery, then Thorne's recruitment briefing), and neither reads as
  padding - left alone rather than force a merge that would lose one of
  the two.
- **Chapter 1 has an extra `evidence_room` act (the Suspect Board)
  between its puzzle and its cutscene** - real, working, tested content,
  not a stray leftover. Reads as an extension of the puzzle phase for
  that chapter rather than a violation of the pattern - left alone.
- **Chapter 4/5's cutscene is two `staged_scene` acts back to back**
  (the Herbalist's Hut farewell, then the cave crossing from v137)
  rather than one - this was built exactly this way at Elle's own
  request last round (a fade-to-black between two connected beats), so
  it's treated as one conceptual "Cutscene" step for this audit, not
  a second violation stacked on top of the first.

### The full sequence now, chapter by chapter
```
Ch1: [game start] -> reveal, reveal -> explore -> evidence_room -> staged_scene -> [Act II card]
Ch2: [Act II card] -> reveal -> explore -> staged_scene -> [Act III card]
Ch3: [Act III card] -> reveal -> explore -> staged_scene -> [Act IV card]
Ch4: [Act IV card] -> reveal -> explore -> staged_scene, staged_scene -> [Act V card]
Ch5: [Act V card] -> finale_accusation (own inline intro) -> final
```

## v137: the cave shortcut, and a real staged-scene engine gap found along the way

### The new scene, in two parts
Elle's ask: an automated cutscene, not a walkable map (it's a brief
crossing, not content to explore), covering the Herbalist's Hut farewell
through to arriving at the Finale. Built as two consecutive
`staged_scene` acts, same pattern as every other scripted beat in the
game:

1. **"The Tunnel Back"** (kept the existing title) - in the Herbalist's
   Hut, `playerMarks` around the herbalist/cauldron. Hook and the
   Herbalist both get a line praising the result, she sends the party
   out the back door ("I don't need the whole swamp road seeing who's
   been through my door tonight"), Hook mentions the smuggler's cave
   shortcut - reusing and extending the geography he'd already
   described in the old placeholder text (runs under the swamp road,
   comes up behind the estate wall), so nothing about the world's own
   logic changed, just where it's said. `fadeOut: true`, no title card
   (chains straight into part two).
2. **"Through the Tunnels"** - the actual cave map, converted from
   Elle's `Cave2.tmj`/`.tmx` export. `fadeIn: true` to pick up from part
   one's fade-out. No dialogue, no NPCs - just the party crossing single
   file, then `fadeOut: true` into a real title card (`Act V` / `The
   Finale`) leading into the accusation.

### A real, general engine feature had to be built for this
The existing staged-scene system (`playerMarks`) only ever supported
**static** positions - every player teleports to a fixed spot and
stands there while NPC "actors" do the moving. There was no way to
script the *players themselves* walking anywhere. Rather than fake this
with generic NPC stand-ins (which wouldn't show anyone's own chosen
character), built real support for it:

- New `playerWalkPath` field on a staged scene: a list of tile
  waypoints, a walk speed, and a stagger delay.
- Client-side, each player runs the exact same deterministic route
  through their own local `updateStagedScene` loop, offset by
  `partyIndex * staggerMs` - since it's the same data on every client,
  everyone's timing lines up naturally into a single-file line without
  needing any new server-side sync.
- The walk drives the same `me.x/me.y/me.dir/me.moving` fields normal
  WASD movement already uses, so the existing throttled position
  broadcaster picks it up for free - every other client sees party
  members crossing the cave exactly like any other player movement,
  no new rendering path needed.
- No `cameraCenter` set for this scene specifically, so the existing
  "no composed tableau, just follow the local player" fallback camera
  behaviour does the right thing automatically as they walk.
- This is a general capability now, not cave-specific - any future
  staged scene can use `playerWalkPath` the same way.

### The cave map itself
Converted from the real Tiled source (`Cave2.tmj`, infinite/chunked
format, same chunk-merge technique used for the tavern/dungeon
interiors before). Real animation data extracted from both the inline
tileset definitions and the one separate `.tsx` file
(`Water_detilazation2.tsx`) - 661 animated tiles available in the pack,
scoped down to the 259 actually placed in this specific map, matching
how every other map's animations dict is scoped. Collision was
rasterized directly from Elle's own `WALK` polygon object (point-in-
polygon test per tile) rather than guessed, so the walkable area matches
her authored path exactly. The walk route's 7 waypoints were checked
against that same collision grid and confirmed to all fall on walkable
tiles before being written into the act data.

**Not yet visually confirmed end-to-end in a live session** - the map
render itself was checked (clean, no scrambled tiles), the waypoints
were checked against collision, and the walk-path code was written to
mirror the already-working actor-animation pattern closely, but nobody
has actually watched the full two-scene sequence play out live yet.
Given the Saturday deadline, this is the single highest-value thing to
test first.

### A real pre-existing bug found and fixed: staged scenes were never getting fadeIn/cameraCenter/playerSortBoost
While wiring the new scene, found that `fadeIn`, `cameraCenter`, and
`playerSortBoost` are all read by the client for every staged scene, but
the server's payload builder never actually included any of the three -
confirmed by direct search, zero matches anywhere in `server.js` before
this fix. Practical effect: **every staged scene in the entire game,
including already-shipped ones** ("Means and Opportunity, Interrupted",
"Out of the Sewers", "The Maid Returns") has been silently skipping its
fade-up and its composed camera angle - the fade-to-black overlay was
always being cleared instantly regardless of `fadeIn: true` being set in
the data, and the camera was always just following the local player
instead of showing the intended tableau. Fixed by adding all three
fields to the server's `staged_scene` payload.

**This is a real behaviour change for scenes Elle has already seen and
tested**, not just new-scene plumbing - those three existing cutscenes
will now visibly fade in and use their composed camera framing for the
first time, which is the originally-intended look but will read as
different from what's already been approved. Worth flagging explicitly
during Saturday's pass rather than assuming it's just the new content
that changed.

---

## Priority list for Saturday (Thursday -> Saturday turnaround)

Roughly in order of what actually threatens "perfected by Saturday" if
skipped, not just chronological order:

1. **Play the new cave sequence live, start to finish, with a full
   party (not solo).** This is genuinely unverified beyond static
   checks - the single-file walk timing, the camera follow during the
   walk, and the fade-in/fade-out handoff between the two scenes all
   need real eyes on them before anything else here matters. If the
   stagger timing feels off (`staggerMs: 550` is a first guess, not
   tuned), that's a one-line change once seen live.
2. **Confirm the three existing staged scenes still look right** now
   that `fadeIn`/`cameraCenter`/`playerSortBoost` actually reach the
   client for the first time. Given this is a genuine behaviour change
   on already-approved content, it needs a deliberate look, not an
   assumption that "fixed" means "still fine."
3. **A full run-through of Act 4 through the end** (Herbalist ->
   farewell -> cave -> Finale -> Case Closed) in one sitting, the kind
   of continuous playtest that catches sequencing issues individual
   fixes can't.
4. Everything from the last two bug-fix rounds (v135/v136) that's
   already shipped and validated but still deserves a live look given
   how much changed: the Finale's tabbed panel (never actually seen
   rendered), the tavern furniture/Y-sort fix, the Guild Hall corrections,
   the Herbalist camera bounds.
5. Lower stakes, fine to leave for after Saturday if time runs out: the
   still-open "Take your findings back to Discord" rewording, the
   `fighter3`/`fighter4` placeholder idle art, Reyes/Kestrel/Nell's
   placeholder portraits, and any UI chrome polish.

Given the timeline, the honest recommendation is to spend Friday almost
entirely on live playtesting rather than new work - nearly everything
above is "verify," not "build," and that's where the real risk sits
before Saturday.

## v136 part 1: Finale word-bank rebuilt as a pixel panel with tabs

Elle sent three CraftPix UI packs (`craftpix-net-994534` fantasy icons,
`craftpix-net-556632` basic icons, `craftpix-net-255216` basic RPG UI)
asking whether the finale's plain CSS-box word-bank tray could get the
same pixel-panel treatment the dialogue box and Evidence Table already
have. The two icon packs are item/skill icons, not panel chrome - not
used here, worth keeping for later if individual accent icons are ever
wanted. The RPG UI pack had real reusable panel/button art.

- **New assets** (`public/assets/ui/`): `panel_finale.png` (cropped from
  the pack's `Inventory.png`, a blank bordered panel with a green header
  bar - genuinely lucky, the header's exact color is `rgb(80,169,120)`,
  identical to this project's own `--candle`, so it blends in with zero
  tinting needed), `tab_inactive.png`/`tab_active.png` (cropped from
  `Buttons.png`'s existing blank-pill button family - the same raised-
  vs-flush 4-state button set already used for the pack's own labeled
  buttons like AGAIN/NEXT/RESTART, just without baked-in text so this
  project's own labels sit on top).
- **Tabs replace the old stacked sections.** Previously all 4 word-bank
  categories (Who/Poison/Motive/Opportunity) rendered as 4 stacked rows
  at once. Now one tab per category, only the active tab's row shows.
  Tab switching is deliberately local, per-player UI state only
  (`finaleState.activeTab` in `client.js`) - never sent over the socket.
  The actual selections underneath stay synced for the whole party
  exactly as before; anyone can be looking at a different tab than
  everyone else with no effect on shared state.
- **Each tab shows a small dot once that category has a pick** (`.finale-
  tab-dot`, filled when `finaleState.selections[blankKey]` is set), so
  the party can see which categories still need attention without
  clicking through all four. Updates on both local picks and incoming
  `finale:state` broadcasts from other players.
- **Present Your Case stays the standard `.btn.btn-primary`**, unchanged
  - deliberately not reskinned to the new pack's button art, since
  consistency with every other CTA button in the game (Continue, Begin
  the Gala, etc) matters more than a piecemeal pixel-art upgrade limited
  to one screen.
- Both new border-image elements (`.finale-panel`, `.finale-tab`) follow
  the exact same convention already established for `.pixel-panel-
  dialogue` - explicit companion `border-style`/`border-width` alongside
  the `border-image-*` properties, plus `image-rendering: pixelated`.
  The tab pills specifically use `border-image` rather than a flat
  stretched background, since label lengths vary a lot ("Who" vs
  "Opportunity") and a flat stretch would visibly distort the pill's
  rounded corners at very different widths - border-image slicing
  preserves the corners regardless of how wide the label pushes the tab.

**Still waiting on:** Elle's v135 bug-testing pass, to be combined with
this into one delivery.

## v136 part 2: the full v135 bug-testing pass

### Layout and screens
- **Lobby rearranged** to match the reference layout - the header (seal,
  title, guest count) now spans full width above the pen/sidebar instead
  of being stacked inside the sidebar column.
- **Invitation screen and post-invite character creation now use the
  dark in-game palette** instead of the light landing-page cards, scoped
  so host-mode Host/Join is untouched. Character-creation card width
  capped so it doesn't stretch edge-to-edge.
- **Dialogue box brought back down** from an over-corrected 260px to a
  compact 190px, with trimmed internal padding reclaiming real text
  space without the box itself ballooning again.
- **Space/F now actually triggers "Pick up"** when it's the visible
  action, instead of just closing the popup.
- **Player name-label distance fixed with a real measurement**: player
  sprites have 34% headroom baked into the sheet vs ~9% for NPCs -
  exactly why names floated farther from the head. Compensated in both
  the main engine and the lobby pen.

### Act 1-3 map/data bugs
- **Ashgate's chest**: never actually had a sprite placed, only the
  interact marker existed. Found the real chest art (already used
  elsewhere in this map for the staircase) and placed it, clearing the
  decorative wall-bleed tiles that would've covered it.
- **Point the Finger error text**: now matches Thorne's exact red/glow
  styling.
- **Thorne's popup**: real line breaks (was `.textContent`, same class
  of bug fixed elsewhere), plus a pulsing "!" reopen button in the HUD
  if closed without voting ready, resetting cleanly between acts.
- **Guild Hall dragon skeleton**: added the same Y-sort layer-grouping
  fix already used for the Mage Tower's dragon - the spine was split
  across 5 layers with no shared sort key, so parts of it could drop
  behind other room content.
- **Guild Hall desk - corrected after initial mis-fix.** First pass
  wrongly assumed the small writing-desk near the door was "the" desk
  and relocated it, which Elle caught: there's already a real central
  desk (with book/inkwell) inside the dragon coil. Reverted the
  relocation, restored the original small desk exactly as authored, and
  pointed the interact object at the real central desk instead.
- **Guild Hall upstairs access removed.**
- **The Fruit Seller**: was unreachable - her interact point sat inside
  the stall's own solid collision block, dead center, nowhere near the
  nearest walkable tile. Moved the interact point to the walkable edge.
  Checked for a reported "insanely large" sizing bug specifically and
  couldn't reproduce one in the data (drawScale, content dimensions all
  came back normal) - flagging as possibly resolved now that she's
  actually reachable, worth a fresh look.
- **"A Table of Adventurers" renamed to "Adventurer"**, and its "split in
  half, flipped wrong" render was a real bug: the cutout was combining
  two *different*, unrelated tileset columns instead of mirroring one
  character. Rebuilt using one column mirrored via the flip system,
  confirmed clean with a render.
- **Tavern "characters below tables" - real engine bug, not a data
  problem.** Re-checked the actual authored layer order and full tile
  data against the real Tiled source again (both matched exactly, as
  before) - the bug was in the sort-key calculation itself. The earlier
  fix (tile-quantized sort keys) wasn't accounting for furniture directly
  sharing a character's own footprint - a table's base often sits a row
  or two further down the same columns than the character sitting at it,
  giving the table a larger "draws on top" key even after that fix.
  Extended the sort-key logic to also check for exactly that. Verified
  computationally across all 12 tavern NPCs: every one's sort key
  increased as expected, meaning they'll now draw in front of the
  furniture they're at. This is a general engine fix, not tavern-
  specific - benefits any map with cutouts near furniture.

### The Herbalist
- **Missing from the interior - real cause found.** She had a valid
  `look`, a valid manifest entry, valid files, a walkable position - but
  no `type: "npc"` field, which is what the client's `initNpcStates()`
  gates on before creating any render state at all. Without it she was
  skipped entirely, not just mis-rendered. Swept the whole project for
  the same gap - nothing else affected.
- **Door/window endless animation loop**: this map had 37 animated tiles
  and zero `animationZones` to gate them, so everything (including the
  door/window tiles) just looped forever ambiently. Removed the 31
  door/window entries specifically, left the cauldron's own steam/bubble
  animation (6 entries) intact.
- **Camera scrolling off into blank space - corrected after initial
  mis-fix.** First pass shrank the whole map with `tileRenderScale`,
  which Elle correctly rejected - she wanted normal scrolling preserved,
  just no blank void at the true edges. Reverted the shrink. Real cause:
  the map has genuine empty padding around its actual content (content
  only fills tiles 15-42 horizontally, 1-26 vertically, out of a
  declared 48x32 grid) - the camera was clamping to the full declared
  grid, letting it drift into that real padding. Added a `cameraBounds`
  field (computed from the actual non-empty tile extent) and taught the
  camera clamp to use it when present - every other map, with no
  `cameraBounds` set, keeps clamping to its full grid exactly as before.
- **Cauldron scrollbar**: the smoke overlay (220x220px) had no
  `overflow: hidden` on its much smaller (256x128px) stage container, so
  it visually inflated the modal's content height and forced a
  scrollbar. Clipped it to the stage.
- **Plant pickup gating**: added a `requiresFact` field to all 6
  specimen items (monkshood, foxglove, nightshade, oleander, hemlock,
  marigold), wired the herbalist's reveal dialogue to teach that fact
  the moment she actually sends the party out, and added a generic
  server-side gate check on pickup - denying with a real reason instead
  of a silent no-op. Added a proper toast notification client-side for
  the denial (there was no toast/banner UI in the project before this;
  built one, styled to match the existing HUD pill language).
- **Cauldron success flow - real sequencing bug found.** The correct
  result and the fade-to-black used to fire in the same instant server-
  side, ahead of the client's own 1.8s reveal delay - the fade could
  land before the herbalist's praise text was even shown. Removed the
  auto-advance entirely; added a proper party-wide "Continue" button
  (same acknowledge-and-wait pattern as `act:acknowledgeReveal` elsewhere
  in the game, just scoped to the cauldron's own state since this act's
  type is `explore`, not `reveal`) with live "X / Y ready" progress text.
- **Cauldron mid-puzzle resync fixed.** `cauldron:requestState` was only
  ever sending a bare status string, and the client had no listener for
  the response at all - reopening the modal after someone else had
  already thrown something in, or reconnecting mid-puzzle, silently did
  nothing and left the modal on its default idle state regardless of
  reality. Server now sends the full result (title, lines, and for a
  correct result, this player's own ack state plus the party's live
  progress) matching what a fresh `cauldron:result` carries. Client-side,
  extracted the tint/title/lines/button rendering that `cauldron:result`
  already did into one shared `renderCauldronResult()` function, used by
  both the fresh-submission reveal (with its dramatic delay) and this
  resync path (immediate, no delay/smoke).

### Case Closed
- **Line breaks reduced** - merged several short, closely-related beats
  into shared paragraphs (9 paragraphs now, down from 14) without
  touching any of the actual sentences.
- **Hidden phrase extended to `!EPILOGUE`** (bang-prefix, matching real
  Discord bot command syntax) rather than plain `EPILOGUE`. The `!` was
  already sitting right there in `"Clever!"`, positioned before the
  first bolded letter - just needed the same `<strong>` treatment as the
  rest. Verified programmatically: extracting every bolded character in
  order gives exactly `!EPILOGUE`.
- The "Take your findings back to Discord" wording/rewording request
  from the original list has not been revisited this round - the current
  text still just says that plainly. Worth a decision on exact phrasing
  next time this screen comes up.

## v135: NIGHTSHADE removed, hover glow added

- Removed `finalWord` from the `final` act in `story.json`, the
  `#final-word` element from `index.html`, its display line from
  `renderFinal()` in `client.js`, its now-dead CSS rule, and the
  `finalWord` field from the server's act payload builder - a full
  removal, not just hiding it.
- The old "Return to Discord and type it in to close out the night."
  line specifically referenced typing NIGHTSHADE, so it's gone too.
  Replaced with a plain "Take your findings back to Discord." - still
  nudges the party toward the actual next step without spoiling that
  there's a hidden mechanic to find. The hidden EPILOGUE letters
  themselves are still genuinely hidden - no hint text points at them.
- **Added a hover glow to `#end-body strong`** as a fallback for anyone
  who suspects something's there and starts poking at the text - the
  letters stay plain bold by default (matching v134's original "should
  read as normal prose on a casual pass" reasoning) and only pick up
  the theme's candle-glow color/shadow on hover. Doesn't change what a
  casual reader sees, only rewards someone already looking closely.

## v134: Case Closed line breaks + hidden EPILOGUE letters

### Real bug found: line breaks never worked here
`renderFinal()` in `client.js` was wrapping the whole body in one single
`<p>` tag with no newline handling at all - unlike every other render
function in the game (`renderFinaleAccusation`'s intro, the passage
text), which all split on `\n` into real paragraphs. Any newlines in
this act's body text were always silently discarded. Fixed to match the
same convention as everywhere else. Added light paragraph spacing
(`#end-body p`) so the now-real line breaks actually read as separate
beats rather than a single dense block.

### Hidden EPILOGUE letters
Elle's ask: bold one letter at a time, in order, spelling EPILOGUE
across the passage. Verified programmatically rather than by eye (easy
to miscount by hand across 14 lines) - extracted every `<strong>` letter
from the final text and confirmed it reads exactly `EPILOGUE`.

Tried word-initial letters first (bolding the first letter of a chosen
word reads far cleaner than a bold letter buried mid-word) - confirmed
by direct search that a fully word-initial solution doesn't exist for
this specific text (nothing in the back half starts with O, G, or a
second U-bearing word early enough to leave room for what follows).
Used a hybrid instead: word-initial wherever the text actually allows it
(E in "Everyone", P in "past", I in "I'll", G in "go", E in "either" -
5 of 8), and the shortest, most natural-looking word available for the
rest (L is the second letter of "I'll" itself, right next to the I; O is
the second letter of "Corwin"; U is the third letter of "You've").
Nothing in the source prose was altered to make room for this - only
existing letters got wrapped in `<strong>`.

Styled `#end-body strong` as plain bold with no color change -
deliberately, since a color shift would make the sequence jump out
immediately on a casual read and defeat the "hidden until you're
looking for it" point of the puzzle.

**Left unchanged, worth confirming:** `NIGHTSHADE` (the `final-word`
element) and the "Return to Discord and type it in" line are separate,
static UI pieces from the body text, untouched this round. Elle's new
body text doesn't reference Discord at all (the earlier draft's closing
line did) - worth confirming whether NIGHTSHADE-as-typed-command and the
new hidden `!EPILOGUE` letters are meant to coexist as two separate
Discord hooks, or whether this is heading toward replacing one with the
other. Not assumed either way, flagging only.

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
