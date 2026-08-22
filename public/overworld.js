// Overworld engine. A small hand-rolled top-down renderer.
// Exposed as window.Overworld. Talks to the rest of the app only through
// the callbacks passed into init(), so it doesn't know about puzzles/dialogue directly.

window.Overworld = (function () {
  const TILE = 16;
  const RENDER_SCALE = 3; // how big each 16px tile appears on screen
  const EMPTY_ANIM_LAYER = {}; // no gatedCells -> candle flame animation just loops ambiently, never gated to a door zone
  const MOVE_SPEED = 78; // px/sec in world space (bumped up for the larger map)
  const INTERACT_RADIUS = 22; // px

  // Ground rendering now comes from mapData.tilesets + mapData.layers (a real
  // Tiled export), resolved once at load time in loadMap(). See resolveLayers().

  // Tiled stores horizontal/vertical/diagonal flip as the top 3 bits of the
  // 32-bit gid. A gid with any of these set will always be way outside every
  // tileset's firstgid/lastgid range, so without stripping them first, any
  // flipped tile silently fails every tileset lookup and never renders at
  // all (not just unflipped - genuinely invisible). Using plain arithmetic
  // rather than JS's `&` bitwise operator here deliberately: bitwise ops
  // coerce to 32-bit *signed* ints, and FLIP_H_BIT alone (2147483648)
  // already exceeds INT32_MAX, so `gid & mask` silently produces the wrong
  // answer for exactly the gids this needs to handle correctly.
  const FLIP_H_BIT = 0x80000000;
  const FLIP_V_BIT = 0x40000000;
  const FLIP_D_BIT = 0x20000000;
  function stripFlip(rawGid) {
    let g = rawGid;
    let h = false, v = false;
    if (g >= FLIP_H_BIT) { h = true; g -= FLIP_H_BIT; }
    if (g >= FLIP_V_BIT) { v = true; g -= FLIP_V_BIT; }
    if (g >= FLIP_D_BIT) { g -= FLIP_D_BIT; } // diagonal flip not used by any current map, gid still needs stripping
    return { gid: g, hFlip: h, vFlip: v };
  }

  // Draws one tile-sized source region, optionally mirrored. Every call site
  // that draws a resolved map tile goes through this so flipped and
  // unflipped tiles are handled identically rather than duplicating the
  // save/scale/restore dance at each draw call.
  function drawTile(destCtx, img, sx, sy, srcSize, dx, dy, drawSize, hFlip, vFlip) {
    // A missing or broken image (failed to load, 0x0 natural size) throws
    // in some browsers when passed to drawImage rather than just drawing
    // nothing - guarding here means one bad tile reference can't take out
    // an entire baked floor segment or sorted layer along with it.
    if (!img || !img.naturalWidth) return;
    if (!hFlip && !vFlip) {
      destCtx.drawImage(img, sx, sy, srcSize, srcSize, dx, dy, drawSize, drawSize);
      return;
    }
    destCtx.save();
    destCtx.translate(dx + drawSize / 2, dy + drawSize / 2);
    destCtx.scale(hFlip ? -1 : 1, vFlip ? -1 : 1);
    destCtx.drawImage(img, sx, sy, srcSize, srcSize, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    destCtx.restore();
  }

  let canvas, ctx;
  let canvasResizeObserver = null;
  let socket = null;
  let mapData = null;
  // Timestamp of the most recent successful zone load - drives the "summon"
  // fade-in for any layer listed in mapData.fadeInLayers (see changeZone()
  // below and the draw-list loop that reads this).
  let zoneEnterTime = 0;
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
  // The player sprite sheet has real transparent headroom baked in above
  // the head (measured directly: content starts 34% of the way down each
  // 64px cell), unlike NPC sprites which crop much tighter (~9%). Left
  // uncorrected, name labels anchored to the raw sprite's top edge floated
  // noticeably farther from the player's own head than from any NPC's -
  // this is the on-screen pixel offset needed to compensate, applied only
  // to player name labels below (NPC labels are already correctly close).
  const PLAYER_HEAD_PADDING = PLAYER_DRAW_SIZE * RENDER_SCALE * 0.34;
  const WORLD_CHAR_SIZE = 22; // NPC on-map footprint
  const CRITTER_DRAW_SIZE = 24; // small ambient sprites (dungeon mice), noticeably smaller than a player/NPC. Calibrated up from an earlier 12 - the mouse art's real non-transparent content is only ~16x9px within its 32x32 canvas, so 12 rendered it almost invisible
  const CRITTER_FRAME_MS = 220; // shared clock, all critters of the same look stay in sync - fine for an ambient idle loop
  const IDLE_FPS = 3;
  const WALK_FPS = 9;
  // Idle used to just cycle all frames at a flat IDLE_FPS, which reads as
  // "the whole animation is slow." What was actually wanted: a longer pause
  // specifically on frame 0 (the neutral standing pose), with the rest of
  // the idle cycle (the small breathing/shift frames) back to a snappier
  // pace. Index 0 is the hold; the rest share a faster duration.
  const IDLE_FRAME_DURATIONS = [0.9, 0.18, 0.18, 0.18];
  function idleFrameDuration(frame) {
    return IDLE_FRAME_DURATIONS[frame % IDLE_FRAME_DURATIONS.length];
  }
  const AMBLE_FPS = 4; // slower leg-cycle for the gentle NPC wander, not a full walk pace
  const NPC_WANDER_SPEED = 3; // px/sec - deliberately slow, gentle ambient amble, not a real walk pace

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
  let candleLit = {}; // candleId -> true, driven entirely by server candle:state events
  let petHearts = []; // ephemeral {x, y, elapsed} in world px, purely cosmetic, never synced beyond the initial broadcast
  const PET_HEART_DURATION = 1200; // ms
  let insideAnimZones = new Set(); // which zones the player is inside right now, for edge detection
  let insideInteriorZone = null; // which INTERIORS rect (if any) the player is currently standing in, for edge-triggering
  let insidePlateId = null; // which pressure plate (if any) the player is currently standing on, for edge-triggering

  // Evidence/pickups already collected (by anyone), across the whole explore
  // act. loadMap() re-fetches the raw map file from scratch every time a
  // zone loads - on first entering the act, but also on every ordinary walk
  // in and out of a building - so without this, an already-collected item
  // would silently reappear the moment anyone re-entered that zone. The
  // server rejects picking it up again, but says nothing, so it would just
  // look like pickup was broken. Seeded from the server on init (covers
  // reconnects/refreshes), and added to locally the moment anything gets
  // removed (covers normal zone walking within the same session).
  let collectedIds = new Set();

  async function loadMap(url) {
    const res = await fetch(url);
    mapData = await res.json();
    mapData.objects = mapData.objects.filter((o) => !collectedIds.has(o.id));
    zoneStates = {};
    candleLit = {};
    petHearts = [];
    insideAnimZones = new Set();
    insideInteriorZone = null;
    insidePlateId = null;

    // Load every tileset image this map references, plus static props.
    const srcs = new Set(mapData.tilesets.map((t) => t.image));
    mapData.objects.forEach((o) => { if (o.sprite) srcs.add(o.sprite); });
    if (mapData.objects.some((o) => o.type === "scrap")) srcs.add("/assets/props/paper_scrap.png");
    if (mapData.objects.some((o) => o.type === "table")) srcs.add("/assets/props/evidence_table.png");
    (mapData.images || []).forEach((img) => srcs.add(img.src));
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

    initNpcStates();

    return mapData;
  }

  // Where loadMap() used to set me.x/me.y itself once its own async work was
  // done (see the fix note on loadMap above). Used by init() for the very
  // first map of an act, where there's no explicit target position, only
  // the map's own default spawn/spawnPoints.
  function applyDefaultSpawn() {
    if (mapData.spawnPoints && mapData.spawnPoints.length && mySpawnIndex != null && mySpawnIndex >= 0) {
      const idx = mySpawnIndex % mapData.spawnPoints.length;
      const sp = mapData.spawnPoints[idx];
      me.x = sp.x * TILE + TILE / 2;
      me.y = sp.y * TILE + TILE / 2;
    } else {
      me.x = mapData.spawn.x * TILE + TILE / 2;
      me.y = mapData.spawn.y * TILE + TILE / 2;
    }
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
        drawTile(bctx, c.img, c.sx, c.sy, TILE, c.x * TILE, c.y * TILE, TILE, c.hFlip, c.vFlip);
      });
      floorSegments.push({ type: "static", canvas });
      currentBatch = [];
    };

    // A single structure (a building's walls+roof+flags, a dragon's
    // body+wing+tail) is often authored across several separate "sorted"
    // layers in Tiled. Sorting each of those layers independently by its
    // own vertical extent breaks the structure apart: a roof sits higher
    // on the map than the walls beneath it, so it was getting a smaller
    // sort key and drawing UNDER those walls instead of capping them.
    // mapData.layerGroups (optional, additive - absent for every map that
    // doesn't need it) lists sets of layer names that belong to one
    // structure. Every layer in a group shares the SAME sort key (the
    // group's own lowest/bottommost extent per column, not each layer's
    // own), so the whole structure sorts as one object against the player
    // and everything else - and because layers are still processed and
    // queued in their original authored order, with a stable sort behind
    // equal keys, layers listed later in that group draw after (on top
    // of) layers listed earlier, exactly matching the hierarchy as
    // authored: whatever was meant to be the top layer stays the top
    // layer.
    const layerToGroupIndex = {};
    const groupBottomOfRun = [];
    (mapData.layerGroups || []).forEach((groupNames, gi) => {
      groupNames.forEach((name) => { layerToGroupIndex[name] = gi; });
    });
    if (mapData.layerGroups && mapData.layerGroups.length) {
      const w = mapData.width, h = mapData.height;
      mapData.layerGroups.forEach((groupNames) => {
        // One shared value per COLUMN, not per cell: the single lowest row
        // where ANY member layer of this group has a tile at all. A roof's
        // rows and the wall's rows below it usually don't overlap or even
        // touch (there's no tile-row where both a roof layer and a wall
        // layer are simultaneously non-zero) - taking a max only where two
        // layers' own runs happen to overlap would leave the roof keeping
        // its own (much higher, much smaller) sort key. What's needed is
        // simpler: whatever the bottom of the whole structure is in this
        // column, every tile belonging to this group in that column - roof
        // included - uses that one number.
        const columnBottom = new Int16Array(w).fill(-1);
        groupNames.forEach((name) => {
          const layer = mapData.layers.find((l) => l.name === name);
          if (!layer || !layer.dense) return;
          for (let x = 0; x < w; x++) {
            for (let y = h - 1; y >= 0; y--) {
              if (layer.data[y * w + x]) {
                if (y > columnBottom[x]) columnBottom[x] = y;
                break; // lowest non-zero row in this layer for this column found
              }
            }
          }
        });
        const shared = new Int16Array(w * h).fill(-1);
        for (let x = 0; x < w; x++) {
          if (columnBottom[x] < 0) continue;
          for (let y = 0; y <= columnBottom[x]; y++) shared[y * w + x] = columnBottom[x];
        }
        groupBottomOfRun.push(shared);
      });
    }

    mapData.layers.forEach((layer) => {
      try {
        const isAnimatedLayer = (gid) => mapData.animations && mapData.animations[gid];
        const layerAnimatedCells = [];
        const cells = [];

        // For "sorted" layers, tall objects (trees, bridge rails etc) are
        // often several rows of stacked tiles in the same layer. Sorting each
        // row purely by its own y let a player standing right behind a tree's
        // trunk draw in FRONT of the canopy rows above it, since those rows
        // individually had a smaller y than the player. Instead, every tile
        // in a contiguous vertical run within one column shares the run's
        // bottom row as its sort key, so the whole tree/rail segment sorts
        // as one object relative to the player, the way it visually reads.
        // A layer belonging to a layerGroup uses that group's shared extent
        // instead of computing its own (see above).
        let bottomOfRun = layerToGroupIndex[layer.name] !== undefined
          ? groupBottomOfRun[layerToGroupIndex[layer.name]]
          : null;
        if (bottomOfRun === null && layer.kind !== "floor" && layer.dense) {
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
            const rawGid = layer.data[i];
            if (!rawGid) continue;
            const { gid, hFlip, vFlip } = stripFlip(rawGid);
            const x = i % w, y = Math.floor(i / w);
            if (layer.kind === "floor" && isAnimatedLayer(gid)) {
              layerAnimatedCells.push({ x, y, gid, hFlip, vFlip, layer, index: i });
              continue;
            }
            const r = resolveGid(gid);
            if (!r) continue;
            if (layer.kind === "floor") {
              currentBatch.push({ x, y, img: getImg(r.src), sx: r.sx, sy: r.sy, hFlip, vFlip });
              continue;
            }
            const sortRow = bottomOfRun ? bottomOfRun[i] : y;
            cells.push({ x, y, sortRow, img: getImg(r.src), sx: r.sx, sy: r.sy, gid, hFlip, vFlip, layer, index: i, animated: !!isAnimatedLayer(gid) });
          }
        } else {
          layer.cells.forEach(([x, y, rawGid], idx) => {
            const { gid, hFlip, vFlip } = stripFlip(rawGid);
            if (layer.kind === "floor" && isAnimatedLayer(gid)) {
              layerAnimatedCells.push({ x, y, gid, hFlip, vFlip, layer, index: idx });
              return;
            }
            const r = resolveGid(gid);
            if (!r) return;
            if (layer.kind === "floor") {
              currentBatch.push({ x, y, img: getImg(r.src), sx: r.sx, sy: r.sy, hFlip, vFlip });
              return;
            }
            cells.push({ x, y, sortRow: y, img: getImg(r.src), sx: r.sx, sy: r.sy, gid, hFlip, vFlip, layer, index: idx, animated: !!isAnimatedLayer(gid) });
          });
        }

        if (layer.kind === "floor") {
          // This layer's static cells are already queued in currentBatch
          // above. If it also has animated cells, that's a z-order
          // boundary: bake everything queued so far (including this
          // layer's own static tiles), emit this layer's animated cells as
          // their own segment, then start a fresh batch for whatever floor
          // layer comes next.
          if (layerAnimatedCells.length) {
            flushBatch();
            floorSegments.push({ type: "animated", cells: layerAnimatedCells });
          }
        } else {
          resolvedLayers.push({ name: layer.name, cells });
        }
      } catch (err) {
        // A single layer failing to resolve (unexpected data shape, bad
        // tileset reference, whatever) used to blank the ENTIRE map: this
        // whole forEach body used to run unguarded, so one bad layer threw
        // partway through and every layer after it in iteration order
        // silently never got added to resolvedLayers/floorSegments either -
        // the canvas would show only its base fill color forever, with
        // nothing in the console-less UI to suggest why. Isolating each
        // layer means the rest of the map still renders even if one layer
        // is broken, the same principle already applied to NPC updates.
        console.error(`Layer resolve error for "${layer.name}" (continuing with other layers):`, err);
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

  function isBlockedTile(px, py, ignoreBarrierAt) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= mapData.width || ty >= mapData.height) return true;
    if (mapData.collision[ty][tx] === 1) {
      // Give a small margin of leniency on whichever edges of this tile
      // border an open (non-wall) neighbor, so a hitbox corner grazing the
      // very outer boundary of a wall isn't treated as a collision - this
      // was reading as an "invisible wall" right at the top/sides of wall
      // segments, since the technical tile edge doesn't always match where
      // the wall visually looks solid. Edges bordering another wall tile
      // get no leniency, so a continuous wall run can never develop a gap
      // at the seam between two of its own tiles.
      const EDGE_MARGIN = 4;
      const localX = px - tx * TILE;
      const localY = py - ty * TILE;
      const blockedAt = (nx, ny) =>
        nx < 0 || ny < 0 || nx >= mapData.width || ny >= mapData.height || mapData.collision[ny][nx] === 1;
      if (!blockedAt(tx - 1, ty) && localX < EDGE_MARGIN) return false;
      if (!blockedAt(tx + 1, ty) && localX >= TILE - EDGE_MARGIN) return false;
      if (!blockedAt(tx, ty - 1) && localY < EDGE_MARGIN) return false;
      if (!blockedAt(tx, ty + 1) && localY >= TILE - EDGE_MARGIN) return false;
      return true;
    }

    // Barriers are tile rects that are only passable while their linked
    // animation zone is open (or opening), used for things like the jail
    // windows: solid until a pressure plate elsewhere opens them, solid
    // again the moment that zone starts closing. Deliberately checking
    // "opening" as walkable too, not just "open": the phase only actually
    // advances to "open" as a side effect of that zone's door tile being
    // drawn on someone's screen (see currentGidFor). If the tile that
    // would trigger that happens to be off every connected player's
    // camera at that moment, it never advances and this would otherwise
    // block forever even though the plate is genuinely being held.
    if (mapData.barriers) {
      for (const b of mapData.barriers) {
        if (tx >= b.x0 && tx < b.x1 && ty >= b.y0 && ty < b.y1) {
          // A door slamming shut mid-crossing shouldn't be able to trap a
          // player with zero legal moves (every corner of their hitbox
          // landing on a now-solid tile). If they're already standing
          // inside this specific barrier's rect, it doesn't newly block
          // them - only tiles reached from genuinely outside the barrier
          // are gated. They can still finish the crossing either way.
          if (
            ignoreBarrierAt &&
            ignoreBarrierAt[0] >= b.x0 * TILE && ignoreBarrierAt[0] < b.x1 * TILE &&
            ignoreBarrierAt[1] >= b.y0 * TILE && ignoreBarrierAt[1] < b.y1 * TILE
          ) {
            continue;
          }
          const state = zoneStates[b.animZoneId];
          const openIntent = state && (state.phase === "open" || state.phase === "opening");
          if (!openIntent) return true;
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
    return pts.every(([px, py]) => !isBlockedTile(px, py, [me.x, me.y]));
  }

  let zoneChangeInProgress = false;
  // Set during the fade-to-black window between the Dungeons' natural
  // completion (last player reaches outside_sewer) and the Hook cutscene
  // actually starting - blocks movement and interaction so nobody can
  // trigger a stray object/dialogue in the sewer while the screen is
  // going black, same "why is this happening mid-fade" problem the staged
  // scene's own input freeze already solves, just for a plain explore
  // zone instead.
  let frozen = false;
  let mapReady = true; // false while a zone transition is loading - gates render(), see changeZone()
  // True whenever a dialogue/document panel is open client-side. Doesn't
  // freeze movement (frozen above already covers that for cutscenes) -
  // just stops the interact key/button from firing a brand new
  // interaction (which could re-open or restart the same dialogue) while
  // one is already up. The client tells us to route the same key press
  // to "advance the page" instead via onBlockedInteract.
  let interactBlocked = false;

  function handleKeyDown(e) {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if ((k === " " || k === "f") && !e.repeat) {
      e.preventDefault();
      if (interactBlocked) {
        if (callbacks.onBlockedInteract) callbacks.onBlockedInteract();
      } else {
        triggerInteract();
      }
    }
  }
  function handleKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
  }

  function triggerInteract() {
    if (zoneChangeInProgress || frozen || interactBlocked) return;
    if (nearbyObject && callbacks.onInteract) {
      callbacks.onInteract(nearbyObject);
    }
  }

  function findNearbyObject() {
    if (!mapData) return null;
    let closest = null;
    let closestDist = Infinity;
    for (const obj of mapData.objects) {
      if (!obj.interaction) continue; // purely decorative (e.g. ambient critters) - nothing to interact with
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

  // A staged scene (script actors like Voss + guards walking in for a
  // cutscene beat) takes over movement entirely: the local player is
  // frozen in place and normal WASD input is ignored while it plays, see
  // beginStagedScene()/updateStagedScene() below.
  let stagedScene = null;

  function updateStagedScene(dt) {
    if (!stagedScene) return;
    let allArrived = true;

    if (stagedScene.myWalk && !stagedScene.myWalk.arrived) {
      const w = stagedScene.myWalk;
      allArrived = false;
      if (w.delayRemaining > 0) {
        w.delayRemaining -= dt * 1000;
      } else {
        const target = w.points[w.index];
        const ddx = target.x - me.x;
        const ddy = target.y - me.y;
        const dist = Math.hypot(ddx, ddy);
        const step = w.speed * dt;
        if (Math.abs(ddx) > Math.abs(ddy)) me.dir = ddx > 0 ? "right" : "left";
        else if (ddy !== 0) me.dir = ddy > 0 ? "down" : "up";
        if (dist <= step) {
          me.x = target.x;
          me.y = target.y;
          w.index++;
          if (w.index >= w.points.length) {
            w.arrived = true;
            me.moving = false;
          }
        } else {
          me.x += (ddx / dist) * step;
          me.y += (ddy / dist) * step;
          me.moving = true;
        }
      }
      animTimer += dt;
      if (animTimer > 1 / WALK_FPS) {
        animTimer = 0;
        animFrame++;
      }
    }

    stagedScene.actors.forEach((a) => {
      if (a.arrived) return;
      a.delayRemaining -= dt * 1000;
      if (a.delayRemaining > 0) {
        if (a.instant) allArrived = false;
        return;
      }
      if (a.instant) {
        a.arrived = true;
        a.dir = a.restDir || a.dir;
        return;
      }
      a.elapsed += dt * 1000;
      const t = Math.min(1, a.elapsed / a.duration);
      a.x = a.fromX + (a.toX - a.fromX) * t;
      a.y = a.fromY + (a.toY - a.fromY) * t;
      a.animTimer += dt;
      if (a.animTimer > 1 / WALK_FPS) {
        a.animTimer = 0;
        a.frame++;
      }
      if (t >= 1) {
        a.arrived = true;
        a.dir = a.restDir || a.dir;
      }
      // A walking-in actor never blocks allArrived/dialogue start - they're
      // meant to enter *during* the scene (e.g. Voss walking in partway
      // through Thorne's opening line), not be waited on before anyone
      // speaks. Only actors already standing in place (instant) gate it.
    });
    if (allArrived && !stagedScene.arrivedFired) {
      stagedScene.arrivedFired = true;
      if (stagedScene.onArrived) stagedScene.onArrived();
    }
  }

  function update(dt) {
    if (petHearts.length) {
      petHearts.forEach((h) => (h.elapsed += dt * 1000));
      petHearts = petHearts.filter((h) => h.elapsed < PET_HEART_DURATION);
    }

    if (stagedScene) {
      updateStagedScene(dt);
      animClock += dt * 1000;
      // A scripted walk (see beginStagedScene's myWalkPath) drives me.x/y/
      // dir/moving itself, same fields normal WASD movement uses - so the
      // existing throttled broadcaster picks it up for free and every
      // other client sees it exactly like any other player movement.
      // Without an active walk, stay frozen in place at the mark as before.
      if (stagedScene.myWalk && !stagedScene.myWalk.arrived) {
        maybeSendPosition();
      } else {
        me.moving = false;
      }
      return;
    }

    if (frozen) {
      me.moving = false;
      return;
    }

    if (!mapReady) {
      me.moving = false;
      return;
    }

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
    const holdSec = moving ? 1 / WALK_FPS : idleFrameDuration(animFrame);
    if (animTimer > holdSec) {
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
  // Barrier-linked zones (door_cellN etc) are remote-controlled only - a
  // plate elsewhere decides when they open, via setRemoteDoorPhase. They
  // must NOT also be treated as ordinary proximity-triggered doors here:
  // that would mean simply walking near a "closed" cell door could flip it
  // open with no plate involved, and walking away from one that's
  // genuinely being held open by someone else's plate could slam it shut
  // out from under them, since this check only knows about the local
  // player's own position, not who's actually holding a plate.
  function barrierControlledZoneIds() {
    if (!mapData || !mapData.barriers) return new Set();
    return new Set(mapData.barriers.map((b) => b.animZoneId).filter(Boolean));
  }

  function checkAnimationZones() {
    if (!mapData || !mapData.animationZones) return;
    const remoteControlled = barrierControlledZoneIds();
    const tx = me.x / TILE, ty = me.y / TILE;
    const currentlyInside = new Set();
    for (const z of mapData.animationZones) {
      if (remoteControlled.has(z.id)) continue;
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
          cellId: plate.cellId,
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

      // A single NPC's wander state corrupting (or hitting a bad edge case)
      // used to throw partway through this shared forEach, which aborts
      // the whole loop immediately, every NPC after the broken one in
      // iteration order would silently never move again for the rest of
      // the session. Isolating each NPC means a broken one just stays
      // put, the rest of the party still gets to see everyone else amble
      // around normally.
      try {
        updateOneNpc(o, st, dt);
      } catch (err) {
        console.error(`NPC update error for ${o.id} (continuing):`, err);
      }
    });
  }

  function updateOneNpc(o, st, dt) {
      st.animTimer += dt;
      const holdSec = st.phase === "walking" ? 1 / AMBLE_FPS : idleFrameDuration(st.frame);
      if (st.animTimer > holdSec) {
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
  function drawFrame(img, frameSet, dirRow, frameIndex, worldX, worldY, camX, camY, drawWorldSize, posScale) {
    if (!img) return;
    posScale = posScale || RENDER_SCALE;
    const cell = frameSet.cell;
    const cols = frameSet.cols;
    const col = frameIndex % cols;
    const row = Math.min(dirRow, (frameSet.rows || 1) - 1);
    const sx = col * cell;
    const sy = row * cell;
    // Draw *size* always uses the fixed RENDER_SCALE regardless of any
    // per-map world scale override below - the player and dynamic NPCs
    // should never themselves shrink, only where they sit in the world.
    const drawSize = drawWorldSize * RENDER_SCALE;
    const dx = Math.round(worldX * posScale - camX - drawSize / 2);
    const dy = Math.round(worldY * posScale - camY - drawSize);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, cell, cell, dx, dy, drawSize, drawSize);
    ctx.restore();
    return { x: dx + drawSize / 2, y: dy };
  }

  function drawPlayer(gender, color, worldX, worldY, camX, camY, dir, moving, frame, posScale) {
    const genderManifest = BASE_MANIFEST[gender] || BASE_MANIFEST.male;
    const entry = genderManifest[color] || genderManifest.red;
    posScale = posScale || RENDER_SCALE;
    if (!entry) return { x: worldX * posScale - camX, y: worldY * posScale - camY };
    const state = moving ? "walk" : "idle";
    const frameSet = entry[state];
    const img = getImg(frameSet.src);
    const dirRow = PLAYER_DIR_ROW[dir] ?? 0;
    return drawFrame(img, frameSet, dirRow, frame, worldX, worldY, camX, camY, PLAYER_DRAW_SIZE, posScale);
  }

  function drawNpc(o, camX, camY, posScale) {
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
    return drawFrame(img, frameSet, dirRow, frame, worldX, worldY, camX, camY, WORLD_CHAR_SIZE, posScale);
  }

  function spriteScreenPos(worldSize, worldX, worldY, camX, camY, posScale) {
    posScale = posScale || RENDER_SCALE;
    return {
      x: worldX * posScale - camX,
      y: worldY * posScale - camY - worldSize * RENDER_SCALE,
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
    // Was -6, which read as floating well above the head rather than
    // sitting close to it - tightened the gap.
    const labelY = spriteTopY - 2;
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
    // Redundant safety net on top of the ResizeObserver set up in init():
    // if the backing store and the element's actual on-screen size have
    // drifted apart for any reason (an observer that didn't fire, a
    // browser that doesn't support ResizeObserver at all), catch it here
    // too, every frame, before doing any camera math with a stale w/h.
    // Cheap comparison, only actually resizes on the rare frame it's
    // actually needed.
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0 &&
        (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight)) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    const w = canvas.width;
    const h = canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#2e222f";
    ctx.fillRect(0, 0, w, h);
    if (!mapReady) {
      ctx.save();
      ctx.fillStyle = "rgba(80,169,120,0.85)";
      ctx.font = "bold 15px 'Inter', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Loading...", w / 2, h / 2);
      ctx.restore();
      return;
    }
    if (!mapData) return;

    // Optional, per-map, additive-only zoom correction. Several Act 3
    // packs (Training Ground's fighters and similar baked-tile character
    // art) were drawn at a noticeably larger native footprint than the
    // player/NPC sprite convention used everywhere else, so characters
    // read as oversized next to a normal-sized player. Rather than touch
    // the shared RENDER_SCALE constant (used by every zone in the game,
    // Act 1 and 2 included), this shrinks the world's own tile grid only
    // for maps that explicitly opt in via `tileRenderScale` in their own
    // JSON - every map without that field computes worldScale as exactly
    // RENDER_SCALE (mapData.tileRenderScale defaults to 1), so nothing
    // about any existing map's rendered output changes at all. The
    // player and dynamic "look" NPCs still draw at their normal fixed
    // pixel size regardless (drawFrame's drawSize always uses the raw
    // RENDER_SCALE constant, never worldScale) - only where things sit
    // in a shrunk world, not how big the player itself looks, changes.
    const worldScale = RENDER_SCALE * (mapData.tileRenderScale || 1);

    const scaledTile = TILE * worldScale;
    const worldW = mapData.width * scaledTile;
    const worldH = mapData.height * scaledTile;
    // Some maps have real empty padding around their actual playable area
    // (the herbalist's swamp exterior, for one - content only fills a
    // portion of the declared grid). Clamping to the full declared width/
    // height would let the camera drift into that padding at the true map
    // edges and show it as blank void. cameraBounds (optional, tile units,
    // set once from the real content's own min/max extent) lets the clamp
    // track the actual content instead - every map without it keeps
    // clamping to the full grid exactly as before.
    const cb = mapData.cameraBounds;
    const clampMinX = cb ? cb.minX * scaledTile : 0;
    const clampMinY = cb ? cb.minY * scaledTile : 0;
    const clampMaxX = cb ? (cb.maxX + 1) * scaledTile : worldW;
    const clampMaxY = cb ? (cb.maxY + 1) * scaledTile : worldH;
    const clampW = clampMaxX - clampMinX;
    const clampH = clampMaxY - clampMinY;
    // Clamp the camera to the map bounds so the void beyond the edge is never
    // visible, that void reading as "walking off the map" even when collision
    // was correctly stopping the player right at the boundary.
    let camX, camY;
    if (stagedScene && stagedScene.cameraCenter) {
      camX = stagedScene.cameraCenter.x * worldScale - w / 2;
      camY = stagedScene.cameraCenter.y * worldScale - h / 2;
    } else {
      camX = me.x * worldScale - w / 2;
      camY = me.y * worldScale - h / 2;
    }
    camX = Math.max(clampMinX, Math.min(clampMinX + clampW - w, camX));
    camY = Math.max(clampMinY, Math.min(clampMinY + clampH - h, camY));
    if (clampW < w) camX = clampMinX + (clampW - w) / 2;
    // Top-align rather than vertically center when the map is shorter
    // than the viewport. Centering left dead black space above the
    // content (the top of a room's back wall should sit flush with the
    // top of the screen), and pushed everything down far enough that
    // actors placed further down the map (Voss's walk-in mark, for
    // instance) could end up below the visible area entirely.
    if (clampH < h) camY = clampMinY;

    const startCol = Math.max(0, Math.floor(camX / scaledTile));
    const endCol = Math.min(mapData.width - 1, Math.ceil((camX + w) / scaledTile));
    const startRow = Math.max(0, Math.floor(camY / scaledTile));
    const endRow = Math.min(mapData.height - 1, Math.ceil((camY + h) / scaledTile));

    // Floor: drawn as an ordered sequence of segments (see resolveLayers),
    // preserving real layer z-order between static bakes and animated
    // tiles, instead of one static blit followed by every animated tile
    // unconditionally on top.
    const sx = camX / worldScale;
    const sy = camY / worldScale;
    const sw = w / worldScale;
    const sh = h / worldScale;
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
          drawTile(ctx, getImg(r.src), r.sx, r.sy, TILE, dx, dy, scaledTile, cell.hFlip, cell.vFlip);
        }
      }
    }

    // Build a draw list: characters + interactive objects + "tall" scenery
    // layers (buildings/statues/fences/decor), all sorted by world Y together
    // so a character standing behind a tall object is correctly hidden by it,
    // and one standing in front of it correctly draws on top.
    const drawList = [];

    // Some baked scenery is meant to feel "summoned" rather than always
    // present (the warlock's demon) - listed by name in mapData.fadeInLayers.
    // Rather than a one-shot fade-in, this now runs a full repeating cycle:
    // fade up, hold visible for a few seconds of its own idle animation,
    // fade down, sit invisible for a beat, then summon again - so leaving it
    // running never leaves it either permanently on or permanently off.
    // Purely an opacity ramp on the existing (already-animated) art, no
    // separate summon/despawn sprite frames needed - the idle blink these
    // tiles already carry keeps playing underneath it the whole time.
    const FADE_MS = 700;
    const HOLD_MS = 3500; // "a few seconds of idle blinking" before despawning
    const GONE_MS = 1000; // pause before resummoning
    const CYCLE_MS = FADE_MS + HOLD_MS + FADE_MS + GONE_MS;
    const fadeInLayerNames = mapData.fadeInLayers || [];
    const cycleT = (performance.now() - zoneEnterTime) % CYCLE_MS;
    let fadeAlpha;
    if (cycleT < FADE_MS) {
      fadeAlpha = cycleT / FADE_MS; // summoning
    } else if (cycleT < FADE_MS + HOLD_MS) {
      fadeAlpha = 1; // fully present, idle animation plays normally
    } else if (cycleT < FADE_MS + HOLD_MS + FADE_MS) {
      fadeAlpha = 1 - (cycleT - FADE_MS - HOLD_MS) / FADE_MS; // despawning
    } else {
      fadeAlpha = 0; // gone, waiting to resummon
    }

    for (const layer of resolvedLayers) {
      const layerFadesIn = fadeInLayerNames.includes(layer.name) && fadeAlpha < 1;
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
              if (layerFadesIn) {
                ctx.save();
                ctx.globalAlpha = fadeAlpha;
                drawTile(ctx, getImg(r.src), r.sx, r.sy, TILE, dx, dy, scaledTile, cell.hFlip, cell.vFlip);
                ctx.restore();
              } else {
                drawTile(ctx, getImg(r.src), r.sx, r.sy, TILE, dx, dy, scaledTile, cell.hFlip, cell.vFlip);
              }
            },
          });
        } else {
          drawList.push({
            y: cell.sortRow * TILE + TILE,
            draw: () => {
              if (layerFadesIn) {
                ctx.save();
                ctx.globalAlpha = fadeAlpha;
                drawTile(ctx, cell.img, cell.sx, cell.sy, TILE, dx, dy, scaledTile, cell.hFlip, cell.vFlip);
                ctx.restore();
              } else {
                drawTile(ctx, cell.img, cell.sx, cell.sy, TILE, dx, dy, scaledTile, cell.hFlip, cell.vFlip);
              }
            },
          });
        }
      }
    }

    mapData.objects.forEach((o) => {
      if (o.type === "npc") {
        // Cutout-based NPCs (baked directly into a tile layer, composited
        // live via the spriteCutouts loop further down) are a different
        // rendering path from ordinary look-based NPCs, but both can share
        // type "npc" on the object itself. Without this check, an NPC that's
        // meant to be cutout-only still fell through to drawNpc()'s default
        // "citizen1" fallback (since it has no npcStates/look entry of its
        // own), drawing a second, unintended character at the object's raw
        // tile position alongside the real cutout art - this is what showed
        // up as a stray extra NPC model near the warlock.
        const isCutout = (mapData.spriteCutouts || []).some((c) => c.objectId === o.id);
        if (isCutout) return;
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => {
            const pos = drawNpc(o, camX, camY, worldScale);
            if (pos) drawNameLabel(o.name, pos.x, pos.y);
          },
        });
      } else if (o.type === "scrap" && !o.__solved) {
        const pos = spriteScreenPos(16, o.x * TILE + TILE / 2, o.y * TILE + TILE / 2, camX, camY, worldScale);
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => drawStaticSprite("/assets/props/paper_scrap.png", pos.x, pos.y - 4, 16),
        });
      } else if (o.type === "table") {
        const centerX = o.x * TILE * worldScale - camX + scaledTile / 2;
        const topY = o.y * TILE * worldScale - camY - scaledTile / 2;
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => drawStaticSprite("/assets/props/evidence_table.png", centerX, topY, 32),
        });
      } else if (o.type === "candle") {
        // Lit/unlit is pure server state (candleLit), never guessed locally -
        // two players toggling the same candle would otherwise flicker out
        // of sync. Unlit is a single 16px icon; lit swaps in the taller
        // 2x3-tile animated flame-on-a-stand art, nudged by litOffsetPx to
        // line up with the pedestal beneath it (matches the small sub-pixel
        // offset Elle authored on the LIT TORCHES layer in Tiled).
        const lit = !!(o.interaction && candleLit[o.interaction.candleId]);
        const cells = lit ? o.litCells : o.unlitCells;
        const offX = lit && o.litOffsetPx ? o.litOffsetPx.x : 0;
        const offY = lit && o.litOffsetPx ? o.litOffsetPx.y : 0;
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => {
            (cells || []).forEach((c) => {
              const curGid = currentGidFor(c.gid, EMPTY_ANIM_LAYER, 0);
              const r = resolveGid(curGid);
              if (!r) return;
              const dx = Math.round((o.x + c.dx) * scaledTile - camX + offX * worldScale);
              const dy = Math.round((o.y + c.dy) * scaledTile - camY + offY * worldScale);
              drawTile(ctx, getImg(r.src), r.sx, r.sy, TILE, dx, dy, scaledTile, false, false);
            });
          },
        });
      } else if (o.type === "mouse") {
        // Purely ambient decor, no interaction - a marker floating over a
        // mouse would read as a bug, same reasoning as the "pet" case below.
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => {
            const frameSet = WILDLIFE_MANIFEST[o.look || "mouse"];
            if (!frameSet) return;
            const img = getImg(frameSet.src);
            const frameCount = frameSet.cols || 1;
            const frame = Math.floor(animClock / CRITTER_FRAME_MS) % frameCount;
            drawFrame(img, frameSet, 0, frame, o.x * TILE + TILE / 2, o.y * TILE + TILE / 2, camX, camY, CRITTER_DRAW_SIZE, worldScale);
          },
        });
      } else if (o.interaction && o.interaction.kind === "evidence_document" && !o.showMarker) {
        // These normally sit on custom ground art (a painted icon, or real
        // furniture like a cupboard or desk already part of the room), so
        // the generic marker on top would be redundant clutter. Objects
        // that don't have that - like a chest sitting on plain floor with
        // nothing else marking it - opt back in via showMarker.
      } else if (o.interaction && o.interaction.kind === "pet") {
        // Animals already read as interactive by being, well, animals -
        // a marker floating over a pig looks like a bug, not an invitation.
      } else if (
        o.interaction &&
        ["note", "locked_container", "search_twice", "locked_door"].includes(o.interaction.kind) &&
        !o.showMarker
      ) {
        // Search-and-click content (crates, chests, urns, notes) reads
        // better without a dot flagging every single one - walk up and
        // press interact like anything else in the room. Opt back in via
        // showMarker for anything that genuinely needs the extra flag.
      } else if (o.interaction && o.interaction.kind === "lever" && !o.showMarker) {
        // A lever is already obviously a lever - the generic marker on top
        // reads as a bug, not an invitation. Opt back in via showMarker.
      } else if ((mapData.spriteCutouts || []).some((c) => c.objectId === o.id) && !o.showMarker) {
        // Baked-tile NPCs (market patrons, tavern regulars, etc.) already
        // render as a visible character sprite via the cutout system -
        // same reasoning as the type==="npc" branch above, which never
        // gets a marker either. These just don't share that code path
        // since they're composited live rather than drawn from a look.
      } else {
        drawList.push({ y: o.y * TILE + TILE, draw: () => drawObjectMarker(o, camX, camY, worldScale) });
      }
    });

    (mapData.images || []).forEach((img) => {
      const img_ = getImg(img.src);
      if (!img_) return;
      const imgWorldW = img.width || img_.naturalWidth;
      const imgWorldH = img.height || img_.naturalHeight;
      // A wall decal is part of the environment (painted directly onto a
      // wall, like a tile), not a character - it should shrink and grow
      // with the world's own scale, unlike the player/NPC sprites above
      // which always stay a fixed size regardless of worldScale.
      const dx = img.x * worldScale - camX;
      const dy = img.y * worldScale - camY;
      const dw = imgWorldW * worldScale;
      const dh = imgWorldH * worldScale;
      drawList.push({
        // +32 (two tiles): a wall-mounted decal like this sits right at a
        // wall row, but the wall it's mounted on sorts by the bottom of its
        // whole vertical tile run, not just the one row - which can easily
        // be taller than this image, silently drawing the wall over it. A
        // flat decal on a wall should always read as in front of that
        // wall's surface, so this pushes it comfortably past a typical
        // 1-3 tile wall run rather than trying to match it exactly.
        y: img.y + worldH + 32,
        draw: () => {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          // Graffiti reads as scrawled onto the stone, not pasted on top of
          // it, so it should darken with the wall texture underneath rather
          // than sit as a flat opaque decal. Scoped to graffiti specifically
          // (by path) since this images array is a generic, reusable system,
          // not exclusively for graffiti.
          if (img.src.includes("/graffiti/")) ctx.globalCompositeOperation = "multiply";
          ctx.drawImage(img_, dx, dy, dw, dh);
          ctx.restore();
        },
      });
    });

    drawList.push({
      // During a staged scene, give the local player the same sort-boost
      // treatment actors can opt into (Thorne uses one here for exactly
      // this reason) - player marks in this scene sit right in the
      // furniture-heavy area around the desk, and without a boost their
      // real (low) y value loses against nearby furniture's inflated sort
      // key, silently drawing them behind it. Normal gameplay Y-sorting
      // (walking behind trees, etc) is untouched since this only applies
      // while a staged scene is active.
      y: me.y + (stagedScene ? stagedScene.playerSortBoost : 0),
      draw: () => {
        const pos = drawPlayer(me.gender, me.color, me.x, me.y, camX, camY, me.dir, me.moving, animFrame, worldScale);
        if (myName) drawNameLabel(myName, pos.x, pos.y + PLAYER_HEAD_PADDING);
      },
    });

    Object.values(others).forEach((p) => {
      drawList.push({
        y: p.y + (stagedScene ? stagedScene.playerSortBoost : 0),
        draw: () => {
          const pos = drawPlayer(p.gender || "male", p.color || "red", p.x, p.y, camX, camY, p.dir || "down", p.moving, animFrame, worldScale);
          if (p.name) drawNameLabel(p.name, pos.x, pos.y + PLAYER_HEAD_PADDING);
        },
      });
    });

    if (stagedScene) {
      stagedScene.actors.forEach((a) => {
        drawList.push({
          y: a.y + (a.sortBoost || 0),
          draw: () => {
            const look = NPC_MANIFEST[a.look];
            if (!look) return;
            const moving = a.delayRemaining <= 0 && !a.arrived;
            const frameSet = moving ? look.walk : look.idle;
            const img = getImg(frameSet.src);
            const dirRow = NPC_DIR_ROW[a.dir] ?? 0;
            const pos = drawFrame(img, frameSet, dirRow, moving ? a.frame : 0, a.x, a.y, camX, camY, WORLD_CHAR_SIZE, worldScale);
            if (pos) drawNameLabel(a.name, pos.x, pos.y);
          },
        });
      });
    }

    // Sprite cutouts: characters that were baked directly into a tile layer
    // (by design - they need to sit at an exact, hand-placed position
    // relative to other baked props like mannequins, weapon racks, etc,
    // which a normal floating NPC object can't guarantee). Their own tiles
    // were zeroed out of that layer's data when the cutout was authored, so
    // the normal tile-drawing pass above already skips them cleanly - this
    // is the only place they get drawn. Composited live, every frame, using
    // the exact same animated-tile lookup (currentGidFor) that drives every
    // other animation in the game, so a sparring swing or a wave keeps
    // playing in sync with everything else rather than being frozen at
    // whatever frame happened to be baked in. Drawn at WORLD_CHAR_SIZE,
    // matching every other NPC, anchored at the character's own feet
    // (contentBottom) so shrinking them never moves where they're standing.
    (mapData.spriteCutouts || []).forEach((cutout) => {
      const layer = mapData.layers.find((l) => l.name === cutout.layer);
      if (!layer) return;
      // Every other entry in this draw list sorts by a tile-quantized key
      // (row*TILE + TILE), never a raw pixel value - furniture, NPCs, the
      // player, all of it. cutout.anchorY is the alpha-trimmed pixel bottom
      // of the character's own art, which is almost always a few pixels
      // less than that quantized value for whatever tile row it's standing
      // in (art rarely fills a tile to its literal last pixel row). That
      // mismatch meant a cutout NPC standing in the same row as a table or
      // rack would systematically sort as "further back" than the
      // furniture and draw underneath it - reading as the NPC being
      // shrunk down to a sliver, when it was actually just mostly hidden
      // behind the furniture. Sort key has to use the same tile-quantized
      // convention as everything else; anchorY itself still drives the
      // actual draw position below, unaffected.
      //
      // Still not enough on its own for a character seated AT a table:
      // the table's own furniture tiles (its base/legs) often run a row or
      // two further down the same columns the character is standing in,
      // giving the table a genuinely larger bottom-of-run sort key even
      // after the fix above - the table would still draw after (on top
      // of) the character it belongs to. A character always reads as "at"
      // whatever furniture directly shares their own footprint, so their
      // sort key is bumped up to match the tallest bottom-of-run among any
      // "sorted" furniture layer occupying the same columns, within a
      // couple of rows of where they're already standing - close enough to
      // be the table they're sitting at, not some unrelated far-off prop
      // that happens to share a column.
      let sortTileY = Math.max(...cutout.tiles.map((t) => t.y));
      const cutoutCols = new Set(cutout.tiles.map((t) => t.x));
      mapData.layers.forEach((l) => {
        if (l.kind !== "sorted" || !l.dense || l === layer) return;
        cutoutCols.forEach((x) => {
          for (let y = sortTileY + 2; y >= sortTileY - 1; y--) {
            if (y < 0 || y >= mapData.height) continue;
            if (l.data[y * mapData.width + x]) {
              // walk to the bottom of this run, same convention as the
              // main floor/furniture sort-key pass above
              let bottom = y;
              while (bottom + 1 < mapData.height && l.data[(bottom + 1) * mapData.width + x]) bottom++;
              if (bottom > sortTileY) sortTileY = bottom;
              break;
            }
          }
        });
      });
      drawList.push({
        y: sortTileY * TILE + TILE,
        draw: () => {
          const buf = document.createElement("canvas");
          buf.width = cutout.contentW;
          buf.height = cutout.contentH;
          const bctx = buf.getContext("2d");
          bctx.imageSmoothingEnabled = false;
          // Tiles are stored with their own absolute map position; draw each
          // relative to the cutout's own content top-left so the buffer is
          // exactly the tight character crop, not the full (padded) tile block.
          const originPxX = Math.min(...cutout.tiles.map((t) => t.x)) * TILE;
          const originPxY = Math.min(...cutout.tiles.map((t) => t.y)) * TILE;
          const contentLeft = cutout.anchorX - cutout.contentW / 2 - originPxX;
          const contentTop = cutout.anchorY - cutout.contentH - originPxY;
          cutout.tiles.forEach((t) => {
            const curGid = currentGidFor(t.gid, layer, t.index);
            const r = resolveGid(curGid);
            if (!r) return;
            const img = getImg(r.src);
            if (!img) return;
            const dx = t.x * TILE - originPxX - contentLeft;
            const dy = t.y * TILE - originPxY - contentTop;
            // A handful of real NPCs (e.g. the tavern's seated pair) have a
            // genuine Tiled horizontal-flip bit on their tiles - one of a
            // pair authored facing the other, not a default-orientation
            // sprite. t.flip carries that forward (see the map-build
            // tooling that produces this data); mirror just this tile
            // within the buffer rather than dropping the flip entirely.
            if (t.flip) {
              bctx.save();
              bctx.translate(dx + TILE, dy);
              bctx.scale(-1, 1);
              bctx.drawImage(img, r.sx, r.sy, TILE, TILE, 0, 0, TILE, TILE);
              bctx.restore();
            } else {
              bctx.drawImage(img, r.sx, r.sy, TILE, TILE, dx, dy, TILE, TILE);
            }
          });
          // Fixed draw size (WORLD_CHAR_SIZE), matching every other NPC -
          // never shrinks/grows with worldScale beyond the normal player/NPC
          // convention, only its position does.
          const aspect = cutout.contentW / cutout.contentH;
          const drawH = WORLD_CHAR_SIZE * RENDER_SCALE * (cutout.drawScale || 1);
          const drawW = drawH * aspect;
          const dx = Math.round(cutout.anchorX * worldScale - camX - drawW / 2);
          const dy = Math.round(cutout.anchorY * worldScale - camY - drawH);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(buf, dx, dy, drawW, drawH);
          ctx.restore();

          // NPCs authored as cutouts (like the Head Warlock) still want
          // their name tag - this was previously only happening by
          // accident, piggybacking on a stray fallback sprite draw
          // elsewhere that has since been removed. Position it the same
          // way drawNameLabel is used everywhere else: centered above the
          // character's own drawn art, not the object's raw tile position.
          const cutoutObj = mapData.objects.find((o) => o.id === cutout.objectId);
          if (cutoutObj && cutoutObj.type === "npc" && cutoutObj.name) {
            drawNameLabel(cutoutObj.name, dx + drawW / 2, dy);
          }
        },
      });
    });

    drawList.sort((a, b) => a.y - b.y);
    // Each entry isolated on purpose: without this, one item throwing (a
    // broken NPC sprite, most plausibly) aborts the whole forEach immediately,
    // and everything sorted after it, potentially other players, even our
    // own character, silently never gets drawn again, every single frame,
    // looking exactly like the game froze even though nothing crashed the tab.
    drawList.forEach((item) => {
      try {
        item.draw();
      } catch (err) {
        console.error("Draw error for one item (continuing):", err);
      }
    });

    if (petHearts.length) {
      petHearts.forEach((h) => {
        const t = h.elapsed / PET_HEART_DURATION;
        const riseUp = t * 24 * RENDER_SCALE;
        const hx = h.x * worldScale - camX;
        const hy = h.y * worldScale - camY - 30 * RENDER_SCALE - riseUp;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.font = `bold ${18 * (1 + t * 0.3)}px 'Inter', 'Segoe UI', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff4d6d";
        ctx.fillText("\u2665", hx, hy);
        ctx.restore();
      });
    }

    // Interaction prompt
    if (nearbyObject) {
      ctx.save();
      ctx.font = "bold 14px 'Inter', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      const px = me.x * worldScale - camX;
      const py = me.y * worldScale - camY - 70;
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

    // Small debug readout: the player's current tile coordinate, always
    // visible in the corner. Exists specifically so a bug screenshot comes
    // with exact coordinates already in it - collision/tile reports were
    // previously impossible to pin down precisely from a screenshot alone,
    // this makes every future one immediately actionable.
    ctx.save();
    const tileX = Math.floor(me.x / TILE);
    const tileY = Math.floor(me.y / TILE);
    const dbgLabel = `tile ${tileX}, ${tileY}`;
    ctx.font = "11px 'Inter', 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const dbgW = ctx.measureText(dbgLabel).width;
    ctx.fillStyle = "rgba(46,34,47,0.75)";
    ctx.fillRect(6, 6, dbgW + 10, 16);
    ctx.fillStyle = "rgba(95,255,148,0.9)";
    ctx.fillText(dbgLabel, 11, 8);
    ctx.restore();
  }

  // Standalone wildlife decor sprites are gone now that the real map paints
  // animals directly into its tile layers (Animals/Animals2/animal buildings).
  // They render as whatever static frame the tile itself is, not through this
  // engine's animator, that's a reasonable follow-up if animated wildlife on
  // the ground layer is wanted later.

  function drawObjectMarker(o, camX, camY, posScale) {
    posScale = posScale || RENDER_SCALE;
    const dx = Math.round(o.x * TILE * posScale - camX + (TILE * posScale) / 2);
    const dy = Math.round(o.y * TILE * posScale - camY);
    const solved = o.__solved;
    ctx.save();
    ctx.beginPath();
    ctx.arc(dx, dy - 6, 5, 0, Math.PI * 2);
    ctx.fillStyle = solved ? "#1ebc73" : "#2dd4bf";
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
    // Separate try/catches on purpose: these used to share one block, so a
    // repeating crash in update() (thrown fresh every single frame) meant
    // render() never ran either, forever, the canvas would look frozen
    // solid even though nothing had crashed the tab. Now a broken update()
    // still lets the screen keep painting whatever state already exists.
    try {
      update(dt);
    } catch (err) {
      console.error("Overworld update error (continuing):", err);
    }
    try {
      render();
    } catch (err) {
      console.error("Overworld render error (continuing):", err);
    }
    rafId = requestAnimationFrame(loop);
  }

  // A one-shot, non-interactive composite for the Finale: a static crop of
  // a map's own tiles as backdrop, with the party (their real gender/color
  // customization) on one side, the suspects (their real estate-map looks)
  // on the other, and Hook/Thorne centered between both groups. Nothing
  // here moves or animates once drawn - deliberately not the live game
  // loop, a single paint pass onto its own canvas. Kept fully independent
  // of the module's live `mapData`/`resolvedLayers` state (its own local
  // map fetch, its own local tile resolver) so it can never interfere with
  // whatever the main overworld was last doing, and so it works even if
  // Overworld.init() was never called yet this session.
  async function renderFinaleCast(canvasEl, opts) {
    const localCtx = canvasEl.getContext("2d");
    localCtx.imageSmoothingEnabled = false;

    if (!Object.keys(BASE_MANIFEST).length || !Object.keys(NPC_MANIFEST).length) {
      const [baseManifest, npcManifest] = await Promise.all([
        loadJSON("/assets/characters/base/manifest.json"),
        loadJSON("/assets/npcs/looks/manifest.json"),
      ]);
      BASE_MANIFEST = baseManifest;
      NPC_MANIFEST = npcManifest;
    }
    const charSrcs = [];
    Object.values(BASE_MANIFEST).forEach((genderSet) => {
      Object.values(genderSet).forEach((entry) => charSrcs.push(entry.idle.src));
    });
    charSrcs.push(...allFrameSrcs(NPC_MANIFEST));
    await Promise.all(charSrcs.map(loadImage));

    const finaleMapData = await loadJSON(opts.mapUrl);
    const tilesetSrcs = new Set(finaleMapData.tilesets.map((t) => t.image));
    await Promise.all([...tilesetSrcs].map(loadImage));

    const crop = opts.crop;
    canvasEl.width = crop.w * TILE * RENDER_SCALE;
    canvasEl.height = crop.h * TILE * RENDER_SCALE;

    function localResolveGid(gid) {
      for (const ts of finaleMapData.tilesets) {
        if (gid >= ts.firstgid && gid <= ts.lastgid) {
          const local = gid - ts.firstgid;
          return {
            src: ts.image,
            sx: (local % ts.columns) * ts.tilewidth,
            sy: Math.floor(local / ts.columns) * ts.tileheight,
          };
        }
      }
      return null;
    }

    // Flat blit, authored layer order, cropped to the window. No animation
    // and no Y-sort math needed - nothing here ever moves, so draw order
    // only has to match the map's own layer stack, not any live occupant.
    finaleMapData.layers.forEach((layer) => {
      if (!layer.dense || !layer.data) return;
      for (let ty = 0; ty < crop.h; ty++) {
        for (let tx = 0; tx < crop.w; tx++) {
          const mapX = crop.x + tx;
          const mapY = crop.y + ty;
          if (mapX < 0 || mapY < 0 || mapX >= finaleMapData.width || mapY >= finaleMapData.height) continue;
          const rawGid = layer.data[mapY * finaleMapData.width + mapX];
          if (!rawGid) continue;
          const { gid, hFlip, vFlip } = stripFlip(rawGid);
          const r = localResolveGid(gid);
          if (!r) continue;
          const img = getImg(r.src);
          if (!img) continue;
          const dx = tx * TILE * RENDER_SCALE;
          const dy = ty * TILE * RENDER_SCALE;
          const size = TILE * RENDER_SCALE;
          localCtx.save();
          if (hFlip || vFlip) {
            localCtx.translate(dx + (hFlip ? size : 0), dy + (vFlip ? size : 0));
            localCtx.scale(hFlip ? -1 : 1, vFlip ? -1 : 1);
            localCtx.drawImage(img, r.sx, r.sy, TILE, TILE, 0, 0, size, size);
          } else {
            localCtx.drawImage(img, r.sx, r.sy, TILE, TILE, dx, dy, size, size);
          }
          localCtx.restore();
        }
      }
    });

    function drawStaticActor(screenX, screenY, drawSize, frameSet, dirRow) {
      const img = getImg(frameSet.src);
      if (!img) return;
      const cell = frameSet.cell;
      const sy = Math.min(dirRow, (frameSet.rows || 1) - 1) * cell;
      const size = drawSize * RENDER_SCALE;
      localCtx.save();
      localCtx.imageSmoothingEnabled = false;
      localCtx.drawImage(img, 0, sy, cell, cell, screenX - size / 2, screenY - size, size, size);
      localCtx.restore();
    }

    function drawPlayerActor(screenX, screenY, gender, color) {
      const genderManifest = BASE_MANIFEST[gender] || BASE_MANIFEST.male;
      const entry = genderManifest[color] || genderManifest.red;
      if (!entry) return;
      drawStaticActor(screenX, screenY, PLAYER_DRAW_SIZE, entry.idle, PLAYER_DIR_ROW.down);
    }

    function drawNpcActor(screenX, screenY, look) {
      const entry = NPC_MANIFEST[look];
      if (!entry) return;
      drawStaticActor(screenX, screenY, WORLD_CHAR_SIZE, entry.idle, NPC_DIR_ROW.down);
    }

    // Players on the left third, suspects on the right third, Hook and
    // Thorne centered between both groups and apart from them - matches
    // the confirmed layout: neither ally is grouped with either side.
    const baselineY = canvasEl.height * 0.78;
    const players = opts.players || [];
    const leftStartX = canvasEl.width * 0.06;
    const leftEndX = canvasEl.width * 0.32;
    players.forEach((p, i) => {
      const t = players.length > 1 ? i / (players.length - 1) : 0.5;
      drawPlayerActor(leftStartX + (leftEndX - leftStartX) * t, baselineY, p.gender, p.color);
    });

    const suspects = opts.suspects || [];
    const rightStartX = canvasEl.width * 0.68;
    const rightEndX = canvasEl.width * 0.94;
    suspects.forEach((s, i) => {
      const t = suspects.length > 1 ? i / (suspects.length - 1) : 0.5;
      drawNpcActor(rightStartX + (rightEndX - rightStartX) * t, baselineY, s.look);
    });

    // Hook and Thorne, centered and clearly apart from both groups - not
    // just a narrow gap either side of the exact middle.
    if (opts.hook) drawNpcActor(canvasEl.width * 0.41, baselineY, opts.hook.look);
    if (opts.thorne) drawNpcActor(canvasEl.width * 0.59, baselineY, opts.thorne.look);
  }

  return {
    renderFinaleCast,
    async init(opts) {
      canvas = opts.canvas;
      ctx = canvas.getContext("2d");
      // Belt-and-braces fix for a real class of bug: manual resize() calls
      // at specific lifecycle points (right after unhiding the explore
      // frame, entering a staged scene, etc) can run before the browser
      // has actually settled on a final layout for the canvas's
      // container - a fade-in, a font swap, or just paint timing can all
      // shift the container's real height a frame or two later, after
      // which the backing store is stuck at a stale size until the next
      // explicit resize() call happens to fire. A ResizeObserver removes
      // the guesswork: the backing store gets kept in sync with the
      // canvas's actual rendered CSS size continuously, for as long as
      // this instance exists, regardless of what triggered the layout
      // change. Existing manual resize() calls elsewhere are harmless
      // now (redundant, not wrong) and left in place rather than ripped
      // out, since removing them isn't necessary to fix this.
      if (typeof ResizeObserver !== "undefined") {
        if (canvasResizeObserver) canvasResizeObserver.disconnect();
        canvasResizeObserver = new ResizeObserver(() => {
          if (!canvas) return;
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
            canvas.width = w;
            canvas.height = h;
          }
        });
        canvasResizeObserver.observe(canvas);
      }
      socket = opts.socket;
      frozen = false; // fresh zone load always starts unfrozen, regardless of how the previous zone left off
      callbacks.onInteract = opts.onInteract || null;
      callbacks.onNearbyChange = opts.onNearbyChange || null;
      callbacks.onPlateEnter = opts.onPlateEnter || null;
      callbacks.onPlateLeave = opts.onPlateLeave || null;
      me.gender = opts.myGender || "male";
      me.color = opts.myColor || "red";
      myName = opts.myName || "";
      mySpawnIndex = typeof opts.spawnIndex === "number" ? opts.spawnIndex : null;
      currentZone = opts.startZone || "estate";
      collectedIds = new Set(opts.collectedIds || []);

      await loadMap(opts.mapUrl);
      applyDefaultSpawn();

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

    // Takes over the scene for a scripted beat (Voss + guards walking in
    // for "Means and Opportunity, Interrupted"): freezes the local player
    // at a fixed mark instead of letting them walk around, and animates
    // each entry in `actors` walking from its `from` tile to its `to` tile
    // over `duration` ms (staggered by `delayMs` so they don't all arrive
    // in lockstep). Calls onArrived() once every actor has stopped moving.
    // Positions are set locally only; the caller is responsible for
    // broadcasting the local player's mark via the normal player:move
    // event so other clients see them standing in the right spot too.
    beginStagedScene({ myMark, myWalkPath, actors, onArrived, cameraCenter, playerSortBoost }) {
      if (myMark) {
        me.x = myMark[0] * TILE + TILE / 2;
        me.y = myMark[1] * TILE + TILE / 2;
        me.dir = "up";
        me.moving = false;
      }

      let myWalk = null;
      if (myWalkPath && myWalkPath.waypoints && myWalkPath.waypoints.length) {
        // Starting tile is the player's own current position (their mark,
        // or wherever they already are) - waypoints after that are the
        // route. speedTilesPerSec and startDelayMs are per-scene tuning;
        // startDelayMs is what actually staggers the party into a single-
        // file line, since every player independently runs this same
        // deterministic path from the same act data.
        myWalk = {
          points: myWalkPath.waypoints.map((wp) => ({ x: wp[0] * TILE + TILE / 2, y: wp[1] * TILE + TILE / 2 })),
          index: 0,
          speed: (myWalkPath.speedTilesPerSec || 2.2) * TILE,
          delayRemaining: myWalkPath.startDelayMs || 0,
          arrived: false,
        };
      }

      stagedScene = {
        arrivedFired: false,
        onArrived,
        myWalk,
        // Per-scene, not a blanket constant: the manor cutscene's marks
        // sit right in a furniture-heavy area around the desk, where the
        // player's real (low) y value loses against nearby furniture's
        // inflated sort key without a boost - but that boost was tuned
        // for THAT specific layout, and blindly applying it to every
        // staged scene pushed the player behind terrain they shouldn't
        // be behind in scenes with a completely different layout (the
        // sewer exit, notably - the player was rendering, just sorted
        // behind something it had no business losing to). Defaults to 0,
        // so a scene with no reason to need this is unaffected.
        playerSortBoost: playerSortBoost || 0,
        // Cutscenes are composed, not followed - the camera has to show the
        // whole tableau (actors, desk, doorway) regardless of where any one
        // player's mark happens to sit, rather than the normal follow-camera
        // centering on whichever tile the local player is standing on.
        cameraCenter: cameraCenter
          ? { x: cameraCenter[0] * TILE + TILE / 2, y: cameraCenter[1] * TILE + TILE / 2 }
          : null,
        actors: (actors || []).map((a, i) => {
          const fromX = a.from[0] * TILE + TILE / 2;
          const fromY = a.from[1] * TILE + TILE / 2;
          const toX = a.to[0] * TILE + TILE / 2;
          const toY = a.to[1] * TILE + TILE / 2;
          const ddx = toX - fromX;
          const ddy = toY - fromY;
          let dir = a.facing || "down";
          if (Math.abs(ddx) > Math.abs(ddy)) dir = ddx > 0 ? "right" : "left";
          else if (ddy !== 0) dir = ddy > 0 ? "down" : "up";
          return {
            id: a.id,
            look: a.look || "citizen1",
            name: a.name || "",
            fromX, fromY, toX, toY,
            x: fromX,
            y: fromY,
            dir,
            restDir: a.facing || "down",
            frame: 0,
            animTimer: 0,
            elapsed: 0,
            duration: a.durationMs || 1600,
            delayRemaining: (a.delayMs != null ? a.delayMs : i * 350) + 500,
            arrived: false,
            // from === to (no real distance to cover): without this, the
            // actor still ran the full walk-cycle animation for the whole
            // duration before ever reaching the time-based "arrived" check,
            // which reads as visibly shuffling in place instead of standing
            // still the moment their entrance delay ends.
            instant: ddx === 0 && ddy === 0,
            // Nudges this actor's draw-sort key without moving them. Needed
            // when they stand at the same row as furniture that's part of a
            // taller connected run (a bookshelf, say) - that whole run sorts
            // using its own bottom row, which can outrank an actor standing
            // at a row that's visually in front of/beside it, covering them
            // almost entirely. Tune per-scene in story.json, not guessed here.
            sortBoost: a.sortBoost || 0,
          };
        }),
      };
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
      collectedIds.add(objId);
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

    // Candle lit/unlit state, pushed from the server on every toggle (and
    // once on zone entry so a rejoining or late player sees the current
    // board, not an assumed-blank one).
    setCandleState(lit) {
      candleLit = lit || {};
    },

    // x,y are tile coordinates, matching how map objects are positioned
    // elsewhere - converted to world px here so callers don't need to know
    // TILE's value.
    showPetHeart(x, y) {
      if (typeof x !== "number" || typeof y !== "number") return;
      petHearts.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, elapsed: 0 });
    },

    async changeZone(zoneId, mapUrl, tileX, tileY) {
      zoneChangeInProgress = true;
      others = {}; // repopulated by the zone:roster reply from the server
      nearbyObject = null;
      mapReady = false;
      // Set the target position immediately, before any of the async work
      // below even starts. Previously this only happened after loadMap
      // fully resolved (map JSON fetch, every tileset/character image
      // loaded), which could take a real amount of time on a first visit
      // to a zone. The render loop never pauses for any of that, so for
      // the whole gap it was drawing the just-swapped-in new map centered
      // on wherever the player physically was in the *previous* zone -
      // the "camera doesn't know where the player is" flash on zone entry.
      // Combined with mapReady below (which skips drawing entirely until
      // this whole transition is done), the camera is simply never wrong,
      // rather than wrong-but-hidden.
      me.x = tileX * TILE + TILE / 2;
      me.y = tileY * TILE + TILE / 2;
      try {
        await loadMap(mapUrl);
        currentZone = zoneId;
        zoneEnterTime = performance.now();
      } catch (err) {
        console.error(`changeZone(${zoneId}) failed:`, err);
        throw err;
      } finally {
        mapReady = true;
        // Whatever happened above, this always has to clear - otherwise a
        // failed zone load doesn't just leave a blank map, it leaves the
        // player unable to press interact ever again for the rest of the
        // session, since triggerInteract() checks this flag first.
        setTimeout(() => { zoneChangeInProgress = false; }, 400);
      }
      return mapData;
    },

    getZone() {
      return currentZone;
    },

    // Static (resting-frame) draw instructions for a spriteCutout NPC, keyed
    // by the same objectId used in the map's own objects array. Used to give
    // baked-tile Act 3 NPCs (the market crowd, tavern patrons, etc) a real
    // dialogue portrait instead of falling back to no-portrait "compact"
    // mode just because they have no walk-sheet `look` and no illustrated
    // `portrait` - see setVnPortrait/drawCutoutPortrait in client.js.
    getSpriteCutoutFrame(objectId) {
      if (!mapData) return null;
      const cutout = (mapData.spriteCutouts || []).find((c) => c.objectId === objectId);
      if (!cutout || !cutout.tiles || !cutout.tiles.length) return null;
      const originPxX = Math.min(...cutout.tiles.map((t) => t.x)) * TILE;
      const originPxY = Math.min(...cutout.tiles.map((t) => t.y)) * TILE;
      const contentLeft = cutout.anchorX - cutout.contentW / 2 - originPxX;
      const contentTop = cutout.anchorY - cutout.contentH - originPxY;
      const draws = [];
      cutout.tiles.forEach((t) => {
        const { gid, hFlip, vFlip } = stripFlip(t.gid);
        const r = resolveGid(gid);
        if (!r) return;
        draws.push({
          src: r.src, sx: r.sx, sy: r.sy, size: TILE,
          dx: t.x * TILE - originPxX - contentLeft,
          dy: t.y * TILE - originPxY - contentTop,
          hFlip, vFlip,
        });
      });
      if (!draws.length) return null;
      return { draws, contentW: cutout.contentW, contentH: cutout.contentH };
    },

    start() {
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      stagedScene = null;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    },

    triggerInteractFromButton() {
      // Same gating as the keyboard path - the on-screen button shouldn't
      // be able to re-fire an interaction while a dialogue is already
      // open either, it should advance the page instead.
      if (interactBlocked) {
        if (callbacks.onBlockedInteract) callbacks.onBlockedInteract();
      } else {
        triggerInteract();
      }
    },

    setInteractBlocked(v) {
      interactBlocked = !!v;
    },

    freeze() {
      frozen = true;
    },

    unfreeze() {
      frozen = false;
    },

    resize() {
      if (!canvas) return;
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    },
  };
})();
