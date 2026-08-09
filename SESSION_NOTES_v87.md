# v87 delivery notes

## New this delivery
- **Guild Hall Exterior now has real collision** and is registered in
  ZONE_MAPS for the first time. Built via floor-minus-structure heuristic
  (walkable requires BASE/Floor details/Floor Edges, blocked by
  House/Trees/Sign), same technique already approved for the Mage Tower
  basement. Roof and Flags deliberately excluded from blocking - both
  overlap the House footprint already, including them separately risked
  over-blocking near building edges without adding real information. All
  3 named exits (sewers, town, training area) land directly on walkable
  ground, no carving needed. Spawn set near the training-area exit.
- **Glass Workshop's staircase** now has a walkable approach and a
  "roped off, not for customers" blocker note, matching the back door's
  existing treatment (which was already in place from the prior delivery).

## Still outstanding
- Guild Hall Exterior's "into town" exit still targets PLACEHOLDER_TOWN -
  the town map doesn't exist yet.
- All Wave 2 interiors (Tavern, Chapel, Glass Workshop) still target
  PLACEHOLDER_TOWN_EXTERIOR for the same reason.
- Tavern's stairs down still target PLACEHOLDER_TAVERN_GROUND - ground
  floor doesn't exist yet.
- None of Act 3's zones are in story.json's live act sequence yet, and no
  act sets showBoard - everything built is reachable for testing, not yet
  reachable through an actual playthrough.

## Validation run before this zip
JSON parse: clean, all content/map files. node --check: clean on
server.js, client.js, overworld.js. CSS brace count: balanced (192/192).
em-dash grep: clean, whole project. BFS reachability: guild_hall_exterior
and glass_workshop both fully reachable from spawn, zero unreachable
objects.
