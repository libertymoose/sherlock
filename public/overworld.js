// Overworld engine. A small hand-rolled top-down renderer.
// Exposed as window.Overworld. Talks to the rest of the app only through
// the callbacks passed into init(), so it doesn't know about puzzles/dialogue directly.

window.Overworld = (function () {
  const TILE = 16;
  const RENDER_SCALE = 3; // how big each 16px tile appears on screen
  const MOVE_SPEED = 78; // px/sec in world space (bumped up for the larger map)
  const INTERACT_RADIUS = 22; // px

  // Ground rendering now comes from mapData.tilesets + mapData.layers (a real
  // Tiled export), resolved once at load time in loadMap(). See resolveLayers().

  let canvas, ctx;
  let socket = null;
  let mapData = null;
  let images = {};

  // Player character system: a base body (male/female) tinted a solid colour,
  // Among-Us style. No live canvas tinting, the 12 colour variants per gender
  // are pre-generated static sprite sheets (see base/manifest.json), same
  // "fixed pre-made sprite" pattern as NPCs/wildlife use.
  let BASE_MANIFEST = {};
  let NPC_MANIFEST = {};
  let WILDLIFE_MANIFEST = {};
  // Both base body packs (male/female) share the same source geometry and
  // direction order as the old human sheet: down/left/right/up. Confirmed by
  // eye against the actual sprite sheets, not assumed.
  const PLAYER_DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
  const NPC_DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

  // Calibrated from actual non-transparent content height (old human sheet
  // was 27px tall at draw size 46; the new base sheets are 22px tall), so
  // on-screen height stays consistent with everything else.
  const PLAYER_DRAW_SIZE = 50;
  const WORLD_CHAR_SIZE = 22; // NPC on-map footprint
  const IDLE_FPS = 6;
  const WALK_FPS = 9;
  const AMBLE_FPS = 4; // slower leg-cycle for the gentle NPC wander, not a full walk pace

  let running = false;
  let rafId = null;
  let lastTime = 0;

  let me = { x: 0, y: 0, dir: "down", moving: false, gender: "male", color: "red" };
  let myName = "";
  let currentZone = "estate";
  let mySpawnIndex = null; // this player's stable roster index, for maps with multiple spawnPoints
  let others = {}; // socketId -> {x,y,dir,moving,gender,color,name}
  let keys = {};
  let animTimer = 0;
  let animFrame = 0;
  let nearbyObject = null;
  let lastSentAt = 0;
  let lastSent = null;

  let npcStates = {}; // objId -> wander/animation state, rebuilt on map load
  let wildlifeTimer = 0;
  let wildlifeFrame = 0;

  let callbacks = { onInteract: null, onNearbyChange: null, onPlateEnter: null, onPlateLeave: null };

  function loadImage(src) {
    if (images[src]) return images[src].promise;
    const img = new Image();
    const promise = new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
    });
    img.src = src;
    images[src] = { img, promise };
    return promise;
  }

  function getImg(src) {
    return images[src] && images[src].img;
  }

  async function loadJSON(url) {
    const res = await fetch(url);
    return res.json();
  }

  function allFrameSrcs(manifest) {
    const srcs = [];
    Object.values(manifest).forEach((entry) => {
      if (entry.idle) srcs.push(entry.idle.src);
      if (entry.walk) srcs.push(entry.walk.src);
      if (entry.src) srcs.push(entry.src); // wildlife (single state)
    });
    return srcs;
  }

  let resolvedLayers = []; // "sorted" layers only now: [{name, cells:[{x,y,img,sx,sy}]}]
  // floorSegments (declared near resolveLayers) replaced the old single
  // floorCanvas + animatedFloorCells pair, see the comment there for why.

  let animClock = 0; // ms, accumulated each frame, drives animated tile frames
  let zoneStates = {}; // zoneId -> { phase: 'closed'|'opening'|'open'|'closing', since: animClock at last transition }
  let insideAnimZones = new Set(); // which zones the player is inside right now, for edge detection
  let insideInteriorZone = null; // which INTERIORS rect (if any) the player is currently standing in, for edge-triggering
  let insidePlateId = null; // which pressure plate (if any) the player is currently standing on, for edge-triggering

  async function loadMap(url) {
    const res = await fetch(url);
    mapData = await res.json();
    zoneStates = {};
    insideAnimZones = new Set();
    insideInteriorZone = null;
    insidePlateId = null;

    // Load every tileset image this map references, plus static props.
    const srcs = new Set(mapData.tilesets.map((t) => t.image));
    mapData.objects.forEach((o) => { if (o.sprite) srcs.add(o.sprite); });
    if (mapData.objects.some((o) => o.type === "scrap")) srcs.add("/assets/props/paper_scrap.png");
    if (mapData.objects.some((o) => o.type === "table")) srcs.add("/assets/props/evidence_table.png");
    await Promise.all([...srcs].map(loadImage));

    resolveLayers();

    // Player base manifest (gender + colour tint), plus NPC/wildlife manifests.
    // Small roster, so we just load everything up front rather than tracking
    // exactly what's used.
    const [baseManifest, npcManifest, wildlifeManifest] = await Promise.all([
      loadJSON("/assets/characters/base/manifest.json"),
      loadJSON("/assets/npcs/looks/manifest.json"),
      loadJSON("/assets/wildlife/anim/manifest.json"),
    ]);
    BASE_MANIFEST = baseManifest;
    NPC_MANIFEST = npcManifest;
    WILDLIFE_MANIFEST = wildlifeManifest;

    const charSrcs = [];
    Object.values(BASE_MANIFEST).forEach((genderSet) => {
      Object.values(genderSet).forEach((entry) => {
        charSrcs.push(entry.idle.src, entry.walk.src);
      });
    });
    charSrcs.push(...allFrameSrcs(NPC_MANIFEST));
    charSrcs.push(...allFrameSrcs(WILDLIFE_MANIFEST));
    await Promise.all(charSrcs.map(loadImage));

    // Most maps have one spawn everyone lands on. A few (the jail cells,
    // so far) define spawnPoints instead, one per player, so the party
    // actually starts split up rather than stacked on one tile. Falls
    // back to the single spawn when a map doesn't define spawnPoints, or
    // when we were never told which index we are (e.g. this map was
    // reached by walking through a zone exit, which sets position itself
    // right after this runs anyway).
    if (mapData.spawnPoints && mapData.spawnPoints.length && mySpawnIndex != null && mySpawnIndex >= 0) {
      const idx = mySpawnIndex % mapData.spawnPoints.length;
      const sp = mapData.spawnPoints[idx];
      me.x = sp.x * TILE + TILE / 2;
      me.y = sp.y * TILE + TILE / 2;
    } else {
      me.x = mapData.spawn.x * TILE + TILE / 2;
      me.y = mapData.spawn.y * TILE + TILE / 2;
    }

    initNpcStates();

    return mapData;
  }

  const doorFrameInfoCache = new Map();

  // Authored Tiled animations for gated tiles are a full round-trip loop
  // (rest -> opening -> held open -> closing back to rest). We only want the
  // "opening" half to play forward on entry and backward on exit, so this
  // finds the held-open frame and the frames that lead up to it. Different
  // maps author "hold" differently, some repeat the held frame many times
  // in the frame list, others just give it one long duration, so this picks
  // whichever non-rest gid accounts for the most total time in the loop,
  // which works for either convention.
  function getDoorFrameInfo(baseGid, frames) {
    if (doorFrameInfoCache.has(baseGid)) return doorFrameInfoCache.get(baseGid);
    const restGid = frames[0].gid;
    const timeByGid = {};
    for (const f of frames) timeByGid[f.gid] = (timeByGid[f.gid] || 0) + f.duration;
    let peakGid = restGid, peakTime = 0;
    for (const gid in timeByGid) {
      if (Number(gid) !== restGid && timeByGid[gid] > peakTime) {
        peakGid = Number(gid);
        peakTime = timeByGid[gid];
      }
    }
    let firstPeakIdx = frames.findIndex((f) => f.gid === peakGid);
    if (firstPeakIdx === -1) firstPeakIdx = frames.length - 1;
    let startIdx = 0;
    while (startIdx < firstPeakIdx && frames[startIdx].gid === restGid) startIdx++;
    const opening = frames.slice(startIdx, firstPeakIdx + 1);
    const info = { restGid, peakGid, opening: opening.length ? opening : [{ gid: peakGid, duration: 150 }] };
    doorFrameInfoCache.set(baseGid, info);
    return info;
  }

  // Given a tile's base gid, returns whichever gid should actually be drawn
  // right now. Ambient tiles (no gate) just loop forever. Gated tiles
  // (building doors/windows etc) sit frozen at rest until a player walks
  // into the matching zone, play forward once, hold open, then play
  // backward once when a player leaves the zone.
  function currentGidFor(baseGid, layer, index) {
    const frames = mapData.animations && mapData.animations[baseGid];
    if (!frames || !frames.length) return baseGid;
    const zone = layer.gatedCells && layer.gatedCells[index];

    if (!zone) {
      const total = frames.reduce((s, f) => s + f.duration, 0);
      if (total <= 0) return baseGid;
      let t = animClock % total;
      for (const f of frames) {
        if (t < f.duration) return f.gid;
        t -= f.duration;
      }
      return frames[frames.length - 1].gid;
    }

    const info = getDoorFrameInfo(baseGid, frames);
    const state = zoneStates[zone] || { phase: "closed", since: 0 };
    const openDur = info.opening.reduce((s, f) => s + f.duration, 0) || 1;
    const elapsed = animClock - state.since;

    if (state.phase === "closed") return info.restGid;
    if (state.phase === "open") return info.peakGid;

    if (state.phase === "opening") {
      if (elapsed >= openDur) {
        state.phase = "open";
        state.since = animClock;
        zoneStates[zone] = state;
        return info.peakGid;
      }
      let t = elapsed;
      for (const f of info.opening) {
        if (t < f.duration) return f.gid;
        t -= f.duration;
      }
      return info.peakGid;
    }

    if (state.phase === "closing") {
      if (elapsed >= openDur) {
        state.phase = "closed";
        state.since = animClock;
        zoneStates[zone] = state;
        return info.restGid;
      }
      let t = elapsed;
      const rev = [...info.opening].reverse();
      for (const f of rev) {
        if (t < f.duration) return f.gid;
        t -= f.duration;
      }
      return info.restGid;
    }

    return baseGid;
  }

  // Ground tiles come from a real Tiled export: a list of tilesets (each
  // covering a gid range) and a list of layers (each either a dense
  // width*height gid array, or a sparse list of [x,y,gid] triples for mostly-
  // empty layers). Resolving which tileset+sub-rect a gid belongs to is a
  // linear scan, cheap enough since this only runs once here at load time,
  // not per frame; render() just walks the precomputed result.
  function resolveGid(gid) {
    for (const ts of mapData.tilesets) {
      if (gid >= ts.firstgid && gid <= ts.lastgid) {
        const local = gid - ts.firstgid;
        const col = local % ts.columns;
        const row = Math.floor(local / ts.columns);
        return { src: ts.image, sx: col * ts.tilewidth, sy: row * ts.tileheight };
      }
    }
    return null;
  }

  // Floor rendering used to be: one big static bake of every non-animated
  // floor tile, drawn first, then every animated floor tile (water shimmer,
  // fish, etc) drawn on top of that in one final pass. That silently
  // discarded z-order: in the actual Tiled layer stack, "Water" sits BELOW
  // "Ground"/"Edges" (a grass bank edge is meant to paint over the water
  // tile it borders), but since animated tiles always drew last regardless
  // of source layer, water shimmer ended up on top of Ground/Edges/dock
  // decking everywhere instead of only where it was actually the top layer.
  // floorSegments preserves real layer order: an ordered list of either a
  // baked static canvas (a contiguous run of non-animated floor content) or
  // a list of animated cells belonging to one layer, interleaved in the
  // same order the original Tiled layers were stacked in.
  let floorSegments = [];

  function resolveLayers() {
    resolvedLayers = [];
    floorSegments = [];
    let currentBatch = []; // accumulating static floor cells for the next baked segment

    const flushBatch = () => {
      if (!currentBatch.length) return;
      const canvas = document.createElement("canvas");
      canvas.width = mapData.width * TILE;
      canvas.height = mapData.height * TILE;
      const bctx = canvas.getContext("2d");
      bctx.imageSmoothingEnabled = false;
      currentBatch.forEach((c) => {
        bctx.drawImage(c.img, c.sx, c.sy, TILE, TILE, c.x * TILE, c.y * TILE, TILE, TILE);
      });
      floorSegments.push({ type: "static", canvas });
      currentBatch = [];
    };

    mapData.layers.forEach((layer) => {
      const cells = [];
      const isAnimatedLayer = (gid) => mapData.animations && mapData.animations[gid];
      const layerAnimatedCells = [];

      // For "sorted" layers, tall objects (trees, bridge rails etc) are
      // often several rows of stacked tiles in the same layer. Sorting each
      // row purely by its own y let a player standing right behind a tree's
      // trunk draw in FRONT of the canopy rows above it, since those rows
      // individually had a smaller y than the player. Instead, every tile in
      // a contiguous vertical run within one column shares the run's bottom
      // row as its sort key, so the whole tree/rail segment sorts as one
      // object relative to the player, the way it visually reads.
      let bottomOfRun = null;
      if (layer.kind !== "floor" && layer.dense) {
        const w = mapData.width, h = mapData.height;
        bottomOfRun = new Int16Array(w * h).fill(-1);
        for (let x = 0; x < w; x++) {
          let y = h - 1;
          while (y >= 0) {
            if (layer.data[y * w + x]) {
              let bottom = y;
              while (y >= 0 && layer.data[y * w + x]) {
                bottomOfRun[y * w + x] = bottom;
                y--;
              }
            } else {
              y--;
            }
          }
        }
      }

      if (layer.dense) {
        const w = mapData.width;
        for (let i = 0; i < layer.data.length; i++) {
          const gid = layer.data[i];
          if (!gid) continue;
          const x = i % w, y = Math.floor(i / w);
          if (layer.kind === "floor" && isAnimatedLayer(gid)) {
            layerAnimatedCells.push({ x, y, gid, layer, index: i });
            continue;
          }
          const r = resolveGid(gid);
          if (!r) continue;
          if (layer.kind === "floor") {
            currentBatch.push({ x, y, img: getImg(r.src), sx: r.sx, sy: r.sy });
            continue;
          }
          const sortRow = bottomOfRun ? bottomOfRun[i] : y;
          cells.push({ x, y, sortRow, img: getImg(r.src), sx: r.sx, sy: r.sy, gid, layer, index: i, animated: !!isAnimatedLayer(gid) });
        }
      } else {
        layer.cells.forEach(([x, y, gid], idx) => {
          if (layer.kind === "floor" && isAnimatedLayer(gid)) {
            layerAnimatedCells.push({ x, y, gid, layer, index: idx });
            return;
          }
          const r = resolveGid(gid);
          if (!r) return;
          if (layer.kind === "floor") {
            currentBatch.push({ x, y, img: getImg(r.src), sx: r.sx, sy: r.sy });
            return;
          }
          cells.push({ x, y, sortRow: y, img: getImg(r.src), sx: r.sx, sy: r.sy, gid, layer, index: idx, animated: !!isAnimatedLayer(gid) });
        });
      }

      if (layer.kind === "floor") {
        // This layer's static cells are already queued in currentBatch above.
        // If it also has animated cells, that's a z-order boundary: bake
        // everything queued so far (including this layer's own static
        // tiles), emit this layer's animated cells as their own segment,
        // then start a fresh batch for whatever floor layer comes next.
        if (layerAnimatedCells.length) {
          flushBatch();
          floorSegments.push({ type: "animated", cells: layerAnimatedCells });
        }
      } else {
        resolvedLayers.push({ name: layer.name, cells });
      }
    });

    flushBatch();
  }

  function initNpcStates() {
    npcStates = {};
    mapData.objects.forEach((o) => {
      if (o.type !== "npc") return;
      npcStates[o.id] = {
        look: o.look || "citizen1",
        wanderRadius: o.wanderRadius || 0,
        phase: "idle",
        dir: "down",
        frame: 0,
        animTimer: 0,
        pauseTimer: 10 + Math.random() * 10,
        offsetX: 0,
        offsetY: 0,
        targetOffsetX: 0,
        targetOffsetY: 0,
      };
    });
  }

  function isBlockedTile(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= mapData.width || ty >= mapData.height) return true;
    if (mapData.collision[ty][tx] === 1) return true;

    // Barriers are tile rects that are only passable while their linked
    // animation zone is fully open, used for things like the jail windows:
    // solid until a pressure plate elsewhere opens them, solid again the
    // moment that zone starts closing.
    if (mapData.barriers) {
      for (const b of mapData.barriers) {
        if (tx >= b.x0 && tx < b.x1 && ty >= b.y0 && ty < b.y1) {
          const state = zoneStates[b.animZoneId];
          if (!state || state.phase !== "open") return true;
        }
      }
    }
    return false;
  }

  function canStandAt(x, y) {
    const half = 5;
    const pts = [
      [x - half, y - 2],
      [x + half, y - 2],
      [x - half, y + half],
      [x + half, y + half],
    ];
    return pts.every(([px, py]) => !isBlockedTile(px, py));
  }

  let zoneChangeInProgress = false;

  function handleKeyDown(e) {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === " " && !e.repeat) {
      e.preventDefault();
      triggerInteract();
    }
  }
  function handleKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
  }

  function triggerInteract() {
    if (zoneChangeInProgress) return;
    if (nearbyObject && callbacks.onInteract) {
      callbacks.onInteract(nearbyObject);
    }
  }

  function findNearbyObject() {
    if (!mapData) return null;
    let closest = null;
    let closestDist = Infinity;
    for (const obj of mapData.objects) {
      let ox = obj.x * TILE + TILE / 2;
      let oy = obj.y * TILE + TILE / 2;
      if (obj.type === "npc") {
        const st = npcStates[obj.id];
        if (st) {
          ox += st.offsetX;
          oy += st.offsetY;
        }
      }
      const d = Math.hypot(ox - me.x, oy - me.y);
      if (d < INTERACT_RADIUS && d < closestDist) {
        closest = obj;
        closestDist = d;
      }
    }
    if ((closest && closest.id) !== (nearbyObject && nearbyObject.id)) {
      nearbyObject = closest;
      if (callbacks.onNearbyChange) callbacks.onNearbyChange(closest);
    }
    return closest;
  }

  function update(dt) {
    let dx = 0;
    let dy = 0;
    if (keys["arrowup"] || keys["w"]) dy -= 1;
    if (keys["arrowdown"] || keys["s"]) dy += 1;
    if (keys["arrowleft"] || keys["a"]) dx -= 1;
    if (keys["arrowright"] || keys["d"]) dx += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.sqrt(dx * dx + dy * dy);
      const stepX = (dx / len) * MOVE_SPEED * dt;
      const stepY = (dy / len) * MOVE_SPEED * dt;

      if (Math.abs(dx) > Math.abs(dy)) {
        me.dir = dx > 0 ? "right" : "left";
      } else if (dy !== 0) {
        me.dir = dy > 0 ? "down" : "up";
      }

      const nx = me.x + stepX;
      const ny = me.y + stepY;
      if (canStandAt(nx, me.y)) me.x = nx;
      if (canStandAt(me.x, ny)) me.y = ny;
    }
    me.moving = moving;

    // Animate continuously in both states; drawFrame() takes frameIndex % cols
    // per sheet, so this doesn't need to know each sheet's exact frame count.
    animTimer += dt;
    const fps = moving ? WALK_FPS : IDLE_FPS;
    if (animTimer > 1 / fps) {
      animTimer = 0;
      animFrame++;
    }

    animClock += dt * 1000; // Tiled animation durations are in ms
    checkAnimationZones();
    checkInteriorZones();
    checkPressurePlates();

    findNearbyObject();
    maybeSendPosition();
    updateNpcs(dt);
  }

  // Building animations (doors opening etc) sit frozen at rest by default.
  // Walking into the matching zone plays the animation forward once and
  // holds it open; walking back out plays it backward once, closing it.
  function checkAnimationZones() {
    if (!mapData || !mapData.animationZones) return;
    const tx = me.x / TILE, ty = me.y / TILE;
    const currentlyInside = new Set();
    for (const z of mapData.animationZones) {
      if (tx >= z.x0 && tx < z.x1 && ty >= z.y0 && ty < z.y1) {
        currentlyInside.add(z.id);
      }
    }

    for (const zid of currentlyInside) {
      if (!insideAnimZones.has(zid)) {
        const s = zoneStates[zid] || { phase: "closed", since: 0 };
        if (s.phase === "closed" || s.phase === "closing") {
          s.phase = "opening";
          s.since = animClock;
        }
        zoneStates[zid] = s;
      }
    }
    for (const zid of insideAnimZones) {
      if (!currentlyInside.has(zid)) {
        const s = zoneStates[zid] || { phase: "open", since: 0 };
        if (s.phase === "open" || s.phase === "opening") {
          s.phase = "closing";
          s.since = animClock;
        }
        zoneStates[zid] = s;
      }
    }
    insideAnimZones = currentlyInside;
  }

  // Walking anywhere into an INTERIORS rectangle moves the party into that
  // building, no interact button needed. Edge-triggered (only fires on the
  // step from outside to inside) so it doesn't refire every frame while
  // standing in the zone.
  function checkInteriorZones() {
    if (!mapData || !mapData.interiorZones) return;
    const tx = me.x / TILE, ty = me.y / TILE;
    const zone = mapData.interiorZones.find(
      (z) => tx >= z.x0 && tx < z.x1 && ty >= z.y0 && ty < z.y1
    );
    const zoneId = zone ? zone.id : null;
    if (zoneId !== insideInteriorZone) {
      insideInteriorZone = zoneId;
      if (zone && callbacks.onInteract) {
        callbacks.onInteract({
          id: `zone_${zone.id}`,
          type: "zone_exit",
          interaction: {
            kind: "zone_exit",
            targetZone: zone.targetZone,
            targetX: zone.targetX,
            targetY: zone.targetY,
          },
        });
      }
    }
  }

  // Pressure plates are walk-onto zones, edge-triggered like interior zones.
  // Standing on one notifies the server, which decides (based on how many
  // players are actually in this zone) whether that opens someone else's
  // door for as long as you hold it, or, solo, pulses your own door open
  // on a short timer instead. The actual open/closed state always comes
  // back from the server via Overworld.setRemoteDoorPhase(), never assumed
  // locally, so it stays correct for everyone watching.
  function checkPressurePlates() {
    if (!mapData || !mapData.pressurePlates) return;
    const tx = me.x / TILE, ty = me.y / TILE;
    const plate = mapData.pressurePlates.find(
      (z) => tx >= z.x0 && tx < z.x1 && ty >= z.y0 && ty < z.y1
    );
    const plateId = plate ? plate.id : null;
    if (plateId !== insidePlateId) {
      if (insidePlateId && callbacks.onPlateLeave) {
        callbacks.onPlateLeave({ id: insidePlateId });
      }
      insidePlateId = plateId;
      if (plate && callbacks.onPlateEnter) {
        callbacks.onPlateEnter({
          id: plate.id,
          targetDoorZoneId: plate.targetDoorZoneId,
          selfDoorZoneId: plate.selfDoorZoneId,
        });
      }
    }
  }


  function updateNpcs(dt) {
    if (!mapData) return;
    mapData.objects.forEach((o) => {
      if (o.type !== "npc") return;
      const st = npcStates[o.id];
      if (!st) return;

      st.animTimer += dt;
      const fps = st.phase === "walking" ? AMBLE_FPS : IDLE_FPS;
      if (st.animTimer > 1 / fps) {
        st.animTimer = 0;
        st.frame++;
      }

      if (st.wanderRadius <= 0) return; // idle-in-place only

      if (st.phase === "idle") {
        st.pauseTimer -= dt;
        if (st.pauseTimer <= 0) {
          const target = pickWanderTarget(o, st);
          if (target) {
            st.targetOffsetX = target.x;
            st.targetOffsetY = target.y;
            st.dir = Math.abs(target.x - st.offsetX) > Math.abs(target.y - st.offsetY)
              ? (target.x > st.offsetX ? "right" : "left")
              : (target.y > st.offsetY ? "down" : "up");
            st.phase = "walking";
            st.frame = 0;
          } else {
            st.pauseTimer = 4 + Math.random() * 4; // no valid spot nearby, wait a while before trying again
          }
        }
      } else if (st.phase === "walking") {
        const dx = st.targetOffsetX - st.offsetX;
        const dy = st.targetOffsetY - st.offsetY;
        const dist = Math.hypot(dx, dy);
        const step = NPC_WANDER_SPEED * dt;
        if (dist <= step) {
          st.offsetX = st.targetOffsetX;
          st.offsetY = st.targetOffsetY;
          st.phase = "idle";
          st.frame = 0;
          st.pauseTimer = 14 + Math.random() * 14;
        } else {
          st.offsetX += (dx / dist) * step;
          st.offsetY += (dy / dist) * step;
        }
      }
    });
  }

  // Tries a few random points within the NPC's wander radius (in tiles) and
  // returns the first one that isn't inside a collision tile. Anchor point is
  // the object's own map position, offsets are added visually at draw time;
  // findNearbyObject() adds the current offset back in so interaction always
  // tracks wherever the NPC actually is right now.
  function pickWanderTarget(o, st) {
    const anchorX = o.x * TILE + TILE / 2;
    const anchorY = o.y * TILE + TILE / 2;
    for (let i = 0; i < 6; i++) {
      const ox = (Math.random() * 2 - 1) * st.wanderRadius * TILE;
      const oy = (Math.random() * 2 - 1) * st.wanderRadius * TILE;
      if (canStandAt(anchorX + ox, anchorY + oy)) {
        return { x: ox, y: oy };
      }
    }
    return null;
  }

  function maybeSendPosition() {
    if (!socket) return;
    const now = performance.now();
    const changed =
      !lastSent ||
      Math.abs(lastSent.x - me.x) > 0.5 ||
      Math.abs(lastSent.y - me.y) > 0.5 ||
      lastSent.dir !== me.dir ||
      lastSent.moving !== me.moving;
    if (changed && now - lastSentAt > 80) {
      lastSentAt = now;
      lastSent = { x: me.x, y: me.y, dir: me.dir, moving: me.moving };
      socket.emit("player:move", lastSent);
    }
  }

  // Generic sprite-sheet drawer. Every preset/NPC/wildlife sheet from this
  // asset generation follows the same convention: a grid of square cells,
  // one row per direction (or a single row for non-directional wildlife),
  // frames laid out left-to-right. `frameSet` describes one sheet's grid.
  function drawFrame(img, frameSet, dirRow, frameIndex, worldX, worldY, camX, camY, drawWorldSize) {
    if (!img) return;
    const cell = frameSet.cell;
    const cols = frameSet.cols;
    const col = frameIndex % cols;
    const row = Math.min(dirRow, (frameSet.rows || 1) - 1);
    const sx = col * cell;
    const sy = row * cell;
    const drawSize = drawWorldSize * RENDER_SCALE;
    const dx = Math.round(worldX * RENDER_SCALE - camX - drawSize / 2);
    const dy = Math.round(worldY * RENDER_SCALE - camY - drawSize);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, cell, cell, dx, dy, drawSize, drawSize);
    ctx.restore();
    return { x: dx + drawSize / 2, y: dy };
  }

  function drawPlayer(gender, color, worldX, worldY, camX, camY, dir, moving, frame) {
    const genderManifest = BASE_MANIFEST[gender] || BASE_MANIFEST.male;
    const entry = genderManifest[color] || genderManifest.red;
    if (!entry) return { x: worldX * RENDER_SCALE - camX, y: worldY * RENDER_SCALE - camY };
    const state = moving ? "walk" : "idle";
    const frameSet = entry[state];
    const img = getImg(frameSet.src);
    const dirRow = PLAYER_DIR_ROW[dir] ?? 0;
    return drawFrame(img, frameSet, dirRow, frame, worldX, worldY, camX, camY, PLAYER_DRAW_SIZE);
  }

  function drawNpc(o, camX, camY) {
    const st = npcStates[o.id];
    const look = NPC_MANIFEST[(st && st.look) || "citizen1"];
    if (!look) return null;
    const moving = st && st.phase === "walking";
    const frameSet = moving ? look.walk : look.idle;
    const img = getImg(frameSet.src);
    const worldX = o.x * TILE + TILE / 2 + (st ? st.offsetX : 0);
    const worldY = o.y * TILE + TILE / 2 + (st ? st.offsetY : 0);
    const dirRow = NPC_DIR_ROW[(st && st.dir) || "down"] ?? 0;
    const frame = st ? st.frame : 0;
    return drawFrame(img, frameSet, dirRow, frame, worldX, worldY, camX, camY, WORLD_CHAR_SIZE);
  }

  function spriteScreenPos(worldSize, worldX, worldY, camX, camY) {
    return {
      x: worldX * RENDER_SCALE - camX,
      y: worldY * RENDER_SCALE - camY - worldSize * RENDER_SCALE,
    };
  }

  function drawNameLabel(name, centerX, spriteTopY) {
    if (!name) return;
    ctx.save();
    ctx.font = "bold 10px 'Inter', -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2e222f";
    ctx.fillStyle = "#ffffff";
    const labelY = spriteTopY - 6;
    ctx.strokeText(name, centerX, labelY);
    ctx.fillText(name, centerX, labelY);
    ctx.restore();
  }

  function drawStaticSprite(src, x, y, cell) {
    const img = getImg(src);
    if (!img) return;
    const drawSize = cell * RENDER_SCALE;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x - drawSize / 2, y, drawSize, drawSize);
    ctx.restore();
  }

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#2e222f";
    ctx.fillRect(0, 0, w, h);
    if (!mapData) return;

    const scaledTile = TILE * RENDER_SCALE;
    const worldW = mapData.width * scaledTile;
    const worldH = mapData.height * scaledTile;
    // Clamp the camera to the map bounds so the void beyond the edge is never
    // visible, that void reading as "walking off the map" even when collision
    // was correctly stopping the player right at the boundary.
    let camX = me.x * RENDER_SCALE - w / 2;
    let camY = me.y * RENDER_SCALE - h / 2;
    camX = Math.max(0, Math.min(worldW - w, camX));
    camY = Math.max(0, Math.min(worldH - h, camY));
    if (worldW < w) camX = (worldW - w) / 2;
    if (worldH < h) camY = (worldH - h) / 2;

    const startCol = Math.max(0, Math.floor(camX / scaledTile));
    const endCol = Math.min(mapData.width - 1, Math.ceil((camX + w) / scaledTile));
    const startRow = Math.max(0, Math.floor(camY / scaledTile));
    const endRow = Math.min(mapData.height - 1, Math.ceil((camY + h) / scaledTile));

    // Floor: drawn as an ordered sequence of segments (see resolveLayers),
    // preserving real layer z-order between static bakes and animated
    // tiles, instead of one static blit followed by every animated tile
    // unconditionally on top.
    const sx = camX / RENDER_SCALE;
    const sy = camY / RENDER_SCALE;
    const sw = w / RENDER_SCALE;
    const sh = h / RENDER_SCALE;
    for (const seg of floorSegments) {
      if (seg.type === "static") {
        ctx.drawImage(seg.canvas, sx, sy, sw, sh, 0, 0, w, h);
      } else {
        for (const cell of seg.cells) {
          if (cell.x < startCol - 2 || cell.x > endCol + 2 || cell.y < startRow - 2 || cell.y > endRow + 2) continue;
          const curGid = currentGidFor(cell.gid, cell.layer, cell.index);
          const r = resolveGid(curGid);
          if (!r) continue;
          const dx = Math.round(cell.x * scaledTile - camX);
          const dy = Math.round(cell.y * scaledTile - camY);
          ctx.drawImage(getImg(r.src), r.sx, r.sy, TILE, TILE, dx, dy, scaledTile, scaledTile);
        }
      }
    }

    // Build a draw list: characters + interactive objects + "tall" scenery
    // layers (buildings/statues/fences/decor), all sorted by world Y together
    // so a character standing behind a tall object is correctly hidden by it,
    // and one standing in front of it correctly draws on top.
    const drawList = [];

    for (const layer of resolvedLayers) {
      for (const cell of layer.cells) {
        if (cell.x < startCol - 2 || cell.x > endCol + 2 || cell.y < startRow - 2 || cell.y > endRow + 2) continue;
        const dx = Math.round(cell.x * scaledTile - camX);
        const dy = Math.round(cell.y * scaledTile - camY);
        if (cell.animated) {
          drawList.push({
            y: cell.sortRow * TILE + TILE,
            draw: () => {
              const curGid = currentGidFor(cell.gid, cell.layer, cell.index);
              const r = resolveGid(curGid);
              if (!r) return;
              ctx.drawImage(getImg(r.src), r.sx, r.sy, TILE, TILE, dx, dy, scaledTile, scaledTile);
            },
          });
        } else {
          drawList.push({
            y: cell.sortRow * TILE + TILE,
            draw: () => ctx.drawImage(cell.img, cell.sx, cell.sy, TILE, TILE, dx, dy, scaledTile, scaledTile),
          });
        }
      }
    }

    mapData.objects.forEach((o) => {
      if (o.type === "npc") {
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => {
            const pos = drawNpc(o, camX, camY);
            if (pos) drawNameLabel(o.name, pos.x, pos.y);
          },
        });
      } else if (o.type === "scrap" && !o.__solved) {
        const pos = spriteScreenPos(16, o.x * TILE + TILE / 2, o.y * TILE + TILE / 2, camX, camY);
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => drawStaticSprite("/assets/props/paper_scrap.png", pos.x, pos.y - 4, 16),
        });
      } else if (o.type === "table") {
        const centerX = o.x * TILE * RENDER_SCALE - camX + (TILE * RENDER_SCALE) / 2;
        const topY = o.y * TILE * RENDER_SCALE - camY - (TILE * RENDER_SCALE) / 2;
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => drawStaticSprite("/assets/props/evidence_table.png", centerX, topY, 32),
        });
      } else if (o.interaction && o.interaction.kind === "evidence_document") {
        // These already have a custom ground icon (the EVIDENCE TILES layer),
        // the generic purple interact-dot on top of that read as redundant
        // clutter, so evidence objects get no marker of their own.
      } else {
        drawList.push({ y: o.y * TILE + TILE, draw: () => drawObjectMarker(o, camX, camY) });
      }
    });

    drawList.push({
      y: me.y,
      draw: () => {
        const pos = drawPlayer(me.gender, me.color, me.x, me.y, camX, camY, me.dir, me.moving, animFrame);
        if (myName) drawNameLabel(myName, pos.x, pos.y);
      },
    });

    Object.values(others).forEach((p) => {
      drawList.push({
        y: p.y,
        draw: () => {
          const pos = drawPlayer(p.gender || "male", p.color || "red", p.x, p.y, camX, camY, p.dir || "down", p.moving, animFrame);
          if (p.name) drawNameLabel(p.name, pos.x, pos.y);
        },
      });
    });

    drawList.sort((a, b) => a.y - b.y);
    drawList.forEach((item) => item.draw());

    // Interaction prompt
    if (nearbyObject) {
      ctx.save();
      ctx.font = "bold 14px 'Inter', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      const px = me.x * RENDER_SCALE - camX;
      const py = me.y * RENDER_SCALE - camY - 70;
      const label = nearbyObject.name;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(46,34,47,0.9)";
      ctx.fillRect(px - textW / 2 - 10, py - 18, textW + 20, 26);
      ctx.strokeStyle = "#50a978";
      ctx.strokeRect(px - textW / 2 - 10, py - 18, textW + 20, 26);
      ctx.fillStyle = "#5fff94";
      ctx.fillText(label, px, py);
      ctx.restore();
    }
  }

  // Standalone wildlife decor sprites are gone now that the real map paints
  // animals directly into its tile layers (Animals/Animals2/animal buildings).
  // They render as whatever static frame the tile itself is, not through this
  // engine's animator, that's a reasonable follow-up if animated wildlife on
  // the ground layer is wanted later.

  function drawObjectMarker(o, camX, camY) {
    const dx = Math.round(o.x * TILE * RENDER_SCALE - camX + (TILE * RENDER_SCALE) / 2);
    const dy = Math.round(o.y * TILE * RENDER_SCALE - camY);
    const solved = o.__solved;
    ctx.save();
    ctx.beginPath();
    ctx.arc(dx, dy - 6, 5, 0, Math.PI * 2);
    ctx.fillStyle = solved ? "#1ebc73" : o.type === "npc" ? "#cd683d" : "#905ea9";
    ctx.fill();
    ctx.strokeStyle = "#2e222f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function loop(ts) {
    if (!running) return;
    const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 0;
    lastTime = ts;
    // update()/render() throwing here used to kill the loop permanently and
    // silently, requestAnimationFrame simply never got called again, no
    // error visible anywhere, the game just stopped. Logging and continuing
    // means a bad frame degrades instead of hard-freezing the whole session.
    try {
      update(dt);
      render();
    } catch (err) {
      console.error("Overworld frame error (continuing):", err);
    }
    rafId = requestAnimationFrame(loop);
  }

  return {
    async init(opts) {
      canvas = opts.canvas;
      ctx = canvas.getContext("2d");
      socket = opts.socket;
      callbacks.onInteract = opts.onInteract || null;
      callbacks.onNearbyChange = opts.onNearbyChange || null;
      callbacks.onPlateEnter = opts.onPlateEnter || null;
      callbacks.onPlateLeave = opts.onPlateLeave || null;
      me.gender = opts.myGender || "male";
      me.color = opts.myColor || "red";
      myName = opts.myName || "";
      mySpawnIndex = typeof opts.spawnIndex === "number" ? opts.spawnIndex : null;
      currentZone = opts.startZone || "estate";

      await loadMap(opts.mapUrl);

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      if (socket) {
        socket.off("players:moved");
        socket.on("players:moved", (p) => {
          others[p.id] = { ...(others[p.id] || {}), ...p };
        });

        // Zones (interiors): players can walk into buildings independently,
        // so "others" only ever reflects who else is in the same zone.
        socket.off("zone:roster");
        socket.on("zone:roster", (data) => {
          others = {};
          (data.players || []).forEach((p) => {
            others[p.id] = { ...p };
          });
        });
        socket.off("zone:playerEntered");
        socket.on("zone:playerEntered", (p) => {
          others[p.id] = { ...(others[p.id] || {}), ...p };
        });
        socket.off("zone:playerLeft");
        socket.on("zone:playerLeft", (data) => {
          delete others[data.id];
        });
      }

      return mapData;
    },

    setRoster(players, myId) {
      players.forEach((p) => {
        if (p.id === myId) return;
        others[p.id] = {
          ...(others[p.id] || {}),
          gender: p.gender,
          color: p.color,
          name: p.name,
        };
      });
      Object.keys(others).forEach((id) => {
        if (!players.find((p) => p.id === id)) delete others[id];
      });
    },

    markSolved(objId) {
      if (!mapData) return;
      const obj = mapData.objects.find((o) => o.id === objId || o.interaction?.puzzleId === objId);
      if (obj) obj.__solved = true;
    },

    removeObject(objId) {
      if (!mapData) return;
      const idx = mapData.objects.findIndex((o) => o.id === objId);
      if (idx !== -1) mapData.objects.splice(idx, 1);
      if (nearbyObject && nearbyObject.id === objId) {
        nearbyObject = null;
        if (callbacks.onNearbyChange) callbacks.onNearbyChange(null);
      }
    },

    // Drives a door/window open or closed from a server event rather than
    // local proximity, used for pressure-plate mechanics where one player's
    // action opens a barrier for someone else. Reuses the same phase state
    // machine as the local ANIMATION TRIGGERS zones, so any door tile
    // animation already set up in Tiled just works here too, and the
    // barrier collision check in isBlockedTile() reads the same state.
    setRemoteDoorPhase(zoneId, open) {
      const s = zoneStates[zoneId] || { phase: "closed", since: 0 };
      const wantPhase = open ? "opening" : "closing";
      if (
        (open && (s.phase === "open" || s.phase === "opening")) ||
        (!open && (s.phase === "closed" || s.phase === "closing"))
      ) {
        return; // already headed the right way, don't restart the animation
      }
      s.phase = wantPhase;
      s.since = animClock;
      zoneStates[zoneId] = s;
    },

    async changeZone(zoneId, mapUrl, tileX, tileY) {
      zoneChangeInProgress = true;
      others = {}; // repopulated by the zone:roster reply from the server
      nearbyObject = null;
      await loadMap(mapUrl);
      me.x = tileX * TILE + TILE / 2;
      me.y = tileY * TILE + TILE / 2;
      currentZone = zoneId;
      // Give the next animation frame a chance to recompute nearbyObject
      // for the new position before interact can fire again, otherwise a
      // key repeat landing right on arrival can immediately trigger
      // whatever exit happens to be closest to the spawn point.
      setTimeout(() => { zoneChangeInProgress = false; }, 400);
      return mapData;
    },

    getZone() {
      return currentZone;
    },

    start() {
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    },

    triggerInteractFromButton() {
      triggerInteract();
    },

    resize() {
      if (!canvas) return;
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    },
  };
})();
