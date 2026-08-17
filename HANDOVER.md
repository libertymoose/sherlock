# Handover — A Study in Boralus, picking up after v122

This replaces the earlier handover from a few sessions back. Paste this
as the first message in a new chat, then attach the v122 zip.

## Where things actually stand

- **v122 is packaged and validated** (JSON-parsed everything under
  `content/` and `public/assets/maps/`, `node --check` on all three JS
  files, CSS brace-balance check, full project-wide BFS reachability
  sweep) but has **not been confirmed live by Elle yet**.
- Elle's deploy history has shown v119 as the most recently confirmed
  *deployed* version. Everything from v120 onward (including all of
  this handover's content) was built in-chat and delivered as zips but
  not yet confirmed pushed/live. When new bug reports come in, check
  which version they're actually testing before assuming something is
  a fresh regression - this has caused real confusion more than once in
  this project's history.
- A lot of ground was covered this session in one long sitting rather
  than shipped incrementally. Keep incrementing normally (v123 next)
  from here.

## What's fixed and validated in this handover's scope

### Dialogue/interaction system overhaul
- **Proximity auto-close** - dialogue now closes automatically when the
  player walks far enough from whatever NPC/object opened it. Tracks
  the object that opened the current dialogue (`activeVnObjId`) and
  closes on `onNearbyChange` if that object is no longer the nearby one.
- **Click outside to close** - a click anywhere outside the dialogue box
  (and not on the floating interact button) closes it.
- **Interact key/button gating** - this was a real, previously-unnoticed
  bug: pressing the interact key/button while a dialogue was already
  open just re-fired the interaction instead of advancing the page.
  Built a proper gate (`Overworld.setInteractBlocked`, synced via a
  MutationObserver watching the panel's own visibility so every
  show/hide site stays correct without needing individual edits) so the
  interact key/button now advances the current page while blocked, and
  can't open a new interaction until the dialogue is actually closed.
  On the last page, pressing interact closes it (read as "done
  reading").
- **"F" key was never actually wired** as an interact key at all,
  despite the game's own on-screen text telling players to press it -
  only spacebar worked. Fixed; both keys now behave identically.
- **Fixed-width dialogue box** - the panel used to center its *children*
  in the viewport, so its total footprint (and therefore its own
  center point) shifted depending on whether a portrait was present
  (~861px with one, ~700px without). Made the panel itself a fixed
  width; the text frame fills whatever's left of it rather than adding
  to it. This was explicitly re-confirmed to still be a hard "always
  the same size" rule after an earlier attempt (giving document/button
  dialogues a taller box) was correctly called out and reverted - if
  a "needs more room for text" report comes back, the fix has to come
  from tightening internal spacing (title margin, footer margin, etc.),
  not from varying the box's own height.
- **Pick Up button position** - the document modal's footer button was
  centered, now right-aligned per request.

### The maze - actually fixed (see prior handover for the deeper root
cause: a Tiled `offsety` field that was being ignored). Confirmed intact
this session, no further changes needed.

### Guild Hall - all three floors rebuilt from source, confirmed intact.

### The big tavern investigation - confirmed intact
The two real root causes behind "the tavern is totally fucked" (a
Y-sort bug affecting every cutout NPC project-wide, and 12 NPCs across
5 maps with corrupted animation data making them render as invisible
most of the time) are both still fixed as of this handover. See the
prior handover for the full technical writeup if this needs revisiting.

### This session's fixes
- **Exhibit icons** - all 7 evidence items (and the fallback for
  anything unlisted) now use the scroll icon
  (`/assets/ui/icons/evidence/scroll.png`), matching a screenshot Elle
  sent of what she wanted. **Worth double-checking with Elle that this
  was actually the right call** - her original ask referenced "exhibit
  C, E, F" as if those were fixed items, but exhibit letters are
  assigned by pickup order and aren't fixed to specific items across
  playthroughs, so there was never a valid way to identify "the icons
  used for C, E, F" specifically. Applying the one icon she did screenshot
  (from an "Exhibit A" case) to everything was the most defensible
  interpretation available, not a confirmed-correct one.
- **"The Ashgate Inheritance" removed** - was only ever the browser tab
  `<title>`, changed to "A Study in Boralus".
- **Blade portrait removed** - was a `portrait` field on one narration
  line in the Frame-Up cutscene (`content/story.json`), set to `null`
  to match every other narration line in the game.
- **Herbalist renamed** - "The Herbalist's Hut" reveal and "What Killed
  Him" explore act are now both titled "The Herbalist", bumped from
  chapter 3 to chapter 4. The Finale and ending were also bumped to
  chapter 5 to keep the numbering consistent, since they now come after
  a chapter-4 act - **this was a judgment call, not something Elle
  explicitly asked for**, worth confirming she's fine with it.
