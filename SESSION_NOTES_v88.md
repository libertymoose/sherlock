# v88 delivery notes — documentation + cleanup pass

No new content this delivery. This was a full documentation rewrite and
code/asset cleanup pass, plus two real reachability fixes found along the
way.

## Documentation
- PROJECT_HANDOFF.md fully rewritten against actual current state (this is
  a standalone file, delivered separately, not shipped inside this zip -
  same as every previous handoff doc).
- MEANS_AND_OPPORTUNITY_SPEC.md fully rewritten, marking exactly what's
  built vs still design-only, per suspect. Also standalone, not in this
  zip.
- docs/dungeon_arc_planning.md updated: graffiti references changed from
  "Don't Trust a Nun" to "Don't Trust a Monk", matching the in-game asset
  change.

## Cleanup - every deletion cross-referenced before removal
Removed (confirmed genuinely dead via full audit, not guesswork):
- 5 orphaned mapsrc images (dungeon/arches_columns.png, other_objects.png,
  stairs.png - all superseded by _wide variants; the old
  dont_trust_a_nun.png and north_isnt_north.png graffiti files, both
  superseded by their current in-use versions).
- 19 orphaned npc portrait/look files (npc_1.png through npc_15.png, plus
  guard_idle/walk.png and guildmaster_idle/walk.png).
- 5 interactions.json entries (npc_chapel_monk, superseded within this
  same session; npc_guest_b1/b2/c1/c2, flagged as safe-to-cut across
  several previous handoffs, never reused).

Flagged and deliberately NOT removed: manor_stairs_flipped.png (looks like
a real regression, not stale content - neither manor floor currently
references it despite documented "true staircase mirroring" work),
citizen9 assets (intentionally reserved, documented), the
lockedContainers/lockedDoors/searches registries (real, just referenced
indirectly).

JS/CSS: zero dead socket handlers found (checked both directions across
all three JS files), zero unused CSS classes (118 checked). The
previously-documented Phase 1 puzzle system removal was confirmed fully
complete.

## Two real bugs found and fixed during the audit
- **guild_hall_exterior now has real collision** and is registered in
  ZONE_MAPS. Built via the same floor-minus-structure heuristic already
  approved for the Mage Tower basement. All 3 named exits land on
  directly walkable ground.
- **guild_hall_ground's front door (exit_guild_hall_town) is now
  reachable.** This was a known, deliberately-unfixed gap from the
  original Guild Hall conversion (left disconnected because its target
  was a placeholder at the time). Now that it's wired to a real
  destination (guild_hall_exterior), an unreachable front door stopped
  being harmless. Carved a connector. Flagged in PROJECT_HANDOFF.md that
  this wasn't verified against the original source file and is worth a
  look at the live render.
- Glass Workshop's staircase now has an approach path and a "roped off"
  blocker note, matching the back door's existing treatment.

## Still outstanding (unchanged from before this pass, not new)
- dungeon_area_5's 5 mouse objects remain unreachable - pre-existing,
  already documented in dungeon_arc_planning.md, re-confirmed not new.
- None of Act 3's zones are in story.json's live act sequence yet.
- Town map (Market + Tavern ground floor) doesn't exist.
- The guild_hall_ground "Entrance" exit's purpose is still unresolved.

## Validation run before this zip
JSON parse: clean, all content/map files. node --check: clean on
server.js, client.js, overworld.js. CSS brace count: balanced (192/192).
em-dash grep: clean, whole project. BFS reachability: full sweep across
all 28 maps, only the pre-existing documented rat maze gap remains.
