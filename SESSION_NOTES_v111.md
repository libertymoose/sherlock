# v111 delivery notes

Three core session/party mechanics fixes.

## 1. Rejoin with just the join code

Previously, once a game started, `player:joinRoom` unconditionally
rejected everyone - the only way back in was the same browser having
quietly saved a reconnect token in localStorage. A player on a different
device, or with a cleared browser, had no way back in at all. Now, if
the room's already started and the name typed matches a currently
disconnected seat, it reclaims that seat properly (same inventory, same
act, fresh token saved going forward) - the same outcome the existing
token-based auto-reconnect already gives, just reachable by typing the
code and name again instead of depending on browser storage surviving.

## 2. Catch-up prompt instead of forced teleport

Built per your steer away from "just teleport everyone" - the server
tracks each player's progress rank through the dungeon's one-way chain
(the four Area 4 side-rooms count as the same rank as the hub, since
they're detours, not forward progress). When the party's front-runner
moves further ahead than a teammate, that teammate is offered a prompt
- "the rest of your group has moved ahead, want to jump forward and join
them?" - rather than being forcibly moved or left stuck. Declining
doesn't get re-asked on every subsequent unrelated step; a new prompt
only appears if the gap grows past what they already saw.

## 3. Cutscenes close dialogue and fade consistently

Found a real, concrete gap while checking this: fade-to-black was only
wired into two of three places an "explore" act could actually complete
(a successful vote, and the whole party reaching a shared zone) - the
Estate's evidence-based completion had no fade at all, so that specific
transition could cut straight into whatever came next with no warning.
Centralized all three completion paths into one shared function so a
fourth completion mode can't silently skip this again. The fade now also
explicitly closes any open dialogue box and any open modal (inventory,
board, etc.) the instant it starts, not only once the new act has
finished loading.

## Validation before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. HTML div tag count balanced.

## Not tested live

All three of these touch core session/party plumbing that's hard to
fully exercise without a live multiplayer session - the reasoning is
sound and each piece was checked against the actual existing code paths
it needed to match, but none of the three has been watched running in a
real browser yet.
