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
