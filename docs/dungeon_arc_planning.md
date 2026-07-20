# Post-jail dungeon arc — planning status

Covers Area 1 through the Sewers, i.e. everything between the jail escape
and reaching Corwin at the Guild Hall. Paste this into a new chat alongside
the main project handoff for continuity on this specific thread.

## The five-area structure (confirmed)

1. **Area 1 — The Dungeons (jail cells).** Built and playable. Pressure
   plates open cell doors for each other, escape mechanic works.
2. **Area 2.** Built (map, collision, entrance/exit). This area's job is
   to *seed* clues, not challenge the party yet: the graffiti and the
   notebook pages/chests live here. Notebook page and chest content is
   still `[PLACEHOLDER]` in `interactions.json` — needs real writing, no
   new assets required, this is the most shovel-ready gap in the whole
   arc.
3. **Area 3 — the directional puzzle ("north isn't north").** Not built.
   Map doesn't exist yet. See below for mechanic status — this is the
   most-discussed open item right now.
4. **Area 4 — the rat maze.** Not built. Map doesn't exist yet. Mouse
   sprites are sourced and approved (see below) but not wired into the
   manifest yet, holding off until the actual map exists to place them in.
5. **Sewers.** Not built, not really discussed yet beyond "walk to the
   end, exit, meet Hook." Simplest of the remaining areas by design.

After Sewers: Guild Hall Basement (not built, not really discussed).
Area 2's forward exit currently points at `guild_hall_basement` as a
placeholder target — needs re-pointing at Area 3 once Area 3 exists, or
this will silently do nothing when walked into, same as it does now.

## The graffiti (all three placed, Area 1 + Area 2)

- **"North Isn't North"** — in Area 1 (jail_cells.json), at Elle's
  authored position from the Tiled Image Layer. This one **already
  contains the actual answer** to the Area 3 puzzle (not just a warning) —
  confirmed by Elle directly, so whatever Area 3 puzzle gets built, it
  should NOT expect players to deduce the offset from nothing. They'll
  have the real answer in hand from Area 1; Area 3 needs to be a
  *challenge to apply it under pressure*, not a "find the answer" puzzle.
- **"The Rats Know"** — Area 2 (dungeon_area_2.json), at Elle's authored
  Image Layer position. Ties to the Area 4 maze: rats show the real path.
- **"Don't Trust a Nun"** — Area 2, same. Pure foreshadowing for a later
  chapter (Into Town), no mechanical function in the dungeon itself.

