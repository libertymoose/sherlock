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

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use("/content", express.static(path.join(__dirname, "content")));

const server = http.createServer(app);
const io = new Server(server);

// In-memory room state. Fine for a friend-group game night; not meant to survive a server restart.
const rooms = {};
const VALID_RACES = ["human", "orc", "elf", "troll", "dwarf"];

function publicPlayerList(room) {
  return Object.values(room.players).map((p) => ({
    id: p.id,
    name: p.name,
    race: p.race,
    skinColor: p.skinColor,
    outfitColor: p.outfitColor,
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
    tableSlots: [null, null, null, null, null, null],
    foundScraps: {},
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
    const solvedCount = Object.keys(room.actState.solvedClues || {}).length;
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

function buildTableState(room) {
  const scrapDefs = INTERACTIONS.tableScraps || {};
  const totalScraps = Object.keys(scrapDefs).length;
  return {
    slots: room.actState.tableSlots.map((scrapId) =>
      scrapId ? { scrapId, word: scrapDefs[scrapId]?.word || "?" } : null
    ),
    foundCount: Object.keys(room.actState.foundScraps).length,
    totalScraps,
    solved: !!room.actState.solvedClues["evidence_table"],
  };
}

function checkTableSolved(room, code) {
  if (room.actState.solvedClues["evidence_table"]) return;
  const scrapDefs = INTERACTIONS.tableScraps || {};
  const slots = room.actState.tableSlots;
  if (slots.some((s) => s === null)) return;

  const correct = slots.every((scrapId, index) => {
    const def = scrapDefs[scrapId];
    return def && def.order === index;
  });

  if (correct) {
    room.actState.solvedClues["evidence_table"] = true;
    io.to(code).emit("explore:clueSolved", {
      puzzleId: "evidence_table",
      title: "The Evidence Table",
    });
    emitProgress(code);

    const act = STORY.acts[room.actIndex];
    const solvedCount = Object.keys(room.actState.solvedClues).length;
    if (act.completionCount && solvedCount >= act.completionCount) {
      setTimeout(() => advanceAct(code), 2500);
    }
  }
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
    };
    const room = rooms[code];
    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      race: VALID_RACES.includes(data && data.race) ? data.race : "human",
      skinColor: (data && data.skinColor) || "#ab947a",
      outfitColor: (data && data.outfitColor) || "#484a77",
      connected: true,
    };
    room.joinOrder.push(socket.id);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    cb && cb({ ok: true, code });
    broadcastRoomState(code);
  });

  socket.on("player:joinRoom", ({ code, name, race, skinColor, outfitColor }, cb) => {
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
      race: VALID_RACES.includes(race) ? race : "human",
      skinColor: skinColor || "#ab947a",
      outfitColor: outfitColor || "#484a77",
      connected: true,
    };
    room.joinOrder.push(socket.id);
    socket.join(code);
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
    room.players[socket.id].pos = { x: data.x, y: data.y, dir: data.dir, moving: !!data.moving };
    socket.to(code).volatile.emit("players:moved", {
      id: socket.id,
      x: data.x,
      y: data.y,
      dir: data.dir,
      moving: !!data.moving,
    });
  });

  socket.on("explore:requestDialogue", ({ dialogueId }) => {
    const entry = INTERACTIONS[dialogueId];
    if (!entry || entry.type !== "dialogue") return;
    socket.emit("explore:dialogue", { id: dialogueId, title: entry.title, lines: entry.lines });
  });

  socket.on("explore:submitAnswer", ({ puzzleId, answer }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "explore") return;

    const entry = INTERACTIONS[puzzleId];
    if (!entry || entry.type !== "puzzle") return;

    const isCorrect = normalize(answer) === normalize(entry.answer);
    socket.emit("explore:result", { puzzleId, correct: isCorrect });

    if (isCorrect) {
      const alreadySolved = !!room.actState.solvedClues[puzzleId];
      room.actState.solvedClues[puzzleId] = true;
      if (!alreadySolved) {
        io.to(code).emit("explore:clueSolved", {
          puzzleId,
          by: room.players[socket.id]?.name,
          title: entry.title,
        });
      }
      emitProgress(code);

      const solvedCount = Object.keys(room.actState.solvedClues).length;
      if (act.completionCount && solvedCount >= act.completionCount) {
        setTimeout(() => advanceAct(code), 2500);
      }
    }
  });

  socket.on("explore:pickupScrap", ({ scrapId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "explore") return;

    const def = INTERACTIONS.tableScraps && INTERACTIONS.tableScraps[scrapId];
    if (!def) return;
    if (room.actState.foundScraps[scrapId]) {
      socket.emit("table:state", buildTableState(room));
      return;
    }

    room.actState.foundScraps[scrapId] = true;
    const emptyIndex = room.actState.tableSlots.findIndex((s) => s === null);
    if (emptyIndex !== -1) {
      room.actState.tableSlots[emptyIndex] = scrapId;
    }

    io.to(code).emit("explore:scrapFound", { scrapId, word: def.word });
    io.to(code).emit("table:state", buildTableState(room));
  });

  socket.on("table:requestState", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    socket.emit("table:state", buildTableState(room));
  });

  socket.on("table:swap", ({ fromIndex, toIndex }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "explore") return;
    const slots = room.actState.tableSlots;
    if (
      fromIndex < 0 || fromIndex >= slots.length ||
      toIndex < 0 || toIndex >= slots.length
    ) return;

    const tmp = slots[fromIndex];
    slots[fromIndex] = slots[toIndex];
    slots[toIndex] = tmp;

    checkTableSolved(room, code);
    io.to(code).emit("table:state", buildTableState(room));
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
