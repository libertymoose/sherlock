# The Cell Window Escape (Jail, Act 1 of the escape sequence)

The engine-side mechanic is built and ready. This is the data contract your
Tiled export needs to follow so it wires up automatically, no code changes
needed once the map exists.

## What's already built

- A pressure plate is a walk-onto rectangle. Standing on it holds a door
  open for everyone else in the room; stepping off closes it immediately.
- If only one player is actually in the zone (testing solo), stepping on
  a plate instead pulses a door open for 5 seconds on a timer, no hold
  required, since there's no one else around to hold it for you.
- Door open/closed state reuses the exact same animation system already
  driving the estate's doors and windows (the ANIMATION TRIGGERS layer
  convention), it's just triggered remotely by another player's plate
  instead of by your own proximity. Any door tile animation you set up in
  Tiled the normal way will just work here.
- Collision is dynamic: a window/door barrier is solid until its linked
  zone is fully open, then passable, then solid again the moment it starts
  closing. This is new, doors on the estate never blocked movement before,
  these do.

## What the map JSON needs (two new top-level arrays, alongside the
existing `animationZones` and `interiorZones`)

**`pressurePlates`**: one entry per plate.
```json
{
  "id": "plate_cell1",
  "x0": 12, "y0": 4, "x1": 13, "y1": 5,
  "targetDoorZoneId": "door_cell2",
  "selfDoorZoneId": "door_cell1"
}
```
- `x0/y0/x1/y1` are tile coordinates, same convention as `interiorZones`.
- `targetDoorZoneId` is which door this plate opens for someone else, the
  normal multiplayer case. Matches an `id` in `animationZones`.
- `selfDoorZoneId` is which door it opens for the solo fallback, normally
  the plate's own cell's window. Also matches an `animationZones` id.

**`barriers`**: one entry per window/door that should physically block
movement until open.
```json
{
  "id": "barrier_cell1_window",
  "x0": 14, "y0": 4, "x1": 15, "y1": 5,
  "animZoneId": "door_cell1"
}
```
- `animZoneId` must match the same `id` used in `animationZones` (and in
  whichever plate's `targetDoorZoneId`/`selfDoorZoneId` opens it).

## For the N+1 cell loop

With however many cells you draw, plate in Cell N should set
`targetDoorZoneId` to Cell N+1's window barrier id, wrapping around so the
last cell's plate targets Cell 1's window. Each cell also needs its own
`selfDoorZoneId` pointing at its own window, for the solo fallback. That
wiring lives entirely in the map JSON, nothing else needs to change on the
code side to support any number of cells.
