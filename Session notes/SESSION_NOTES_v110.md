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
