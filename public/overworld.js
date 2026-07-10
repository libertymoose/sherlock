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

  // Preset character system: species + numbered look, no live recoloring.
  // Manifests describe each sprite sheet's frame grid so one generic drawer
  // can animate all of them (players, NPCs, wildlife) the same way.
  let PRESET_MANIFEST = {};
  let NPC_MANIFEST = {};
  let WILDLIFE_MANIFEST = {};
  // Direction-row order isn't consistent across vendor sub-packs: the human
  // (swordsman) sheets and NPC sheets go down/left/right/up, but the creature
  // packs (orc/gnoll/goblin/lizardman) go down/up/left/right. Confirmed by
  // eye against each sheet, not assumed.
  const SPECIES_DIR_ROW = {
    human:     { down: 0, left: 1, right: 2, up: 3 },
    orc:       { down: 0, up: 1, left: 2, right: 3 },
    gnoll:     { down: 0, up: 1, left: 2, right: 3 },
    goblin:    { down: 0, up: 1, left: 2, right: 3 },
    lizardman: { down: 0, up: 1, left: 2, right: 3 },
  };
  const NPC_DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

  // Each species' source art fills a different fraction of its 64px cell
  // (the human sheet has a lot of headroom for weapon swings, the creature
  // sheets are much more tightly cropped), so a single flat scale made
  // players look tiny next to NPCs. These sizes are calibrated from each
  // sheet's actual non-transparent content height so on-screen character
  // height comes out consistent with the NPC sprites.
  const PLAYER_DRAW_SIZE = { human: 46, orc: 38, gnoll: 32, goblin: 44, lizardman: 34 };
  const WORLD_CHAR_SIZE = 22; // NPC on-map footprint
  const IDLE_FPS = 6;
  const WALK_FPS = 9;
  const AMBLE_FPS = 4; // slower leg-cycle for the gentle NPC wander, not a full walk pace

  let running = false;
  let rafId = null;
  let lastTime = 0;

  let me = { x: 0, y: 0, dir: "down", moving: false, species: "human", preset: 1 };
  let myName = "";
  let others = {}; // socketId -> {x,y,dir,moving,species,preset,name}
  let keys = {};
  let animTimer = 0;
  let animFrame = 0;
  let nearbyObject = null;
  let lastSentAt = 0;
  let lastSent = null;

  let npcStates = {}; // objId -> wander/animation state, rebuilt on map load
  let wildlifeTimer = 0;
  let wildlifeFrame = 0;

  let callbacks = { onInteract: null, onNearbyChange: null };

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

  let resolvedLayers = []; // precomputed at load time: [{name, cells:[{x,y,img,sx,sy}]}]

  async function loadMap(url) {
    const res = await fetch(url);
    mapData = await res.json();

    // Load every tileset image this map references, plus static props.
    const srcs = new Set(mapData.tilesets.map((t) => t.image));
    mapData.objects.forEach((o) => { if (o.sprite) srcs.add(o.sprite); });
    if (mapData.objects.some((o) => o.type === "scrap")) srcs.add("/assets/props/paper_scrap.png");
    if (mapData.objects.some((o) => o.type === "table")) srcs.add("/assets/props/evidence_table.png");
    await Promise.all([...srcs].map(loadImage));

    resolveLayers();

    // Preset/NPC/wildlife manifests + every sheet they reference. Small roster
    // (a handful of presets in play, a few NPC looks, a handful of critters),
    // so we just load everything up front rather than tracking exactly what's used.
    const [presetManifest, npcManifest, wildlifeManifest] = await Promise.all([
      loadJSON("/assets/characters/presets/manifest.json"),
      loadJSON("/assets/npcs/looks/manifest.json"),
      loadJSON("/assets/wildlife/anim/manifest.json"),
    ]);
    PRESET_MANIFEST = presetManifest;
    NPC_MANIFEST = npcManifest;
    WILDLIFE_MANIFEST = wildlifeManifest;

    const charSrcs = [];
    Object.values(PRESET_MANIFEST).forEach((species) => {
      Object.values(species).forEach((preset) => {
        charSrcs.push(preset.idle.src, preset.walk.src);
      });
    });
    charSrcs.push(...allFrameSrcs(NPC_MANIFEST));
    charSrcs.push(...allFrameSrcs(WILDLIFE_MANIFEST));
    await Promise.all(charSrcs.map(loadImage));

    me.x = mapData.spawn.x * TILE + TILE / 2;
    me.y = mapData.spawn.y * TILE + TILE / 2;

    initNpcStates();

    return mapData;
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

  function resolveLayers() {
    resolvedLayers = [];
    mapData.layers.forEach((layer) => {
      const cells = [];
      if (layer.dense) {
        const w = mapData.width;
        for (let i = 0; i < layer.data.length; i++) {
          const gid = layer.data[i];
          if (!gid) continue;
          const r = resolveGid(gid);
          if (!r) continue;
          cells.push({ x: i % w, y: Math.floor(i / w), img: getImg(r.src), sx: r.sx, sy: r.sy });
        }
      } else {
        layer.cells.forEach(([x, y, gid]) => {
          const r = resolveGid(gid);
          if (!r) return;
          cells.push({ x, y, img: getImg(r.src), sx: r.sx, sy: r.sy });
        });
      }
      resolvedLayers.push({ name: layer.name, cells });
    });
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
        pauseTimer: 3 + Math.random() * 5,
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
    return mapData.collision[ty][tx] === 1;
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

  function handleKeyDown(e) {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === " ") {
      e.preventDefault();
      triggerInteract();
    }
  }
  function handleKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
  }

  function triggerInteract() {
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
    // per sheet, so this doesn't need to know each preset's exact frame count.
    animTimer += dt;
    const fps = moving ? WALK_FPS : IDLE_FPS;
    if (animTimer > 1 / fps) {
      animTimer = 0;
      animFrame++;
    }

    findNearbyObject();
    maybeSendPosition();
    updateNpcs(dt);
  }

  const NPC_WANDER_SPEED = 7; // px/sec, a slow amble, not a walk

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
          st.pauseTimer = 5 + Math.random() * 6;
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

  function drawPreset(species, preset, worldX, worldY, camX, camY, dir, moving, frame) {
    const speciesManifest = PRESET_MANIFEST[species] || PRESET_MANIFEST.human;
    const entry = speciesManifest[String(preset)] || speciesManifest["1"];
    if (!entry) return { x: worldX * RENDER_SCALE - camX, y: worldY * RENDER_SCALE - camY };
    const state = moving ? "walk" : "idle";
    const frameSet = entry[state];
    const img = getImg(frameSet.src);
    const drawSize = PLAYER_DRAW_SIZE[species] || PLAYER_DRAW_SIZE.human;
    const dirRowMap = SPECIES_DIR_ROW[species] || SPECIES_DIR_ROW.human;
    const dirRow = dirRowMap[dir] ?? 0;
    return drawFrame(img, frameSet, dirRow, frame, worldX, worldY, camX, camY, drawSize);
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
    const camX = me.x * RENDER_SCALE - w / 2;
    const camY = me.y * RENDER_SCALE - h / 2;

    const startCol = Math.max(0, Math.floor(camX / scaledTile));
    const endCol = Math.min(mapData.width - 1, Math.ceil((camX + w) / scaledTile));
    const startRow = Math.max(0, Math.floor(camY / scaledTile));
    const endRow = Math.min(mapData.height - 1, Math.ceil((camY + h) / scaledTile));

    // Ground: draw every resolved layer bottom-to-top, each one viewport-culled.
    for (const layer of resolvedLayers) {
      for (const cell of layer.cells) {
        if (cell.x < startCol || cell.x > endCol || cell.y < startRow || cell.y > endRow) continue;
        const dx = Math.round(cell.x * scaledTile - camX);
        const dy = Math.round(cell.y * scaledTile - camY);
        ctx.drawImage(cell.img, cell.sx, cell.sy, TILE, TILE, dx, dy, scaledTile, scaledTile);
      }
    }

    // Build a draw list: characters + interactive objects, sorted by world Y (poor-man's depth)
    const drawList = [];

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
      } else {
        drawList.push({ y: o.y * TILE + TILE, draw: () => drawObjectMarker(o, camX, camY) });
      }
    });

    drawList.push({
      y: me.y,
      draw: () => {
        const pos = drawPreset(me.species, me.preset, me.x, me.y, camX, camY, me.dir, me.moving, animFrame);
        if (myName) drawNameLabel(myName, pos.x, pos.y);
      },
    });

    Object.values(others).forEach((p) => {
      drawList.push({
        y: p.y,
        draw: () => {
          const pos = drawPreset(p.species || "human", p.preset || 1, p.x, p.y, camX, camY, p.dir || "down", p.moving, animFrame);
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
      ctx.strokeStyle = "#cd683d";
      ctx.strokeRect(px - textW / 2 - 10, py - 18, textW + 20, 26);
      ctx.fillStyle = "#e6904e";
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
    update(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }

  return {
    async init(opts) {
      canvas = opts.canvas;
      ctx = canvas.getContext("2d");
      socket = opts.socket;
      callbacks.onInteract = opts.onInteract || null;
      callbacks.onNearbyChange = opts.onNearbyChange || null;
      me.species = opts.mySpecies || "human";
      me.preset = opts.myPreset || 1;
      myName = opts.myName || "";

      await loadMap(opts.mapUrl);

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      if (socket) {
        socket.off("players:moved");
        socket.on("players:moved", (p) => {
          others[p.id] = { ...(others[p.id] || {}), ...p };
        });
      }

      return mapData;
    },

    setRoster(players, myId) {
      players.forEach((p) => {
        if (p.id === myId) return;
        others[p.id] = {
          ...(others[p.id] || {}),
          species: p.species,
          preset: p.preset,
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
