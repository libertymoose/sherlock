# v113 delivery notes

The Herbalist's Hut, built end to end: the swamp garden, the interior,
the cauldron puzzle, and the story wiring connecting it to the vote's
"let's find out what was in the goblet" line.

## What's in this pass

- **Garden**: 17 marker positions, all interactive. 6 are real candidate
  plants (Monkshood/correct, Foxglove, Deadly Nightshade, Oleander,
  Hemlock, and a harmless red herring), each written to match one of the
  garden's actual distinct flower sprites (checked visually, not
  guessed). The other 11 give a short, genuinely irrelevant flavor line
  each, not decoys, not red herrings, just texture.
- **The maid's stolen report**: a torn, typo-ridden guard's note (spelled
  wrong, redone in shorthand, missing the one detail - pupils - that got
  flagged for a rewrite), re-readable on the hut's table. Reading it sets
  a fact that unlocks the herbalist's real dialogue.
- **The herbalist**: two-stage dialogue (existing mechanic, reused), cagey
  until the notes are read, then genuinely useful without spelling out
  the answer.
- **The cauldron**: a new drag-and-drop puzzle. Drag a held specimen from
  the tray into the cauldron, one live attempt at a time, shared across
  the whole party. Real animated cauldron art (extracted from the
  project's own Boiler.png tileset, the same frames the map itself uses,
  just cycled faster here) plus a smoke overlay during the ~1.8s reveal,
  then the liquid tints green (correct), blue (harmless), or red (wrong)
  with the herbalist's reaction underneath. Wrong/harmless results return
  the specimen and offer Try Again; correct advances the act.
- **Story wiring**: replaced the old placeholder reveal with a real
  intro + explore act (`completionMode: "cauldron"`), zone registered,
  BFS-reachability clean on both maps.

## Design note carried over from the brainstorming pass

Deadly Nightshade's field note carries the "hot as a hare, dry as a bone,
red as a beet, blind as a bat, mad as a hatter" mnemonic directly, since
it doesn't appear anywhere else in the game (the Discord final word
NIGHTSHADE stays a codename only, never the literal plant - confirmed
this doesn't need to match). Reading it against the case notes (victim
stayed lucid, no delirium) is what rules the plant out.

## Known gaps, flagged rather than guessed at

- No custom icons for the 6 specimen items yet - they use the generic
  star fallback like any other un-iconed evidence item.
- `cauldron:requestState` exists for late joiners/reconnects but only
  syncs status, not a full re-render of someone else's mid-drag state -
  fine for this puzzle's shape (no persistent partial progress to lose).
- The Finale (Act 10) and epilogue (Act 11) are still the old
  placeholders - not touched this pass.
