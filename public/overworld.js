// Overworld engine. A small hand-rolled top-down renderer.
// Exposed as window.Overworld. Talks to the rest of the app only through
// the callbacks passed into init(), so it doesn't know about puzzles/dialogue directly.

window.Overworld = (function () {
  const TILE = 16;
  const RENDER_SCALE = 3; // how big each 16px tile appears on screen
  const MOVE_SPEED = 78; // px/sec in world space (bumped up for the larger map)
  const INTERACT_RADIUS = 22; // px

  const TILE_SRC = {
    grass: "/assets/tiles/Grass_Middle.png",
    path: "/assets/tiles/Path_Middle.png",
    water: "/assets/tiles/Water_Middle.png",
  };

  let canvas, ctx;
  let socket = null;
  let mapData = null;
  let images = {};
  let charSprites = { short: null, tall: null }; // walk-strip images
  const CELL_SIZE = { short: 24, tall: 32, npcsprite: 16 };
  let running = false;
  let rafId = null;
  let lastTime = 0;

  let me = { x: 0, y: 0, dir: "down", moving: false, height: "short", color: "#f9c22b" };
  let myName = "";
  let others = {}; // socketId -> {x,y,dir,moving,height,color,name}
  let keys = {};
  let animTimer = 0;
  let animFrame = 0;
  let nearbyObject = null;
  let lastSentAt = 0;
  let lastSent = null;

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

  async function loadMap(url) {
    const res = await fetch(url);
    mapData = await res.json();

    const srcs = new Set(Object.values(TILE_SRC));
    mapData.decor.forEach((d) => srcs.add(d.src));
    mapData.objects.forEach((o) => { if (o.sprite) srcs.add(o.sprite); });
    await Promise.all([...srcs].map(loadImage));
    await Promise.all([
      loadImage("/assets/characters/walk-short.png").then((img) => (charSprites.short = img)),
      loadImage("/assets/characters/walk-tall.png").then((img) => (charSprites.tall = img)),
    ]);

    me.x = mapData.spawn.x * TILE + TILE / 2;
    me.y = mapData.spawn.y * TILE + TILE / 2;
    return mapData;
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
    if (k === "e" || k === "f" || k === " ") {
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
      const ox = obj.x * TILE + TILE / 2;
      const oy = obj.y * TILE + TILE / 2;
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

    if (moving) {
      animTimer += dt;
      if (animTimer > 0.12) {
        animTimer = 0;
        animFrame = (animFrame + 1) % 4;
      }
    } else {
      animFrame = 0;
    }

    findNearbyObject();
    maybeSendPosition();
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

  function drawCharSprite(sprite, height, color, x, y, dir, frame) {
    if (!sprite) return;
    const cell = CELL_SIZE[height] || 24;
    let row = 0; // down
    let flip = false;
    if (dir === "up") row = 2;
    else if (dir === "left") {
      row = 1;
      flip = true;
    } else if (dir === "right") {
      row = 1;
    }
    const sx = frame * cell;
    const sy = row * cell;

    // Draw base sprite tinted via an offscreen buffer, cached per color+height+row+frame would be
    // overkill here; instead tint on the fly with a small temp canvas.
    const tmp = document.createElement("canvas");
    tmp.width = cell;
    tmp.height = cell;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(sprite, sx, sy, cell, cell, 0, 0, cell, cell);
    tctx.globalCompositeOperation = "multiply";
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, cell, cell);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(sprite, sx, sy, cell, cell, 0, 0, cell, cell);

    const drawSize = cell * RENDER_SCALE;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(tmp, -drawSize / 2, 0, drawSize, drawSize);
    } else {
      ctx.drawImage(tmp, x - drawSize / 2, y, drawSize, drawSize);
    }
    ctx.restore();
  }

  function spriteScreenPos(height, worldX, worldY, camX, camY) {
    const cell = CELL_SIZE[height] || 24;
    return {
      x: worldX * RENDER_SCALE - camX,
      y: worldY * RENDER_SCALE - camY - cell * RENDER_SCALE + 8 * RENDER_SCALE,
    };
  }

  function drawNameLabel(name, centerX, spriteTopY) {
    if (!name) return;
    ctx.save();
    ctx.font = "10px 'Press Start 2P', monospace";
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

    // Ground
    for (let ty = startRow; ty <= endRow; ty++) {
      for (let tx = startCol; tx <= endCol; tx++) {
        const key = mapData.ground[ty][tx];
        const img = getImg(TILE_SRC[key]);
        const dx = Math.round(tx * scaledTile - camX);
        const dy = Math.round(ty * scaledTile - camY);
        if (img) {
          ctx.drawImage(img, 0, 0, TILE, TILE, dx, dy, scaledTile, scaledTile);
        }
      }
    }

    // Build a draw list: decor + characters, sorted by their world Y (poor-man's depth)
    const drawList = [];

    mapData.decor.forEach((d) => {
      drawList.push({ y: (d.y + d.h) * TILE, draw: () => drawDecor(d, camX, camY) });
    });

    mapData.objects.forEach((o) => {
      if (o.type === "npc" && o.sprite) {
        const cell = 16;
        const pos = spriteScreenPos("npcsprite", o.x * TILE + TILE / 2, o.y * TILE + TILE / 2, camX, camY);
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => {
            drawStaticSprite(o.sprite, pos.x, pos.y, cell);
            drawNameLabel(o.name, pos.x, pos.y);
          },
        });
      } else if (o.type === "npc" && o.height && o.color) {
        const pos = spriteScreenPos(o.height, o.x * TILE + TILE / 2, o.y * TILE + TILE / 2, camX, camY);
        drawList.push({
          y: o.y * TILE + TILE,
          draw: () => {
            drawCharSprite(charSprites[o.height], o.height, o.color, pos.x, pos.y, "down", 0);
            drawNameLabel(o.name, pos.x, pos.y);
          },
        });
      } else {
        drawList.push({ y: o.y * TILE + TILE, draw: () => drawObjectMarker(o, camX, camY) });
      }
    });

    drawList.push({
      y: me.y,
      draw: () => {
        const pos = spriteScreenPos(me.height, me.x, me.y, camX, camY);
        drawCharSprite(charSprites[me.height], me.height, me.color, pos.x, pos.y, me.dir, animFrame);
        if (myName) drawNameLabel(myName, pos.x, pos.y);
      },
    });

    Object.values(others).forEach((p) => {
      drawList.push({
        y: p.y,
        draw: () => {
          const height = p.height || "short";
          const pos = spriteScreenPos(height, p.x, p.y, camX, camY);
          drawCharSprite(charSprites[height], height, p.color || "#f9c22b", pos.x, pos.y, p.dir || "down", p.moving ? animFrame : 0);
          if (p.name) drawNameLabel(p.name, pos.x, pos.y);
        },
      });
    });

    drawList.sort((a, b) => a.y - b.y);
    drawList.forEach((item) => item.draw());

    // Interaction prompt
    if (nearbyObject) {
      ctx.save();
      ctx.font = "bold 14px 'Crimson Text', serif";
      ctx.textAlign = "center";
      const px = me.x * RENDER_SCALE - camX;
      const py = me.y * RENDER_SCALE - camY - 70;
      const label = nearbyObject.name;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(46,34,47,0.9)";
      ctx.fillRect(px - textW / 2 - 10, py - 18, textW + 20, 26);
      ctx.strokeStyle = "#f9c22b";
      ctx.strokeRect(px - textW / 2 - 10, py - 18, textW + 20, 26);
      ctx.fillStyle = "#fbb954";
      ctx.fillText(label, px, py);
      ctx.restore();
    }
  }

  function drawDecor(d, camX, camY) {
    const img = getImg(d.src);
    if (!img) return;
    const dx = Math.round(d.x * TILE * RENDER_SCALE - camX);
    const dy = Math.round(d.y * TILE * RENDER_SCALE - camY);
    const dw = d.w * TILE * RENDER_SCALE;
    const dh = d.h * TILE * RENDER_SCALE;
    ctx.drawImage(img, 0, 0, img.width || d.w * TILE, img.height || d.h * TILE, dx, dy, dw, dh);
  }

  function drawObjectMarker(o, camX, camY) {
    const dx = Math.round(o.x * TILE * RENDER_SCALE - camX + (TILE * RENDER_SCALE) / 2);
    const dy = Math.round(o.y * TILE * RENDER_SCALE - camY);
    const solved = o.__solved;
    ctx.save();
    ctx.beginPath();
    ctx.arc(dx, dy - 6, 5, 0, Math.PI * 2);
    ctx.fillStyle = solved ? "#1ebc73" : o.type === "npc" ? "#f9c22b" : "#905ea9";
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
      me.height = opts.myHeight || "short";
      me.color = opts.myColor || "#f9c22b";
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
        others[p.id] = { ...(others[p.id] || {}), color: p.color, height: p.height, name: p.name };
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
