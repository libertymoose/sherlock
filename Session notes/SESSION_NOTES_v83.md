# v83 delivery notes

## New this delivery
- **Guild Hall Exterior** (guild_hall_exterior.json) - tile art complete, all 6
  tilesets resolved (Trees_rocks.tsx sourced from the Grassland pack). NOT
  registered in ZONE_MAPS yet - collision was never built, no boundary layer
  exists in the source file. Safe to walk around once you add one; wiring it
  in with no collision would crash on the first isBlockedTile check.
- **Training Ground** (training_ground.json) - fully built and playable.
  Real collision from the three BOUNDARY polygons (confirmed blocked
  obstacles). 5 fighters (2 carry real clue content, 3 are flavor
  dismissals), 1 dragon (real cryptic clue, not gated). Wired into ZONE_MAPS.
- **Blacksmith Interior** (blacksmith_interior.json) - fully built and
  playable. Real collision from the WALKABLE AREA polygon. The Blacksmith is
  now a real two-stage NPC. Wired into ZONE_MAPS.
- **New engine capability: party-wide trigger facts + two-stage NPC
  dialogue.** room.knownFacts (persistent across acts), fact:learn,
  npc:twoStageDialogue in server.js. learnsFact generic hook +
  two_stage_dialogue kind in client.js. twoStageDialogues registry in
  interactions.json. Reusable for every other two-stage NPC the Means and
  Opportunity spec calls for, not just the blacksmith.

## Real connections wired this delivery
- Training Ground <-> Guild Hall Exterior (east/west edge match, both
  directions, real coordinates not placeholders)
- Training Ground -> Blacksmith Interior (both directions, real coordinates)

## Still placeholder / not yet connected
- Guild Hall Exterior's "into town" and the interior's own front door exit
  still point at PLACEHOLDER targets - Town map and the exterior's own
  collision don't exist yet.
- Training Ground -> Mage Tower exit still PLACEHOLDER (converting now,
  next delivery).
- The 'cold_forge' fact has nowhere to be learned yet - needs the Mage
  Tower apprentice NPC tagged with learnsFact, see below.

## Validation run before this zip
JSON parse: clean. node --check (server.js, client.js, overworld.js): clean.
CSS brace count: balanced (172/172). em-dash grep: clean, whole project.
BFS reachability: training_ground and blacksmith_interior both fully
reachable from spawn. guild_hall_exterior skipped (no collision to check
yet, by design, see above).
