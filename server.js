const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const { customAlphabet } = require("nanoid");

// Room codes use an alphabet with no easily-confused characters (no 0/O, 1/I/L)
const genCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 5);

const STORY = JSON.parse(
  fs.readFileSync(path.join(__dirname, "content", "story.json"), "utf8")
);
const INTERACTIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "content", "interactions.json"), "utf8")
);
const ITEMS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "content", "items.json"), "utf8")
);

const app = express();
// Railway's edge CDN caches static assets by default whenever the origin
// sends no Cache-Control header at all, independent of anyone's browser
// cache. During active development that means map/art updates can look
// "stuck" on Railway's edge even in a clean incognito window. Sending an
// explicit no-cache header (still allows fast conditional revalidation via
// ETag, just never serves a stale copy without checking first) makes
// Railway respect this instead of applying its own fallback TTL.
const noCacheStatic = (dir) =>
  express.static(dir, {
    setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
  });
app.use(noCacheStatic(path.join(__dirname, "public")));
app.use("/content", noCacheStatic(path.join(__dirname, "content")));

const server = http.createServer(app);
const io = new Server(server);

// In-memory room state. Fine for a friend-group game night; not meant to survive a server restart.
const rooms = {};
// Player character system: pick a model (male/female base body) and a solid
// colour tint, Among-Us style. No species/look-number selection any more,
// that's reserved for NPCs/creature presets elsewhere in the game.
const GENDERS = ["male", "female"];
const COLORS = ["red", "maroon", "brown", "orange", "yellow", "lime", "green", "teal", "cyan", "blue", "navy", "violet", "purple", "pink", "white", "black"];

// How long a solo-tested pressure plate holds its own door open, in ms.
// Real sessions (6-10 players) always hit the multiplayer hold-based path
// instead, this is purely the fallback for testing alone.
const SOLO_PLATE_OPEN_MS = 5000;

function cleanGender(gender) {
  return GENDERS.includes(gender) ? gender : "male";
}
function cleanColor(color) {
  return COLORS.includes(color) ? color : "red";
}

function publicPlayerList(room) {
  return Object.values(room.players).map((p) => ({
    id: p.id,
    name: p.name,
    gender: p.gender,
    color: p.color,
    connected: p.connected,
  }));
}

function broadcastRoomState(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit("room:update", {
    code,
    hostId: room.hostSocketId,
    started: room.started,
    players: publicPlayerList(room),
    storyTitle: STORY.title,
  });
}

function orderedPlayerIds(room) {
  // Stable order based on join order, used for assigning fragments/puzzles round-robin
  return room.joinOrder.filter((id) => room.players[id]);
}

function buildActPayloadForPlayer(room, socketId) {
  const act = STORY.acts[room.actIndex];
  if (!act) return null;
  const base = { index: room.actIndex, total: STORY.acts.length, type: act.type, title: act.title };

  if (act.type === "reveal") {
    return { ...base, body: act.body, image: act.image || null, showEvidenceReview: !!act.showEvidenceReview };
  }

  if (act.type === "cutscene") {
    return { ...base, pages: act.pages || [], fadeOut: !!act.fadeOut };
  }

  if (act.type === "final") {
    return { ...base, body: act.body, finalWord: act.finalWord };
  }

  if (act.type === "puzzle_group") {
    return { ...base, prompt: act.prompt, hint: act.hint || null };
  }

  if (act.type === "puzzle_individual") {
    const ids = orderedPlayerIds(room);
    const myIndex = ids.indexOf(socketId);
    const puzzle = act.puzzles[myIndex % act.puzzles.length];
    return {
      ...base,
      intro: act.intro,
      prompt: puzzle.prompt,
      solved: !!(room.actState.solvedBy && room.actState.solvedBy[socketId]),
    };
  }

  if (act.type === "puzzle_split") {
    const ids = orderedPlayerIds(room);
    const myIndex = ids.indexOf(socketId);
    const fragment = act.fragments[myIndex % act.fragments.length];
    return {
      ...base,
      intro: act.intro,
      fragment,
      finalPrompt: act.finalPrompt,
      hint: act.hint || null,
    };
  }

  if (act.type === "explore") {
    return {
      ...base,
      mapUrl: act.mapUrl,
      zone: act.zone || "estate",
      intro: act.intro || null,
      solvedClues: Object.keys(room.actState.solvedClues || {}),
      requiredCount: act.completionCount,
    };
  }

  if (act.type === "evidence_room") {
    return {
      ...base,
      intro: act.intro || null,
      pool: (INTERACTIONS.suspectBoard && INTERACTIONS.suspectBoard.pool) || [],
      zone: room.actState.boardZone,
    };
  }

  return base;
}

