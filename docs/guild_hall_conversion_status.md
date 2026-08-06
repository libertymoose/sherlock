# Guild Hall interior - conversion status

Both floors converted from Elle's Tiled exports (`Interior_1st_floor_EDITED.tmx`
for the ground floor, `GUILD_HALL_INTERIOR_UP.tmx` for upstairs) and are
walkable, staircase-connected, in the shipped game. Source art copied from
the `craftpix-net-189780-free-top-down-pixel-art-guild-hall-asset-pack`
into `public/assets/mapsrc/guild_hall/`.

## What's real and verified

- Collision derived from each floor's Floor-layer footprint minus the
  Objects layers (treated as blocking furniture). Validated against
  Elle's actual placed markers (DOOR, STAIRS UP, ENTRANCE/EXIT on the
  ground floor - computed from their true bounding-box centers, not raw
  top-left coordinates, which matters for ellipse/rect objects) - all
  land on walkable tiles.
- Staircase connectivity: ground floor's STAIRS UP leads to upper floor
  tile (3,7), which was found by placing a reasonable landing spot near
  the ladder's ground-floor position, discovering it was furniture-
  blocked, and relocating to the nearest open tile. Confirmed reachable
  both directions.
- Both zones registered in `ZONE_MAPS` (client.js) and `ALL_ZONE_MAPS`
  (server.js), with proper zone labels.

## Known gap, not fixed blindly

`exit_guild_hall_town` (the DOOR marker, ground floor, tile 15,4) sits in
an 8-tile pocket (cols 15-16, rows 4-7) that the current collision
derivation leaves fully sealed off from the rest of the floor. The
boundary at columns 13-14 reads as a real structural wall divider (tall,
consistent content across two Objects layers, all rows) rather than
incidental furniture - this might genuinely be a separate foyer/vestibule
by design, not a bug. Not force-fixed since there's no way to tell without
seeing the actual render. Functionally harmless for now since this exit's
target zone is a placeholder anyway (Town doesn't exist yet).

## Explicitly not done

- **No NPCs placed on either floor.** Tilesets are loaded and available
  (Guildmaster, Talking_people, Citizen1/2, Fighter2, Fighter_sword,
  Attacked_Manequin 1-3, Mage 1-4, Fire, Reader1/2) but nothing placed -
  this needs real content design (who's here, what they say), not a
  guess.
- **Two exits are placeholders.** `exit_guild_hall_town` and
  `exit_guild_hall_entrance` both have `targetZone: "PLACEHOLDER_..."` -
  need real target zones once Town and whatever leads into the Guild Hall
  (basement? directly from outside_sewer?) actually exist.
- Collision itself is not visually confirmed against the actual render,
  just validated against the three placed markers and full reachability.
  Worth a look once Elle can see it in-browser, especially any furniture
  that might read as walkable or block something it shouldn't.
