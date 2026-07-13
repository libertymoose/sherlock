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
app.use(express.static(path.join(__dirname, "public")));
app.use("/content", express.static(path.join(__dirname, "content")));

const server = http.createServer(app);
const io = new Server(server);

// In-memory room state. Fine for a friend-group game night; not meant to survive a server restart.
const rooms = {};
// Player character system: pick a model (male/female base body) and a solid
// colour tint, Among-Us style. No species/look-number selection any more,
// that's reserved for NPCs/creature presets elsewhere in the game.
const GENDERS = ["male", "female"];
const COLORS = ["red", "blue", "green", "yellow", "orange", "purple", "pink", "cyan", "white", "black", "brown", "lime"];

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
    return { ...base, body: act.body, image: act.image || null };
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
      intro: act.intro || null,
      solvedClues: Object.keys(room.actState.solvedClues || {}),
      requiredCount: act.completionCount,
    };
  }

  if (act.type === "suspect_board") {
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
  } else if (act.type === "reveal") {
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
    if (!act || act.type !== "reveal") return;
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

    // Evidence-gated acts (the Estate stage) advance once every required
    // exhibit is on the table, not on a typed answer. completionMode stays
    // opt-in on the act so other explore-type stages can keep using the
    // solvedClues/typed-answer path if that ever fits them better.
    const act = STORY.acts[room.actIndex];
    if (act && act.type === "explore" && act.completionMode === "evidence" && act.completionCount) {
      if (room.evidence.length >= act.completionCount) {
        setTimeout(() => advanceAct(code), 2500);
      }
    }
  });

  socket.on("board:move", ({ key, toZone }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "suspect_board") return;

    const pool = (INTERACTIONS.suspectBoard && INTERACTIONS.suspectBoard.pool) || [];
    if (!pool.find((p) => p.key === key)) return;

    const zone = room.actState.boardZone;
    const idx = zone.indexOf(key);

    if (toZone === "suspects") {
      if (idx === -1) zone.push(key);
    } else {
      if (idx !== -1) zone.splice(idx, 1);
    }

    io.to(code).emit("board:state", { zone: room.actState.boardZone });
  });

  socket.on("board:submit", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "suspect_board") return;

    const correctSet = (INTERACTIONS.suspectBoard && INTERACTIONS.suspectBoard.correctSet) || [];
    const zone = room.actState.boardZone;

    let message;
    let correct = false;

    if (zone.length < correctSet.length) {
      message = "\"I think we're missing someone. Look again.\"";
    } else if (zone.length > correctSet.length) {
      message = "\"That's too many. Narrow it down \u2014 not everyone with a grudge is a killer.\"";
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

    if (room.hostSocketId === socket.id) {
      io.to(code).emit("host:disconnected");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sherlock Night game server running on port ${PORT}`);
});