function sendActToRoom(code) {
  const room = rooms[code];
  if (!room) return;
  const act = STORY.acts[room.actIndex];

  // Reset per-act progress tracking
  room.actState = {
    solvedBy: {},
    ackBy: {},
    solvedClues: {},
    boardZone: [],
  };

  for (const socketId of Object.keys(room.players)) {
    const payload = buildActPayloadForPlayer(room, socketId);
    io.to(socketId).emit("act:show", payload);
  }
  emitProgress(code);
}

function emitProgress(code) {
  const room = rooms[code];
  if (!room) return;
  const act = STORY.acts[room.actIndex];
  if (!act) return;
  const totalPlayers = Object.keys(room.players).length;

  if (act.type === "puzzle_individual") {
    const solvedCount = Object.keys(room.actState.solvedBy || {}).length;
    io.to(code).emit("act:progress", {
      kind: "individual",
      solved: solvedCount,
      total: totalPlayers,
      threshold: act.completionThreshold || 1.0,
    });
  } else if (act.type === "reveal" || act.type === "cutscene") {
    const ackCount = Object.keys(room.actState.ackBy || {}).length;
    io.to(code).emit("act:progress", {
      kind: "reveal",
      acknowledged: ackCount,
      total: totalPlayers,
    });
  } else if (act.type === "explore") {
    const solvedCount = act.completionMode === "evidence"
      ? (rooms[code].evidence || []).length
      : Object.keys(room.actState.solvedClues || {}).length;
    io.to(code).emit("act:progress", {
      kind: "explore",
      solved: solvedCount,
      total: act.completionCount,
    });
  }
}

function advanceAct(code) {
  const room = rooms[code];
  if (!room) return;
  room.actIndex += 1;
  if (room.actIndex >= STORY.acts.length) {
    room.actIndex = STORY.acts.length - 1;
  }
  sendActToRoom(code);
  broadcastRoomState(code);
}

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

function getInventory(room, socketId) {
  if (!room.inventories[socketId]) room.inventories[socketId] = [];
  return room.inventories[socketId];
}

function buildInventoryState(room, socketId) {
  return getInventory(room, socketId).map((it) => ({
    itemId: it.itemId,
    name: it.name,
  }));
}

function buildEvidenceState(room) {
  return room.evidence.map((ex) => ({
    itemId: ex.itemId,
    letter: ex.letter,
    name: ex.name,
    description: ex.description,
    art: ex.art,
  }));
}