- **Act number added to the "Now Exploring" header** - e.g. "Act III ·
  Now Exploring", via a new `#explore-eyebrow` element id and
  `toRoman()` (which already existed in the codebase).
- **Point the Finger vote mechanics answered, not changed** - confirmed
  via the actual resolution code that it's a plurality vote (most votes
  wins, not a strict >50% majority), and a tied top spot already results
  in nobody being cleared and a full re-vote, which correctly handles
  the even-player-count case Elle asked about. No code change was
  needed here, just confirmation.
- **Explicit vote outcome confirmation added** - previously a correct
  vote only showed Corwin's in-character reaction dialogue with nothing
  that unambiguously said "you got it." Added a status line above his
  dialogue (`#vote-result-status`, reusing the `.feedback`
  correct/incorrect styling) that states the outcome directly: "Correct
  - Ashgate is the one," "Tied vote - nobody's cleared, vote again," or
  "Not them - [suspect] is cleared."
- **Suspect Board feedback color** - this went through two rounds.
  First pass removed the red/green color-coding entirely (Elle's
  original ask, "use the default colour"). Second pass **restored** the
  colors after Elle clarified she liked having red/green, the actual
  problem was contrast against the wood-textured desk background the
  board sits on, not the color choice itself. Now uses lighter tones
  (`#6ee7a0` green, `#ff8a75` coral) plus a dark text-shadow outline for
  guaranteed legibility regardless of where on the texture it lands.
  This same fix covers "Thorne's red text" (the Suspect Board hint text
  IS this same element) and the vote panel's Corwin name/title color,
  which had the same underlying bug (falling outside a
  `.pixel-panel-popup` dark-text override that its siblings already
  had) - all three were the same root issue, confirmed resolved
  together.