Engine note: images render via a generic `mapData.images` array (position,
size, native aspect ratio, proper Y-sort against the wall it's mounted on)
— this is now a reusable capability, not graffiti-specific.

## Area 3 — the directional puzzle: STILL OPEN, needs a decision

**Confirmed:** the graffiti already gives the answer, so the puzzle can't
just be "read the wall, then vote for what it says" — that's not a
puzzle, it's a formality. The challenge has to be in *applying* the true
direction under some kind of test, ideally more than once, so getting it
right isn't a coin flip.

**Three statue-themed concepts were pitched** (Four Saints, Four Ravens,
The Shrine/candles) — all built around the same misdirection: appears to
be about arranging four objects, is actually about correctly re-reading
compass directions through the graffiti's offset.

**Asset reality check that shapes this:**
- Genuine statue sprites exist in `other_objects.png` (a hooded
  knight-with-sword, a praying robed figure) — but **only in one fixed
  front-facing pose each**. No left/right/back-facing variants exist in
  either CraftPix pack. True "rotate the statue to face a direction" is
  **not buildable right now** without new custom art — and it can't be
  faked with a rotation transform either, since spinning a flat
  front-facing sprite just tilts the same view sideways rather than
  showing a different facing, which would look visibly broken for a
  robed humanoid figure.
- `candles.png` **does** exist and fits well — a small stone base with a
  magical teal-green flame, matching the ghost-flame torches already used
  throughout the dungeon. Lit/unlit is trivial (draw the flame or don't).
  A sequence-based puzzle (activate four things in the *true* order,
  derived from the graffiti's offset) is fully buildable today with zero
  new art.

**Recommended path, not yet confirmed by Elle:** keep the "looks like
arranging four statues" misdirection (reuse the existing knight/praying
statue sprites, fixed pose) but make the actual interaction a
touch/activate-in-sequence mechanic like the candle version, rather than
true rotation. Same prisoner's-note-with-a-twist reveal, same buildable
mechanic, no new art needed. The tradeoff being accepted: no visual
payoff of statues physically turning to face each other — that spectacle
specifically requires new directional art that doesn't exist yet.

**Decision still needed from Elle:**
1. Statues (fixed-pose, sequence-activated) vs. candles/shrine, vs. wait
   for new statue art to do true rotation properly.
2. How many "forks"/steps in the sequence.
3. Solo-only send-back on a wrong step, recommended for this room
   specifically (Area 4 is already getting both trap types; keeping Area
   3 lower-stakes avoids the two rooms feeling identical).

## Area 4 — the rat maze

**Mechanic (confirmed):** a real maze (not built yet, needs a Tiled map
from Elle — procedural generation is off the table per house rule).
Rat(s) placed along the correct route show the way; wrong turns lead to
traps.

**Two trap types (confirmed):**
- Solo send-back — common, scattered through the maze, sends just that
  one player back to the start.
- Whole-party send-back — rare, 1–2 placements only, sends everyone back
  together. Recommended for a specific "you should have been more
  careful" moment rather than scattered randomly.
- Open question: does triggering either trap get any feedback (a line
  from Thorne/Corwin, a sound cue), or is it a silent teleport? Worth
  deciding so it reads as a joke rather than pure frustration for a fast
  group.

**Mouse/rat sprite — sourced and approved, not yet wired in.** Five
sheets (`MouseIdle`, `MouseRun`, `MouseEat`, `MouseDamage`, `MouseDie`),
each 32×32 per frame, genuinely native-resolution chunky pixel art (not
scaled-down detailed art — checked pixel-block structure directly to
confirm), transparent background, clearly reads as a mouse/rat at a
glance. This is a better fit than four other candidates that were
evaluated and rejected:
- `Rat1_Idle/Walk/Run_with_shadow.png` — best-structured (proper 4-
  direction sheets, matches project's `cell:32, cols:6, rows:4` NPC
  convention exactly) but drawn with fine soft-shaded detail that doesn't
  match the flat chunky CraftPix style — the same mismatch that got the
  orc NPC rolled back earlier in the project.
- A "gray pixelated rat" webp — same soft-shading mismatch, plus only one
  static pose, no animation.
- `fabled-frame-small-rat2.gif` — watermarked marketplace preview, not a
  usable asset as uploaded, and the softest/most painterly of the options.
- `TfEC3f.gif` — technically the right *technique* (genuinely low native
  resolution, confirmed by checking for clean 4px-block upscaling) but
  the silhouette doesn't clearly read as a rat.

**Known limitation of the chosen mouse set:** all five sheets are single-
direction (side-view only, facing left in every source frame). Left/right
can be covered for free with a horizontal mirror in code. True up/down-
facing poses do not exist in this set — fine for "glance at a junction to
see which way it's facing," not fine if the design ever wants a rat
running directly toward/away from the camera.

**Not yet wired into `manifest.json`** — deliberately held off until
Area 4's actual map exists, so there's somewhere to place it.

## Sewers

Barely discussed. Confirmed only: walk to the end, exit, meet Hook. No
map, no mechanic beyond traversal as far as this thread has gone.

## Other recent work this thread touched (not dungeon-specific, noted for continuity)

- Voss's frame-up cutscene dialogue rewritten to be more convincing
  (opportunity from the party having free run of the estate, a claimed
  matching wound on the victim) rather than just producing the blade cold.
- Captain Thorne now has a real overworld sprite (`fighter5`, genuine
  4-directional walk sheet) and portrait, replacing the placeholder
  `guildmaster` look. Portrait chroma-key was generalized to sample the
  actual corner color instead of assuming white backgrounds, since
  Thorne's portrait has a tan background — this fix is general-purpose,
  not Thorne-specific, and will correctly handle any future non-white
  portrait too.
- The planted blade now has real art in the cutscene (a padded-square
  version swapped into the portrait slot at the reveal line) and a small
  icon variant is staged for later use if the blade ever needs to appear
  as an inventory/evidence item.
- Four of the seven Estate evidence exhibits that were using a generic
  star fallback icon (ledger, satchel, blueprint, diary) now have real
  icons extracted from provided art.