function letterForIndex(i) {
  // A, B, C ... Z, then AA, AB... good enough for a case file that will
  // never realistically hit 26 exhibits in one sitting.
  let s = "";
  i += 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

io.on("connection", (socket) => {
  socket.on("host:createRoom", (data, cb) => {
    let code = genCode();
    while (rooms[code]) code = genCode();
    const cleanName = String((data && data.name) || "Detective").trim().slice(0, 24) || "Detective";
    rooms[code] = {
      hostSocketId: socket.id,
      players: {},
      joinOrder: [],
      started: false,
      actIndex: -1,
      actState: { solvedBy: {}, ackBy: {} },
      // Persistent across acts, unlike actState, exhibits found in the estate
      // still need to be on the table by the time the party reaches the Guild Hall.
      inventories: {},
      evidence: [],
      collectedPickups: {},
      // zone -> plateId -> { holders: Set<socketId>, targetDoorZoneId, selfDoorZoneId }
      zonePlates: {},
    };
    const room = rooms[code];
    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      gender: cleanGender(data && data.gender),
      color: cleanColor(data && data.color),
      connected: true,
      zone: "estate",
    };
    room.joinOrder.push(socket.id);
    socket.join(code);
    socket.join(`${code}:estate`);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    cb && cb({ ok: true, code });
    broadcastRoomState(code);
  });

  socket.on("player:joinRoom", ({ code, name, gender, color }, cb) => {
    code = String(code || "").toUpperCase().trim();
    const room = rooms[code];
    if (!room) {
      cb && cb({ ok: false, error: "Room not found. Double-check the code." });
      return;
    }
    if (room.started) {
      cb && cb({ ok: false, error: "This game has already started." });
      return;
    }
    const cleanName = String(name || "Detective").trim().slice(0, 24) || "Detective";
    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      gender: cleanGender(gender),
      color: cleanColor(color),
      connected: true,
      zone: "estate",
    };
    room.joinOrder.push(socket.id);
    socket.join(code);
    socket.join(`${code}:estate`);
    socket.data.roomCode = code;
    cb && cb({ ok: true, code });
    broadcastRoomState(code);
  });

  socket.on("host:startGame", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.hostSocketId !== socket.id) return;
    room.started = true;
    room.actIndex = 0;
    sendActToRoom(code);
    broadcastRoomState(code);
  });

  socket.on("host:advanceAct", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.hostSocketId !== socket.id) return;
    advanceAct(code);
  });

  socket.on("host:resetGame", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.hostSocketId !== socket.id) return;
    room.started = false;
    room.actIndex = -1;
    room.actState = { solvedBy: {}, ackBy: {} };
    broadcastRoomState(code);
    io.to(code).emit("game:reset");
  });

  socket.on("act:acknowledgeReveal", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || (act.type !== "reveal" && act.type !== "cutscene")) return;
    room.actState.ackBy[socket.id] = true;
    emitProgress(code);
    const totalPlayers = Object.keys(room.players).length;
    if (Object.keys(room.actState.ackBy).length >= totalPlayers) {
      advanceAct(code);
    }
  });

  socket.on("act:submitGroup", ({ answer }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || (act.type !== "puzzle_group" && act.type !== "puzzle_split")) return;

    const correctAnswer = act.type === "puzzle_group" ? act.answer : act.finalAnswer;
    const isCorrect = normalize(answer) === normalize(correctAnswer);

    socket.emit("act:result", { correct: isCorrect });
    if (isCorrect) {
      io.to(code).emit("act:groupSolved", { by: room.players[socket.id]?.name });
      setTimeout(() => advanceAct(code), 1800);
    }
  });

  socket.on("act:submitIndividual", ({ answer }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "puzzle_individual") return;

    const ids = orderedPlayerIds(room);
    const myIndex = ids.indexOf(socket.id);
    const puzzle = act.puzzles[myIndex % act.puzzles.length];
    const isCorrect = normalize(answer) === normalize(puzzle.answer);

    socket.emit("act:result", { correct: isCorrect });
    if (isCorrect) {
      room.actState.solvedBy[socket.id] = true;
      emitProgress(code);

      const totalPlayers = Object.keys(room.players).length;
      const solvedCount = Object.keys(room.actState.solvedBy).length;
      const threshold = act.completionThreshold || 1.0;
      if (solvedCount / totalPlayers >= threshold) {
        setTimeout(() => advanceAct(code), 1500);
      }
    }
  });

  socket.on("player:move", (data) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.players[socket.id]) return;
    const zone = room.players[socket.id].zone || "estate";
    room.players[socket.id].pos = { x: data.x, y: data.y, dir: data.dir, moving: !!data.moving };
    socket.to(`${code}:${zone}`).volatile.emit("players:moved", {
      id: socket.id,
      x: data.x,
      y: data.y,
      dir: data.dir,
      moving: !!data.moving,
    });
  });

  // Pressure plates: multiplayer, hold the plate to keep someone else's
  // door open, step off and it shuts immediately. Solo (only one player
  // actually in this zone, e.g. testing alone), there's no one to hold it
  // for you, so it pulses your own door open on a short timer instead.
  socket.on("plate:enter", ({ zone, plateId, targetDoorZoneId, selfDoorZoneId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !plateId) return;
    const z = zone || "estate";

    const playersHere = Object.values(room.players).filter(
      (p) => p.connected && (p.zone || "estate") === z
    ).length;

    if (playersHere <= 1) {
      const doorId = selfDoorZoneId || targetDoorZoneId;
      if (!doorId) return;
      io.to(`${code}:${z}`).emit("door:state", { doorZoneId: doorId, open: true });
      setTimeout(() => {
        io.to(`${code}:${z}`).emit("door:state", { doorZoneId: doorId, open: false });
      }, SOLO_PLATE_OPEN_MS);
      return;
    }

    if (!targetDoorZoneId) return;
    if (!room.zonePlates[z]) room.zonePlates[z] = {};
    let plate = room.zonePlates[z][plateId];
    if (!plate) {
      plate = { holders: new Set(), targetDoorZoneId, selfDoorZoneId };
      room.zonePlates[z][plateId] = plate;
    }
    const wasEmpty = plate.holders.size === 0;
    plate.holders.add(socket.id);
    if (wasEmpty) {
      io.to(`${code}:${z}`).emit("door:state", { doorZoneId: plate.targetDoorZoneId, open: true });
    }
  });

  socket.on("plate:leave", ({ zone, plateId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !plateId) return;
    const z = zone || "estate";
    const plate = room.zonePlates[z] && room.zonePlates[z][plateId];
    if (!plate) return; // solo pulse mode never registers a holder entry
    plate.holders.delete(socket.id);
    if (plate.holders.size === 0) {
      io.to(`${code}:${z}`).emit("door:state", { doorZoneId: plate.targetDoorZoneId, open: false });
    }
  });

  // Players can walk into buildings independently, they don't need to be
  // pulled in together. Each zone is its own Socket.io sub-room so movement
  // and roster updates only reach players actually standing in that zone.
  socket.on("player:changeZone", ({ zone, x, y }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.players[socket.id]) return;
    const player = room.players[socket.id];
    const oldZone = player.zone || "estate";
    if (oldZone === zone) return;

    socket.leave(`${code}:${oldZone}`);
    socket.to(`${code}:${oldZone}`).emit("zone:playerLeft", { id: socket.id });

    player.zone = zone;
    player.pos = { x, y, dir: "down", moving: false };
    socket.join(`${code}:${zone}`);

    socket.to(`${code}:${zone}`).emit("zone:playerEntered", {
      id: socket.id,
      name: player.name,
      gender: player.gender,
      color: player.color,
      x, y,
    });

    const othersHere = Object.entries(room.players)
      .filter(([id, p]) => id !== socket.id && p.connected && (p.zone || "estate") === zone)
      .map(([id, p]) => ({
        id, name: p.name, gender: p.gender, color: p.color,
        x: p.pos ? p.pos.x : x, y: p.pos ? p.pos.y : y,
      }));
    socket.emit("zone:roster", { zone, players: othersHere });
  });

  socket.on("explore:requestDialogue", ({ dialogueId }) => {
    const entry = INTERACTIONS[dialogueId];
    if (!entry || entry.type !== "dialogue") return;
    socket.emit("explore:dialogue", { id: dialogueId, title: entry.title, lines: entry.lines });
  });

  socket.on("inventory:pickup", ({ objectId, itemId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "explore") return;

    // Old-style pickups (scraps) used the map object's own id as the item
    // key, so itemId falls back to objectId when the caller doesn't send
    // one. Evidence documents send both, since the object on the map
    // (ev_maid_diary) and the item it yields (diary_maid) are named
    // differently on purpose.
    const lookupId = itemId || objectId;
    const def = ITEMS[lookupId];
    if (!def) return;
    if (room.collectedPickups[objectId]) return; // someone else already got it

    room.collectedPickups[objectId] = true;
    getInventory(room, socket.id).push({
      itemId: lookupId,
      name: def.name,
      description: def.description,
      art: def.art,
    });

    io.to(code).emit("map:objectRemoved", { objectId });
    socket.emit("inventory:state", buildInventoryState(room, socket.id));
  });

  socket.on("inventory:requestState", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    socket.emit("inventory:state", buildInventoryState(room, socket.id));
  });

  socket.on("evidence:requestState", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    socket.emit("evidence:state", buildEvidenceState(room));
  });

  socket.on("evidence:add", ({ itemId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const inv = getInventory(room, socket.id);
    const idx = inv.findIndex((it) => it.itemId === itemId);
    if (idx === -1) return;

    const [item] = inv.splice(idx, 1);
    room.evidence.push({
      itemId: item.itemId,
      letter: letterForIndex(room.evidence.length),
      name: item.name,
      description: item.description,
      art: item.art,
    });

    socket.emit("inventory:state", buildInventoryState(room, socket.id));
    io.to(code).emit("evidence:state", buildEvidenceState(room));
    emitProgress(code);

    // Evidence-gated acts (the Estate stage) used to auto-advance once every
    // exhibit was on the table. Now that finding everything just means
    // Thorne wants the party upstairs, not an automatic scene change, this
    // fires her line once (never again, even if this handler somehow runs
    // again) and leaves the actual advance to the ready-vote at the desk.
    const act = STORY.acts[room.actIndex];
    if (act && act.type === "explore" && act.completionMode === "evidence" && act.completionCount) {
      if (room.evidence.length >= act.completionCount && !room.actState.evidenceThorneShown) {
        room.actState.evidenceThorneShown = true;
        io.to(code).emit("thorne:message", { text: act.onEvidenceCompleteMessage || "" });
      }
    }
  });

  // The "ready to review" vote at the Evidence Room desk. Only makes sense
  // once every exhibit has actually been found, and only fires once per
  // player, same ack-counting pattern as reveal/cutscene acts, just gating
  // the explore -> evidence_room transition instead.
  socket.on("evidenceRoom:ready", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "explore" || act.completionMode !== "evidence") return;
    if (room.evidence.length < act.completionCount) return;

    room.actState.ackBy[socket.id] = true;
    const totalPlayers = Object.keys(room.players).length;
    const ackCount = Object.keys(room.actState.ackBy).length;
    io.to(code).emit("evidenceRoom:readyProgress", { ready: ackCount, total: totalPlayers });
    if (ackCount >= totalPlayers) {
      advanceAct(code);
    }
  });

  socket.on("board:move", ({ key, toZone }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "evidence_room") return;

    const pool = (INTERACTIONS.suspectBoard && INTERACTIONS.suspectBoard.pool) || [];
    if (!pool.find((p) => p.key === key)) return;

    const zone = room.actState.boardZone;
    const idx = zone.indexOf(key);
    const changed = toZone === "suspects" ? idx === -1 : idx !== -1;

    if (toZone === "suspects") {
      if (idx === -1) zone.push(key);
    } else {
      if (idx !== -1) zone.splice(idx, 1);
    }

    // Editing the board after someone's already agreed to submit it means
    // that agreement no longer means what it did, clear it so submission
    // needs a fresh, unanimous look at whatever the board is now.
    if (changed && Object.keys(room.actState.ackBy).length) {
      room.actState.ackBy = {};
      io.to(code).emit("board:submitProgress", { ready: 0, total: Object.keys(room.players).length });
    }

    io.to(code).emit("board:state", { zone: room.actState.boardZone });
  });

  // "Submit to Captain Thorne" is a vote, not a single click, same
  // ack-counting idea as the ready check. Everyone has to agree the board
  // is right before it's actually evaluated. A wrong answer resets the
  // vote (not the board itself) so the party can adjust and re-submit
  // without every last player needing to re-click something that already
  // worked for them.
  socket.on("board:submit", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "evidence_room") return;

    room.actState.ackBy[socket.id] = true;
    const totalPlayers = Object.keys(room.players).length;
    const ackCount = Object.keys(room.actState.ackBy).length;
    io.to(code).emit("board:submitProgress", { ready: ackCount, total: totalPlayers });
    if (ackCount < totalPlayers) return;

    const correctSet = (INTERACTIONS.suspectBoard && INTERACTIONS.suspectBoard.correctSet) || [];
    const zone = room.actState.boardZone;

    let message;
    let correct = false;

    if (zone.length < correctSet.length) {
      message = "\"I think we're missing someone. Look again.\"";
    } else if (zone.length > correctSet.length) {
      message = "\"That's too many. Narrow it down, not everyone with a grudge is a killer.\"";
    } else {
      const zoneSet = new Set(zone);
      const isExact = correctSet.every((k) => zoneSet.has(k));
      if (isExact) {
        correct = true;
      } else {
        message = "\"Something's off here. Reconsider what you've actually got evidence for.\"";
      }
    }

    if (correct) {
      room.actState.solvedClues["suspect_board"] = true;
      io.to(code).emit("board:result", { correct: true });
      setTimeout(() => advanceAct(code), 2500);
    } else {
      room.actState.ackBy = {};
      io.to(code).emit("board:result", { correct: false, message });
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;

    if (room.players[socket.id]) {
      room.players[socket.id].connected = false;
      const zone = room.players[socket.id].zone || "estate";
      socket.to(`${code}:${zone}`).emit("zone:playerLeft", { id: socket.id });
      broadcastRoomState(code);
    }

    // If they were mid-hold on a pressure plate when they dropped, let go
    // of it for them so whichever door it fed doesn't stay open forever.
    Object.entries(room.zonePlates || {}).forEach(([zone, plates]) => {
      Object.entries(plates).forEach(([plateId, plate]) => {
        if (!plate.holders.has(socket.id)) return;
        plate.holders.delete(socket.id);
        if (plate.holders.size === 0) {
          io.to(`${code}:${zone}`).emit("door:state", { doorZoneId: plate.targetDoorZoneId, open: false });
        }
      });
    });

    if (room.hostSocketId === socket.id) {
      io.to(code).emit("host:disconnected");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sherlock Night game server running on port ${PORT}`);
});