- **Maid cutscene rewritten** per Elle's provided script, with
  line-by-line "click to continue" breaks exactly where she marked
  them with `\`. Grammar/spelling fixes made along the way (flagged
  individually to her at the time): "that gala" → "the gala", a comma
  splice around "This was his goblet," a double space, missing
  sentence-break punctuation around "she chuckles," a stray comma
  before "scrap of paper," and "east road" → "west road" per her
  explicit change. Deliberately left "that don't look like wine
  stains" alone as the maid's established informal voice rather than
  correcting to "doesn't" - flagged this choice to Elle, not yet
  confirmed either way.
- **Two more invisible-wall bugs found and fixed**, same pattern as
  several others this project has hit repeatedly: a small decorative
  floor prop (not real furniture) was blocking movement. One in the
  Kennels (a bone-pile/floor decoration in the room's center), one
  right by the Lower Stores entrance (a small stray prop). Both
  confirmed still fixed as of this handover.
- **Sub-room camera framing fix, three rooms** (Kennels, Ossuary, Lower
  Stores) - the camera can never scroll above row 0 (hard-clamped in
  `overworld.js`), so a door sitting right at a small map's top edge had
  nowhere for the camera to frame it, cutting off its top visually.
  Shifted all three maps down 3 rows (full layer data, collision,
  objects, spawn) and updated the hub map's own entry-target coordinates
  to match. Confirmed still intact as of this handover.
- **Act 1→3 inventory carryover, traced and confirmed already fixed** -
  every path that can advance the story (`host:advanceAct` and the
  single shared `fadeAndAdvanceAct` every automatic completion funnels
  through) goes through one `advanceAct` function that clears
  `room.inventories = {}`. There's a separate `prefillInventoryFromEvidence`
  flag that deliberately repopulates inventory, but it's scoped via
  `story.json` to only "The Dungeons" act specifically (the "you still
  have everything you were carrying when arrested" beat) - confirmed
  it doesn't leak into any other act, including Means and Opportunity.
  If this report comes back again, it's very likely someone testing a
  pre-v121 build, not a real regression.
- **Ashgate's board coverage confirmed** - she has 4 Means cards
  (glassblower surface/reveal, "seemed anxious," shopkeeper
  corroboration) and 2 Opportunity cards (the goblin's "wouldn't share
  a drop," the monk's alibi - which is meant to be a lie per the
  "nuns/monks always lie" mechanic, but is still correctly filed as an
  Opportunity-category clue regardless of truth value). Nothing missing
  here, no code change was needed.

## Investigated, not resolved - still needs more info

- **Mage tower doors "endless loop."** Could not locate any door/window
  animation content anywhere in the mage tower interior floors or its
  town_exterior building footprint. Genuinely unclear what this refers
  to - needs a screenshot showing exactly which door.
- **Mage tower dragon wing clipping into the ground.** The `layerGroups`
  entry for this dragon already exists and groups
  body/wing/tail/platform/tower under one shared sort key - the
  standard fix for this class of bug is already in place. Whatever's
  still causing the clip is more subtle than a missing group and needs
  live visual testing to pin down.
- **"Act 3 still uses portraits."** Traced the entire portrait rendering
  path exhaustively across two separate sessions now - no live
  reference to illustrated portraits found anywhere in Act 3 map data,
  dialogue content, or the suspect board (the suspect board's
  "portrait-card" CSS class name is just naming, it actually draws from
  each character's walking sprite). Orphaned portrait image files still
  exist in `public/assets/npcs/portraits/` but nothing in the current
  code loads them. Cannot find this bug from code alone - needs a
  screenshot of the exact moment/NPC it happens with, or it may already
  be resolved and the report predates a fix (portraits were removed
  project-wide in an earlier session, per this project's documented
  history).
- **Bread seller dialogue "makes no sense."** Content matches the
  established design spec (the market-stalls-shuttered-early trigger
  fact for Marrow's alibi) word for word. Could not identify what
  specifically reads wrong without more detail - worth asking Elle to
  quote the exact line that bothers her.
- **"NPCs outside the inn are still broken."** No tavern-exterior-
  specific patron objects exist distinctly from the general market cast
  in `town_exterior.json` - the Y-sort and animation fixes that resolved
  the interior tavern chaos apply to them via the same shared code, so
  this is presumed already addressed, but was never specifically
  re-screenshotted to confirm.

## Key technical patterns worth remembering (carried forward + new)

- **`server.js`'s `ALL_ZONE_MAPS` needs an entry for every zone file**,
  not just an act's own starting zone. Bitten this project twice
  already (herbalist hut, then a whole Act 3 town sweep). Check this
  table first for any "can't enter/can't transition" report.
- **Tiled layers can carry `offsetx`/`offsety` fields** that must be
  applied when converting to this game's flat collision-grid format -
  don't assume raw grid position equals true position.
- **A spriteCutout NPC with 100% of its tiles registered in the
  `animations` dict is not automatically correct** - verify actual
  rendered frame content before trusting it.
- **Moving an object's own x/y does not move a spriteCutout's actual
  baked tile art.** These are separate things. If the goal is to change
  where a character visually appears, moving the object entry alone
  just creates a new proximity mismatch. Made this exact mistake once
  and caught it mid-fix earlier in this project's history - worth
  remembering.
- **Decorative-object-incorrectly-blocking-movement is a recurring
  pattern** (a hanging chain, a flower vase, a bone-pile floor
  decoration, assorted small stray props) - when a reachability check
  or a bug report flags a blocked tile, check whether it's genuinely
  solid furniture or just decorative art before deciding whether to
  carve a path around it or just make it walkable outright. Elle has
  said she'd rather have decorative-only obstacles just made walkable
  than routed around.
- **The camera can never scroll above row 0** (`Math.max(0, ...)`
  clamp in `overworld.js`) - any door or focal point sitting right at a
  small map's top edge will have its top visually cut off with nowhere
  for the camera to frame it. The fix is shifting the room's content
  down, not adjusting the camera.
- **CSS color overrides scoped to a wrapper class (`.pixel-panel-popup`,
  `.pixel-panel-dialogue`) are easy to have gaps in** - three separate
  "this text is the wrong/too-bright color" reports (Thorne's hint
  text, Silas's vote-panel name, general Suspect Board feedback) turned
  out to be variations on the same root cause: an element using a
  shared class (`.vn-name`, `.feedback`) that wasn't included in the
  wrapper's own override list, so it fell back to a raw accent color
  never meant to be read against that particular background. Worth
  checking this pattern first for any future "hard to read" report.
- **Exhibit/evidence icons cannot be reliably referenced by their
  letter slot** (Exhibit A, B, C...) since letters are assigned by
  pickup order, not fixed per item. Any future icon request needs to
  reference the actual item name, not a letter.

## Standing project rules (unchanged, still apply)

- No em-dashes anywhere, ever - code, comments, dialogue, docs.
- Version number increments with every delivered zip, no exceptions.
- BFS reachability check mandatory after any collision-touching change -
  spawn to every object, every map touched, before packaging.
- Full validation pipeline before every delivery: JSON-parse everything
  under `content/` and `public/assets/maps/`, `node --check` on
  `server.js`/`client.js`/`overworld.js`, CSS brace-balance check.
- Source files (Elle's own Tiled exports) are authoritative over
  whatever's already converted - rebuild from a fresh export rather
  than patching, and diff against the old version to understand what
  genuinely changed.
- Elle always tests the latest deployed build - if something reported
  as broken looks correct in the current data, ask which exact version
  she's testing rather than assuming the report is wrong or that the
  build is stale without checking.
- Discuss significant design/scope decisions before building; Elle's
  corrective feedback is direct and authoritative over whatever was
  previously implemented. When a fix requires a judgment call in the
  absence of an explicit instruction (chapter renumbering, the icon
  interpretation above), make the call, ship it, but flag it clearly
  rather than presenting it as confirmed-correct.
- All of Act 3 is currently flagged P1 by Elle - treat bug reports from
  this act with urgency.
