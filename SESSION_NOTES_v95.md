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
