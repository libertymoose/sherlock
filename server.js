const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const { customAlphabet } = require("nanoid");

// Room codes use an alphabet with no easily-confused characters (no 0/O, 1/I/L)
const genCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 5);

// Reconnect tokens: long enough to not be guessable, stored client-side
// (localStorage) and handed back on player:rejoin to reclaim a seat after
// a disconnect or page refresh. Not a room code, never shown to anyone.
const genToken = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  32
);

const STORY = JSON.parse(
  fs.readFileSync(path.join(__dirname, "content", "story.json"), "utf8")
);
const INTERACTIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "content", "interactions.json"), "utf8")
);
const ITEMS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "content", "items.json"), "utf8")
);

// Most map data (tile layers, art) only ever matters to the client. Plate/door
// chaining is the one exception - the server needs to know each pressure
// plate's cellId and the full spawnPoints list to work out which cells are
// actually occupied for a given party size (see computeDungeonChain below).
// Loaded from disk on first use per mapUrl and cached, not reloaded per room.
const mapDataCache = {};
function loadMapData(mapUrl) {
  if (!mapUrl) return null;
  if (mapDataCache[mapUrl]) return mapDataCache[mapUrl];
  try {
    const filePath = path.join(__dirname, "public", mapUrl.replace(/^\//, ""));
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    mapDataCache[mapUrl] = data;
    return data;
  } catch (e) {
    console.error("Failed to load map data for", mapUrl, e.message);
    return null;
  }
}

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

// The client fetches interactions.json directly to render dialogue/document
// content in the field. `closing` on each doc_* entry is the actual solved
// deduction, meant to be worked out by the party at the table, not handed
// over. The client UI already doesn't render it, but since /content used to
// be a plain static mount, the raw answer was still sitting in the network
// response for anyone who opened devtools. This route intercepts that one
// file (added before the static mount below, so it takes priority) and
// strips `closing` before it ever leaves the server; the full version with
// closing intact stays in the in-memory INTERACTIONS object for server-side
// use only.
app.get("/content/interactions.json", (req, res) => {
  const sanitized = {};
  for (const [key, entry] of Object.entries(INTERACTIONS)) {
    if (entry && typeof entry === "object" && "closing" in entry) {
      const { closing, ...rest } = entry;
      sanitized[key] = rest;
    } else {
      sanitized[key] = entry;
    }
  }
  res.setHeader("Cache-Control", "no-cache");
  res.json(sanitized);
});
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
  const base = { index: room.actIndex, total: STORY.acts.length, type: act.type, title: act.title, chapter: act.chapter || 1 };

  if (act.type === "reveal") {
    return { ...base, body: act.body, image: act.image || null, showEvidenceReview: !!act.showEvidenceReview };
  }

  if (act.type === "cutscene") {
    return { ...base, pages: act.pages || [], fadeOut: !!act.fadeOut, singlePage: !!act.singlePage };
  }

  if (act.type === "staged_scene") {
    return {
      ...base,
      mapUrl: act.mapUrl,
      zone: act.zone,
      video: act.video || null,
      playerMarks: act.playerMarks || [],
      actors: act.actors || [],
      dialogue: act.dialogue || [],
      fadeOut: !!act.fadeOut,
      nextActEyebrow: act.nextActEyebrow || null,
      nextActTitle: act.nextActTitle || null,
    };
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
      // Every zone load re-fetches the raw map file from scratch, so
      // anything already picked up (by anyone, possibly before this
      // particular client connected) needs to be listed explicitly or it'll
      // visually reappear the moment this player loads or re-loads a zone.
      collectedPickups: Object.keys(room.collectedPickups || {}),
      // Authoritative here rather than left for the client to derive from
      // its own copy of the player list, specifically so it always agrees
      // with computeDungeonChain's idea of who's in which spawn/cell -
      // those two disagreeing would mean a player's visual spawn point and
      // the server's plate/door chain point at different cells.
      spawnIndex: connectedJoinOrder(room).indexOf(socketId),
      prefillInventoryFromEvidence: !!act.prefillInventoryFromEvidence,
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
  room.dungeonChain = null;
  room.zonePlates = {};
  room.zoneCandles = {};

  if (act && act.type === "explore" && act.mapUrl) {
    const mapData = loadMapData(act.mapUrl);
    room.dungeonChain = computeDungeonChain(room, mapData);
  }

  // "You still have everything you were carrying when they arrested you" -
  // every player gets their own copy of the full evidence set the moment
  // this act starts, not just whoever happened to be holding what before.
  if (act && act.prefillInventoryFromEvidence) {
    for (const socketId of Object.keys(room.players)) {
      room.inventories[socketId] = room.evidence.map((ex) => ({
        itemId: ex.itemId,
        name: ex.name,
        description: ex.description,
        art: ex.art,
        letter: ex.letter,
      }));
    }
  }

  for (const socketId of Object.keys(room.players)) {
    const payload = buildActPayloadForPlayer(room, socketId);
    io.to(socketId).emit("act:show", payload);
    if (act && act.prefillInventoryFromEvidence) {
      io.to(socketId).emit("inventory:state", buildInventoryState(room, socketId));
    }
  }
  emitProgress(code);
}

function emitProgress(code) {
  const room = rooms[code];
  if (!room) return;
  const act = STORY.acts[room.actIndex];
  if (!act) return;
  const totalPlayers = connectedPlayerCount(room);

  if (act.type === "puzzle_individual") {
    const solvedCount = Object.keys(room.actState.solvedBy || {}).length;
    io.to(code).emit("act:progress", {
      kind: "individual",
      solved: solvedCount,
      total: totalPlayers,
      threshold: act.completionThreshold || 1.0,
    });
  } else if (act.type === "reveal" || act.type === "cutscene" || act.type === "staged_scene") {
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

// Every group-progress gate (cutscene/reveal acks, puzzle thresholds, the
// Evidence Room ready vote, suspect board submission) needs a headcount of
// the party. room.players never drops an entry on disconnect - only marks
// connected:false, so a reconnect can restore it - so counting every key
// there means one dropped connection that never comes back permanently
// blocks every single one of these gates for everyone else, forever. This
// counts only players actually here right now.
function connectedPlayerCount(room) {
  return Object.values(room.players).filter((p) => p.connected !== false).length;
}

// The stable ordering used for anything that assigns players to fixed slots
// (spawn points, puzzle fragments): join order, filtered down to whoever's
// actually still connected, so a disconnected ghost doesn't hold a slot
// nobody can use.
function connectedJoinOrder(room) {
  return (room.joinOrder || []).filter(
    (id) => room.players[id] && room.players[id].connected !== false
  );
}

// The jail cells (and any future map like it) can have more spawn points
// than the party has players - each cell may hold several spawns, and with
// a small party some cells end up with nobody in them at all. The plate in
// an empty cell will never be pressed, so the map's *authored* plate ->
// door chain (each cell's plate opens the next cell's door) can't be used
// as-is, or the party gets stuck waiting on a door that depends on an
// empty room. This recomputes the chain to skip empty cells entirely,
// wiring each occupied cell's plate directly to the *next occupied* cell's
// door, wrapping around. Returns { [cellId]: doorZoneId }, or null if this
// map doesn't have the plate/spawnPoints shape this applies to.
function computeDungeonChain(room, mapData) {
  if (!mapData || !mapData.pressurePlates || !mapData.spawnPoints) return null;
  const order = connectedJoinOrder(room);
  const spawnPoints = mapData.spawnPoints;
  if (!spawnPoints.length) return null;

  const occupiedCellIds = new Set();
  order.forEach((id, i) => {
    const sp = spawnPoints[i % spawnPoints.length];
    if (sp && sp.cellId) occupiedCellIds.add(sp.cellId);
  });

  // Cell order comes from the plates array itself (already authored in
  // physical left-to-right order during map conversion), filtered to only
  // the ones actually occupied.
  const cellOrder = mapData.pressurePlates
    .map((p) => p.cellId)
    .filter((id) => occupiedCellIds.has(id));

  if (!cellOrder.length) return null;

  const doorForCell = {};
  mapData.pressurePlates.forEach((p) => {
    if (p.cellId) doorForCell[p.cellId] = p.selfDoorZoneId;
  });

  const chain = {};
  cellOrder.forEach((cellId, i) => {
    const nextCellId = cellOrder[(i + 1) % cellOrder.length];
    chain[cellId] = doorForCell[nextCellId];
  });
  return chain;
}

// Shared between the actual "Submit to Captain Thorne" click and a
// disconnect that happens to complete a unanimous vote (see
// recheckGroupThreshold below) - same evaluation either way.
function evaluateBoardSubmit(room, code) {
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
}

// A dropped connection changes the denominator every group-progress gate
// checks against (see connectedPlayerCount). If the remaining connected
// players had already all clicked through and the one holdout was the
// player who just disconnected, nobody else has anything left to click -
// their buttons are already disabled and waiting - so without this,
// the party stays stuck until that specific player comes back, even
// though everyone actually present already agreed. Called after any
// disconnect or explicit leave to catch that case immediately.
function recheckGroupThreshold(room, code) {
  const act = STORY.acts[room.actIndex];
  if (!act || !room.actState) return;
  const totalPlayers = connectedPlayerCount(room);
  if (totalPlayers <= 0) return;

  if (act.type === "reveal" || act.type === "cutscene" || act.type === "staged_scene") {
    const ackCount = Object.keys(room.actState.ackBy || {}).length;
    if (ackCount >= totalPlayers) advanceAct(code);
  } else if (act.type === "puzzle_individual") {
    const solvedCount = Object.keys(room.actState.solvedBy || {}).length;
    const threshold = act.completionThreshold || 1.0;
    if (solvedCount > 0 && solvedCount / totalPlayers >= threshold) {
      setTimeout(() => advanceAct(code), 1500);
    }
  } else if (act.type === "explore" && act.completionMode === "evidence") {
    const ackCount = Object.keys(room.actState.ackBy || {}).length;
    if (ackCount > 0 && room.evidence.length >= act.completionCount && ackCount >= totalPlayers) {
      io.to(code).emit("evidenceRoom:readyProgress", { ready: ackCount, total: totalPlayers });
      advanceAct(code);
    }
  } else if (act.type === "evidence_room") {
    const ackCount = Object.keys(room.actState.ackBy || {}).length;
    if (ackCount > 0 && ackCount >= totalPlayers) {
      io.to(code).emit("board:submitProgress", { ready: ackCount, total: totalPlayers });
      evaluateBoardSubmit(room, code);
    }
  }
}

// A page refresh (or any dropped connection) gets a brand new socket.id from
// socket.io, but every piece of room state - players, inventories, act
// progress, held pressure plates, join order - is keyed by the OLD one.
// Reconnecting with a valid token means finding that old id and moving all
// of it over to the new one, in place, so nothing about the player's
// progress or position in the join order changes from anyone else's view.
function remapSocketId(room, oldId, newId) {
  if (oldId === newId) return;

  const rekey = (obj) => {
    if (!obj || !(oldId in obj)) return;
    const rebuilt = {};
    for (const [key, value] of Object.entries(obj)) {
      rebuilt[key === oldId ? newId : key] = value;
    }
    for (const key of Object.keys(obj)) delete obj[key];
    Object.assign(obj, rebuilt);
  };

  rekey(room.players);
  if (room.players[newId]) room.players[newId].id = newId;
  rekey(room.inventories);
  if (room.actState) {
    rekey(room.actState.solvedBy);
    rekey(room.actState.ackBy);
  }

  room.joinOrder = room.joinOrder.map((id) => (id === oldId ? newId : id));

  Object.values(room.zonePlates || {}).forEach((plates) => {
    Object.values(plates).forEach((plate) => {
      if (plate.holders.has(oldId)) {
        plate.holders.delete(oldId);
        plate.holders.add(newId);
      }
    });
  });

  if (room.hostSocketId === oldId) room.hostSocketId = newId;
}

function buildInventoryState(room, socketId) {
  return getInventory(room, socketId).map((it) => ({
    itemId: it.itemId,
    name: it.name,
    letter: it.letter || null,
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

// The Evidence Table normally only shows what the party actually collected
// (that's a real progress gate during the Estate act). But by "The
// Evidence" review act, the whole dossier should be visible regardless -
// whether every piece was actually found, or the host force-advanced past
// a gap. This is the fixed 7-item case file, not live pickup state.
const CANONICAL_EVIDENCE_ORDER = [
  "ledger_ashby",
  "satchel_voss",
  "manifests_kestrel",
  "blueprint_marrow",
  "letter_ashgate",
  "rota_reyes",
  "diary_maid",
];
function buildFullEvidenceState() {
  return CANONICAL_EVIDENCE_ORDER.filter((id) => ITEMS[id]).map((id, i) => ({
    itemId: id,
    letter: letterForIndex(i),
    name: ITEMS[id].name,
    description: ITEMS[id].description,
    art: ITEMS[id].art,
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
      // zone -> { lit: { candleId: true }, order: [candleId, ...] } - the
      // candle puzzle (Area 3). order tracks the actual lighting sequence so
      // wrong-order attempts can be told apart from the right one once all
      // four happen to be lit at once.
      zoneCandles: {},
    };
    const room = rooms[code];
    const token = genToken();
    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      gender: cleanGender(data && data.gender),
      color: cleanColor(data && data.color),
      connected: true,
      zone: "estate",
      token,
    };
    room.joinOrder.push(socket.id);
    socket.join(code);
    socket.join(`${code}:estate`);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    cb && cb({ ok: true, code, token });
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
    const token = genToken();
    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      gender: cleanGender(gender),
      color: cleanColor(color),
      connected: true,
      zone: "estate",
      token,
    };
    room.joinOrder.push(socket.id);
    socket.join(code);
    socket.join(`${code}:estate`);
    socket.data.roomCode = code;
    cb && cb({ ok: true, code, token });
    broadcastRoomState(code);
  });

  // Reclaiming a seat after a disconnect or page refresh. Unlike
  // player:joinRoom this is allowed even once the game has started, since
  // it's not letting a stranger in, it's the same player's browser coming
  // back with the token it was handed on the way in.
  socket.on("player:rejoin", ({ code, token }, cb) => {
    code = String(code || "").toUpperCase().trim();
    const room = rooms[code];
    if (!room) {
      cb && cb({ ok: false, error: "That game no longer exists." });
      return;
    }
    const oldId = Object.keys(room.players).find(
      (id) => room.players[id].token === token
    );
    if (!oldId) {
      cb && cb({ ok: false, error: "Couldn't find your seat in that game." });
      return;
    }

    remapSocketId(room, oldId, socket.id);
    const player = room.players[socket.id];
    player.connected = true;
    socket.data.roomCode = code;
    socket.data.isHost = room.hostSocketId === socket.id;
    socket.join(code);
    // Deliberately not joining the player's zone room here - act:show below
    // (for explore acts) makes the client call player:changeZone on its
    // own, which does the full join/announce/roster handshake correctly.
    // Joining it early here would just mean that call becomes a same-zone
    // no-op and everyone else's client never learns this player is back.

    cb && cb({ ok: true, code, token, started: room.started });
    broadcastRoomState(code);

    if (room.started && room.actIndex >= 0) {
      const payload = buildActPayloadForPlayer(room, socket.id);
      io.to(socket.id).emit("act:show", payload);
      io.to(socket.id).emit("inventory:state", buildInventoryState(room, socket.id));
      io.to(socket.id).emit("evidence:state", buildEvidenceState(room));
      emitProgress(code);
    }
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

  // Elle records the walk-in as a real video rather than a scripted sprite
  // animation. Whoever clicks Play first triggers it for the whole room at
  // once (guarded so a second click can't restart it for everyone else
  // mid-watch).
  socket.on("stagedScene:playVideo", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.actState) return;
    if (room.actState.videoStarted) return;
    room.actState.videoStarted = true;
    io.to(code).emit("stagedScene:videoStarted");
  });

  socket.on("act:acknowledgeReveal", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || (act.type !== "reveal" && act.type !== "cutscene" && act.type !== "staged_scene")) return;
    room.actState.ackBy[socket.id] = true;
    emitProgress(code);
    const totalPlayers = connectedPlayerCount(room);
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

      const totalPlayers = connectedPlayerCount(room);
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
  socket.on("plate:enter", ({ zone, plateId, cellId, targetDoorZoneId, selfDoorZoneId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !plateId) return;
    const z = zone || "estate";

    // The map authors a default "next cell over" target for every plate,
    // but that assumes every cell has someone in it. room.dungeonChain
    // (computed fresh whenever this act started, see sendActToRoom) already
    // knows which cells are actually occupied for this party size, so it
    // takes priority whenever it has an answer - falling back to whatever
    // the client sent only if the chain wasn't computed for some reason.
    const realTargetDoorZoneId =
      (room.dungeonChain && cellId && room.dungeonChain[cellId]) || targetDoorZoneId;

    const playersHere = Object.values(room.players).filter(
      (p) => p.connected && (p.zone || "estate") === z
    ).length;

    if (playersHere <= 1) {
      const doorId = selfDoorZoneId || realTargetDoorZoneId;
      if (!doorId) return;
      io.to(`${code}:${z}`).emit("door:state", { doorZoneId: doorId, open: true });
      setTimeout(() => {
        io.to(`${code}:${z}`).emit("door:state", { doorZoneId: doorId, open: false });
      }, SOLO_PLATE_OPEN_MS);
      return;
    }

    if (!realTargetDoorZoneId) return;
    if (!room.zonePlates[z]) room.zonePlates[z] = {};
    let plate = room.zonePlates[z][plateId];
    if (!plate) {
      plate = { holders: new Set(), targetDoorZoneId: realTargetDoorZoneId, selfDoorZoneId };
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

  // Candle puzzle (Area 3, and any future reuse elsewhere keyed the same
  // way): interacting with a candle just flips it lit/unlit. No punishment
  // for a wrong guess - candles stay exactly as they are, the party can
  // fix one candle at a time or use the lever to wipe the board and start
  // over. The correct sequence lives in interactions.json, not here, same
  // as the Suspect Board's correctSet - map data stays purely structural.
  socket.on("candle:toggle", ({ zone, candleId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !candleId) return;
    const z = zone || "estate";
    const puzzle = (INTERACTIONS.candlePuzzles || {})[z];
    if (!puzzle) return;

    if (!room.zoneCandles[z]) room.zoneCandles[z] = { lit: {}, order: [] };
    const state = room.zoneCandles[z];

    if (state.lit[candleId]) {
      delete state.lit[candleId];
      state.order = state.order.filter((id) => id !== candleId);
    } else {
      state.lit[candleId] = true;
      state.order.push(candleId);
    }

    io.to(`${code}:${z}`).emit("candle:state", { lit: state.lit });

    const sequence = puzzle.sequence || [];
    const allLit = sequence.length > 0 && sequence.every((id) => state.lit[id]);
    if (allLit) {
      const correct =
        state.order.length === sequence.length &&
        state.order.every((id, i) => id === sequence[i]);
      if (correct) {
        state.solved = true;
        io.to(`${code}:${z}`).emit("door:state", { doorZoneId: puzzle.exitAnimZoneId, open: true });
        io.to(`${code}:${z}`).emit("explore:dialogue", {
          title: "",
          lines: ["You light all the torches... And hear a 'clunk' from the other side of the room."],
        });
      } else {
        io.to(`${code}:${z}`).emit("explore:dialogue", {
          title: "",
          lines: ["You light all the torches... But nothing happens."],
        });
      }
      // Wrong order: candles stay lit exactly as they are - the party can
      // toggle individual ones or pull the lever.
    }
  });

  // Petting an animal is purely cosmetic - broadcast to the zone so
  // everyone sees the heart pop up, but there's nothing to persist or
  // resync, unlike the candle puzzle's door state.
  socket.on("pet:animal", ({ zone, x, y }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || typeof x !== "number" || typeof y !== "number") return;
    const z = zone || "estate";
    io.to(`${code}:${z}`).emit("pet:animal", { x, y });
  });

  socket.on("candle:reset", ({ zone }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const z = zone || "estate";
    const puzzle = (INTERACTIONS.candlePuzzles || {})[z];
    if (!puzzle) return;
    const wasSolved = !!(room.zoneCandles[z] && room.zoneCandles[z].solved);
    room.zoneCandles[z] = { lit: {}, order: [], solved: wasSolved };
    io.to(`${code}:${z}`).emit("candle:state", { lit: {} });
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
    // Comparing zone *names* isn't enough to know this socket can skip the
    // join handshake below - a reconnecting player has a brand new socket
    // that was never actually a member of that zone's Socket.io room, even
    // though their stored zone (from before they dropped) still matches.
    if (oldZone === zone && socket.rooms.has(`${code}:${zone}`)) return;

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

    const candleState = room.zoneCandles[zone];
    socket.emit("candle:state", { lit: (candleState && candleState.lit) || {} });

    // If this puzzle's door was already opened before this player got here
    // (a straggler catching up, or a reconnect), their fresh client-side
    // zoneStates defaults the exit barrier back to closed. Nothing they can
    // relight would ever fix that, so the already-solved state has to be
    // pushed explicitly rather than only broadcast at the moment of solving.
    if (candleState && candleState.solved) {
      const puzzle = (INTERACTIONS.candlePuzzles || {})[zone];
      if (puzzle) {
        socket.emit("door:state", { doorZoneId: puzzle.exitAnimZoneId, open: true });
      }
    }
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

    // Fires the moment the last piece is actually found out in the field -
    // whichever player's pocket it's sitting in, whether or not it's been
    // walked back to the table yet - rather than waiting on someone to
    // separately place the last exhibit down. Once, ever, per act.
    if (act.completionMode === "evidence" && act.completionCount) {
      const totalFound = Object.keys(room.collectedPickups).length;
      if (totalFound >= act.completionCount && !room.actState.evidenceThorneShown) {
        room.actState.evidenceThorneShown = true;
        io.to(code).emit("thorne:message", { text: act.onEvidenceCompleteMessage || "" });
      }
    }
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
    const act = STORY.acts[room.actIndex];
    const state = act && act.type === "evidence_room" ? buildFullEvidenceState() : buildEvidenceState(room);
    socket.emit("evidence:state", state);
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
    const totalPlayers = connectedPlayerCount(room);
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
      io.to(code).emit("board:submitProgress", { ready: 0, total: connectedPlayerCount(room) });
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
    const totalPlayers = connectedPlayerCount(room);
    const ackCount = Object.keys(room.actState.ackBy).length;
    io.to(code).emit("board:submitProgress", { ready: ackCount, total: totalPlayers });
    if (ackCount < totalPlayers) return;

    evaluateBoardSubmit(room, code);
  });

  // A deliberate "not you" / "start a different game" click, distinct from
  // disconnect: this player is done with this room for good, so their seat
  // and token are actually removed instead of just being marked offline.
  socket.on("player:leave", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.players[socket.id]) return;

    const zone = room.players[socket.id].zone || "estate";
    delete room.players[socket.id];
    delete room.inventories[socket.id];
    if (room.actState) {
      delete room.actState.solvedBy[socket.id];
      delete room.actState.ackBy[socket.id];
    }
    room.joinOrder = room.joinOrder.filter((id) => id !== socket.id);
    Object.values(room.zonePlates || {}).forEach((plates) => {
      Object.values(plates).forEach((plate) => {
        if (plate.holders.has(socket.id)) plate.holders.delete(socket.id);
      });
    });

    socket.to(`${code}:${zone}`).emit("zone:playerLeft", { id: socket.id });
    socket.leave(code);
    socket.leave(`${code}:${zone}`);
    socket.data.roomCode = null;
    broadcastRoomState(code);
    recheckGroupThreshold(room, code);
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
      recheckGroupThreshold(room, code);
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
