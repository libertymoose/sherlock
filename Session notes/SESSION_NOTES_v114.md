# v114 delivery notes

## Merge, not overwrite

The v113 you uploaded turned out to be a different branch again - one
that had the full Herbalist's Hut act built out (a real "What Killed
Him" explore act, the cauldron puzzle, six plant specimens, the
Herbalist's two-stage dialogue, a new "Crumpled Report" clue object,
all the cauldron animation/UI assets) but branched off before this
session's Act 3 bug-fix pass, so it was missing two things I'd just
fixed: the Gala Guest title mislabel and Glass Workshop's NPC scaling.

Diffed everything file by file rather than guessing which side was
newer. The good news: every file that differed was a clean, additive
diff - `client.js`, `style.css`, `index.html`, `server.js`,
`items.json`, and `story.json` all had zero lines removed on your side,
just real new content added on top of what was already there. Nothing
to reconcile, no risk of dropping either side's work. Took your branch
as the base for exactly that reason, then reapplied my two fixes on
top:

- `content/interactions.json`: the "Big Hat Lady" title fix (was
  reverted back to "A Gala Guest, Deep in Her Cups" in your branch,
  since it predated that fix)
- `public/assets/maps/glass_workshop.json`: the Glassmaker and
  Shopkeeper's `spriteCutouts` (same story, your branch predated it)

Everything else - tavern, chapel, the animation gating, the pagination
fix, all of last session's Act 3 work - was already present in your
branch untouched, so there was nothing to redo there.

## What's now in the build

The Herbalist's Hut is a real, playable act:
- `herbalist_hut_exterior.json` and `herbalist_interior.json` with the
  Herbalist's own dialogue, the cauldron puzzle object, and the new
  "Crumpled Report" note object (a smuggled-out guard's report, misspelled
  and abbreviated, per the maid)
- Six specimen items and matching evidence documents
  (`doc_specimen_nightshade`, `_monkshood`, `_hemlock`, `_foxglove`,
  `_oleander`, `_marigold`)
- A live cauldron modal in the client (drag specimens from inventory,
  animated frames pulled from the same `Boiler.png` tileset the map
  itself uses, smoke overlay, tinted result states)
- The story sequence now has 13 acts instead of 12 - a real `explore`
  act ("What Killed Him") sits between the Herbalist's Hut intro and
  the Finale, where the placeholder used to be

I haven't tested the cauldron mechanic myself beyond checking it's
structurally wired (JSON valid, referenced items exist, JS parses
clean) - worth a real playtest before this goes out to the group, same
as anything freshly built.

## Validation run before packaging

- JSON-parsed all 37 files under `content/` and `public/assets/maps/`
- `node --check` on `server.js`, `client.js`, `overworld.js`
- CSS brace balance
- em-dash grep across every touched file
- BFS reachability, spawn to every object, across every map in the
  project - only flagged object is the tavern's sealed 2nd floor,
  which is expected and unrelated to this merge
