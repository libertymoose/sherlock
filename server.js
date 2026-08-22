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
    lobbyPositions: room.lobbyPositions || {},
  });
}

function orderedPlayerIds(room) {
  // Stable order based on join order, used for assigning fragments/puzzles round-robin
  return room.joinOrder.filter((id) => room.players[id]);
}

// Mirrors client.js's ZONE_MAPS for the dungeon arc specifically. Needed so
// a reconnecting player can be sent back to the actual room they were
// standing in (jail, a specific dungeon area, a Stores sub-room) instead of
// always restarting the whole "explore" act at its default mapUrl/zone -
// previously a refresh mid-dungeon always bounced a player back to
// jail_cells, regardless of how far in they'd gotten.
const DUNGEON_ZONE_MAPS = {
  jail_cells: "/assets/maps/jail_cells.json",
  dungeon_area_2: "/assets/maps/dungeon_area_2.json",
  dungeon_area_3: "/assets/maps/dungeon_area_3.json",
  dungeon_area_4: "/assets/maps/dungeon_area_4.json",
  dungeon_area_4_kennels: "/assets/maps/dungeon_area_4_kennels.json",
  dungeon_area_4_ossuary: "/assets/maps/dungeon_area_4_ossuary.json",
  dungeon_area_4_treasury: "/assets/maps/dungeon_area_4_treasury.json",
  dungeon_area_4_lower_stores: "/assets/maps/dungeon_area_4_lower_stores.json",
  dungeon_area_5: "/assets/maps/dungeon_area_5.json",
  dungeon_area_6: "/assets/maps/dungeon_area_6.json",
  dungeon_finale: "/assets/maps/dungeon_finale.json",
  outside_sewer: "/assets/maps/outside_sewer.json",
};

// How far along the dungeon's one-way chain each zone counts as - used
// only to detect a party member falling behind, never to gate movement.
// The four Area 4 side-rooms are detours off the same hub, not forward
// progress in their own right, so they share Area 4's own rank rather
// than getting one of their own.
const DUNGEON_PROGRESS_ORDER = [
  "jail_cells", "dungeon_area_2", "dungeon_area_3", "dungeon_area_4",
  "dungeon_area_5", "dungeon_area_6", "dungeon_finale", "outside_sewer",
];
const DUNGEON_SUBROOM_CANONICAL = {
  dungeon_area_4_kennels: "dungeon_area_4",
  dungeon_area_4_ossuary: "dungeon_area_4",
  dungeon_area_4_treasury: "dungeon_area_4",
  dungeon_area_4_lower_stores: "dungeon_area_4",
};
function dungeonProgressRank(zone) {
  const canonical = DUNGEON_SUBROOM_CANONICAL[zone] || zone;
  return DUNGEON_PROGRESS_ORDER.indexOf(canonical);
}

// Superset of DUNGEON_ZONE_MAPS used only by host:skipZonePuzzle below - the
// dungeon arc is the described use case, but the estate's own sub-buildings
// can carry barrier-gated puzzles too (or might in the future), so a skip
// request works the same way anywhere a barrier exists, not just underground.
// Deliberately not merged into DUNGEON_ZONE_MAPS itself, since that table's
// existing reconnect-position logic is scoped tightly to the dungeon arc on
// purpose and shouldn't start matching estate sub-zones too.
const ALL_ZONE_MAPS = {
  ...DUNGEON_ZONE_MAPS,
  barn_interior: "/assets/maps/barn_interior.json",
  dock_interior: "/assets/maps/dock_interior.json",
  manor_ground: "/assets/maps/manor_ground.json",
  manor_upper: "/assets/maps/manor_upper.json",
  guild_hall_ground: "/assets/maps/guild_hall_ground.json",
  guild_hall_upper: "/assets/maps/guild_hall_upper.json",
  guild_hall_exterior: "/assets/maps/guild_hall_exterior.json",
  herbalist_hut_exterior: "/assets/maps/herbalist_hut_exterior.json",
  herbalist_interior: "/assets/maps/herbalist_interior.json",
  // The rest of the Act 3 town, added together after finding they were
  // all missing at once - any transition between these that wasn't the
  // current act's own starting zone (moving between tavern floors,
  // entering the blacksmith/chapel/glass workshop, moving between mage
  // tower floors) was silently resolving to an undefined mapUrl.
  town_exterior: "/assets/maps/town_exterior.json",
  training_ground: "/assets/maps/training_ground.json",
  tavern_1st_floor: "/assets/maps/tavern_1st_floor.json",
  tavern_2nd_floor: "/assets/maps/tavern_2nd_floor.json",
  blacksmith_interior: "/assets/maps/blacksmith_interior.json",
  chapel_interior: "/assets/maps/chapel_interior.json",
  glass_workshop: "/assets/maps/glass_workshop.json",
  mage_tower_basement: "/assets/maps/mage_tower_basement.json",
  mage_tower_1st_floor: "/assets/maps/mage_tower_1st_floor.json",
  mage_tower_2nd_floor: "/assets/maps/mage_tower_2nd_floor.json",
};

function buildActPayloadForPlayer(room, socketId) {
  const act = STORY.acts[room.actIndex];
  if (!act) return null;
  const base = {
    index: room.actIndex,
    total: STORY.acts.length,
    type: act.type,
    title: act.title,
    chapter: act.chapter || 1,
    // Both default to hidden. Only the acts that actually explicitly ask
    // for them show either HUD button - this was true in spirit already
    // (no act set these before now), just making it literal so the intent
    // reads clearly here rather than only in client.js's toggle call.
    showBoard: !!act.showBoard,
    showVote: !!act.showVote,
  };

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
      playerWalkPath: act.playerWalkPath || null,
      actors: act.actors || [],
      dialogue: act.dialogue || [],
      fadeIn: !!act.fadeIn,
      fadeOut: !!act.fadeOut,
      cameraCenter: act.cameraCenter || null,
      playerSortBoost: act.playerSortBoost || 0,
      nextActEyebrow: act.nextActEyebrow || null,
      nextActTitle: act.nextActTitle || null,
    };
  }

  if (act.type === "final") {
    return { ...base, body: act.body };
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
    // Default to the act's configured entry point, but if this player was
    // already deeper in the dungeon chain when they disconnected/refreshed,
    // send them back to that actual room instead of restarting at the top.
    let mapUrl = act.mapUrl;
    let zone = act.zone || "estate";
    const lastZone = room.players[socketId] && room.players[socketId].zone;
    if (lastZone && DUNGEON_ZONE_MAPS[lastZone] && DUNGEON_ZONE_MAPS[act.zone]) {
      mapUrl = DUNGEON_ZONE_MAPS[lastZone];
      zone = lastZone;
    }
    return {
      ...base,
      mapUrl,
      zone,
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

  if (act.type === "finale_accusation") {
    // All the actual content (the passage, word-bank options, defense/
    // pushback lines) lives in interactions.json under finaleAccusation,
    // same pattern as evidence_room pulling suspectBoard.pool from there -
    // story.json only needs to say which act this is.
    const fa = INTERACTIONS.finaleAccusation || {};
    // Same reasoning as the Suspect Board never sending correctSet to the
    // client: strip each blank's `correct` key before it goes out, so the
    // answer isn't sitting in a devtools-readable payload. Checking still
    // happens server-side only, in evaluateFinaleSubmit.
    const clientBlanks = {};
    for (const [key, def] of Object.entries(fa.blanks || {})) {
      clientBlanks[key] = { label: def.label, options: def.options };
    }
    return {
      ...base,
      introThorne: fa.introThorne || null,
      passageTemplate: fa.passageTemplate || "",
      blankOrder: fa.blankOrder || [],
      blanks: clientBlanks,
      selections: room.actState.finaleSelections || {},
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
    // Shared, party-wide picks for the finale accusation's word-bank
    // blanks (WHO/PLANT/MOTIVE/OPPORTUNITY) - same "everyone edits one
    // shared answer" pattern as boardZone above, not per-player.
    finaleSelections: {},
    finaleAwaitingContinue: false,
  };
  // The Herbalist's Hut cauldron puzzle - one attempt live at a time,
  // reset by the "Try Again" flow. Scoped per-act like everything else
  // above, since a stale correct/wrong state from a previous act would
  // make no sense once the party's moved on.
  room.cauldron = { status: "idle", submittedItemId: null, heldBy: null };
  room.dungeonChain = null;
  room.zonePlates = {};
  room.zoneCandles = {};
  room.zoneDoors = {};
  room.zoneSimpleLevers = {};
  room.zoneSearches = {};
  room.zoneForcedOpenBarriers = {};
  // Fresh start for Point the Finger every time an act begins, not just
  // the vote-completion one - harmless to reset even on acts that never
  // touch it, and avoids a stale vote leaking into a later act if the
  // story ever revisits this one.
  room.vote = { picks: {}, cleared: [] };

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
  // Personal inventory is scoped to the act it was gathered in (plant
  // specimens, quotes, keys) - unlike the Evidence Table, which is a
  // separate, explicitly cross-act mechanic, nothing in a player's own
  // inventory is meant to carry forward once an act ends. Clearing here
  // means it can never be forgotten for a future act the way it was
  // before - every act boundary goes through this one function.
  room.inventories = {};
  for (const socketId of Object.keys(room.players)) {
    io.to(socketId).emit("inventory:state", []);
  }
  sendActToRoom(code);
  broadcastRoomState(code);
}

// Every path that ends an "explore" act's completion condition - however
// different they are (a vote, everyone reaching the same forward zone,
// the evidence table filling up) - should end the same way: the screen
// fades to black first, on every connected player's client regardless of
// which sub-zone they're currently in, THEN (once that fade has actually
// finished, not the instant it starts) the next act loads. Three separate
// completion paths used to each remember to do this themselves; one of
// them (the evidence-gated Estate) didn't, so that transition alone had
// no fade and could yank the screen straight into a cutscene while a
// dialogue box was still sitting open. Centralized here instead so this
// can't be forgotten again the next time a fourth completion mode exists.
function fadeAndAdvanceAct(code) {
  const room = rooms[code];
  if (!room || room.actState.transitioning) return;
  room.actState.transitioning = true;
  io.to(code).emit("scene:fadeToBlack");
  setTimeout(() => advanceAct(code), 1100);
}

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

// Area 4's Kennels/Ossuary/Treasury doors read as closed until someone's
// actually inside, open while occupied - same open/close state machine as
// the Lower Stores door (setRemoteDoorPhase via door:state), just driven by
// room occupancy instead of a lock. No door tile art exists for these three
// yet (per Elle), so this has no visual effect until gatedCells/tile art is
// added in a future Tiled pass, but the mechanism is real and correct now -
// it'll "just work" the moment that art lands. Broadcast to dungeon_area_4
// specifically, since that's the only zone anyone would actually see the
// door from.
const OCCUPANCY_DOORS = {
  dungeon_area_4_kennels: "door_area4_kennels",
  dungeon_area_4_ossuary: "door_area4_ossuary",
  dungeon_area_4_treasury: "door_area4_treasury",
};

function updateOccupancyDoor(room, code, zone) {
  const doorZoneId = OCCUPANCY_DOORS[zone];
  if (!doorZoneId) return;
  const occupied = Object.values(room.players).some(
    (p) => p.connected && (p.zone || "estate") === zone
  );
  io.to(`${code}:dungeon_area_4`).emit("door:state", { doorZoneId, open: occupied });
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

// WHO is checked in total isolation first - naming the wrong suspect
// makes the rest of the accusation moot, and gets that suspect's own
// in-character defense line rather than being folded into Hook's vague
// pushback below. Once WHO is right, PLANT/MOTIVE/OPPORTUNITY are checked
// together and only ever return a count of how many are wrong, never
// which ones - same "vague pushback, no specifics" principle as the
// Suspect Board's own wrong-answer messages.
function evaluateFinaleSubmit(room, code) {
  const fa = INTERACTIONS.finaleAccusation || {};
  const sel = room.actState.finaleSelections || {};

  const whoBlank = fa.blanks && fa.blanks.WHO;
  if (whoBlank && sel.WHO !== whoBlank.correct) {
    room.actState.ackBy = {};
    const defenseLine = (fa.suspectDefenses && fa.suspectDefenses[sel.WHO])
      || "\"That's not who did it,\" comes the flat reply.";
    io.to(code).emit("finale:result", { correct: false, kind: "wrongWho", text: defenseLine });
    return;
  }

  const otherBlanks = (fa.blankOrder || []).filter((b) => b !== "WHO");
  const wrongCount = otherBlanks.filter((b) => {
    const def = fa.blanks[b];
    return def && sel[b] !== def.correct;
  }).length;

  if (wrongCount > 0) {
    room.actState.ackBy = {};
    const pushback = (fa.hookPushback && fa.hookPushback[String(wrongCount)])
      || (fa.hookPushback && fa.hookPushback["3"])
      || "Something here isn't right.";
    io.to(code).emit("finale:result", { correct: false, kind: "wrongOther", text: pushback });
    return;
  }

  // Correct. Unlike the Suspect Board (a short setTimeout is fine there,
  // the result message is one line), this is the game's actual climax -
  // the party should get to sit with "you got it" for as long as they
  // want, not have Case Closed yanked up automatically a few seconds
  // later. Wait for an explicit party-wide acknowledgment instead (same
  // ackBy pattern as reveal/cutscene acts) before ever advancing.
  room.actState.ackBy = {};
  room.actState.finaleAwaitingContinue = true;
  io.to(code).emit("finale:result", { correct: true, text: fa.correctResult || "" });
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
  } else if (act.type === "finale_accusation") {
    const ackCount = Object.keys(room.actState.ackBy || {}).length;
    if (room.actState.finaleAwaitingContinue) {
      // Everyone still connected has already clicked "Continue" on the
      // correct result - a departing straggler shouldn't be the only
      // thing still blocking the party from moving on.
      if (ackCount > 0 && ackCount >= totalPlayers) {
        io.to(code).emit("finale:continueProgress", { ready: ackCount, total: totalPlayers });
        fadeAndAdvanceAct(code);
      }
      return;
    }
    const fa = INTERACTIONS.finaleAccusation || {};
    const sel = room.actState.finaleSelections || {};
    const allChosen = (fa.blankOrder || []).every((b) => !!sel[b]);
    if (allChosen && ackCount > 0 && ackCount >= totalPlayers) {
      io.to(code).emit("finale:submitProgress", { ready: ackCount, total: totalPlayers });
      evaluateFinaleSubmit(room, code);
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
  rekey(room.lobbyPositions);
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

// Fresh boardCards keyed by every clue id in INTERACTIONS.boardClues, all
// starting uncollected and in the tray. Built from the manifest so the
// "X/Y found" total is always accurate even for clues whose source NPC
// doesn't exist as real content yet (Wave 2 town locations) - those clues
// just never leave 0 until that content is built.
function initBoardCards() {
  const cards = {};
  (INTERACTIONS.boardClues || []).forEach((c) => {
    cards[c.id] = { collected: false, placement: "tray", ignored: false, claimedBy: null };
  });
  return cards;
}

function buildBoardState(room) {
  const manifest = INTERACTIONS.boardClues || [];
  const clues = {};
  manifest.forEach((c) => {
    const card = room.boardCards[c.id] || { collected: false, placement: "tray", ignored: false, claimedBy: null };
    clues[c.id] = {
      id: c.id,
      suspectId: c.suspectId,
      category: c.category,
      title: c.title,
      text: c.text,
      source: c.source,
      collected: card.collected,
      placement: card.placement,
      ignored: card.ignored,
      claimedBy: card.claimedBy,
    };
  });
  const foundCount = manifest.filter((c) => room.boardCards[c.id] && room.boardCards[c.id].collected).length;
  return { clues, total: manifest.length, foundCount };
}

// Marks a clue collected if it isn't already and broadcasts the new count
// to the whole room - shared by the generic single-stage hook and the
// two-stage dialogue resolver below, since both need identical behavior.
function collectBoardClue(code, clueId) {
  const room = rooms[code];
  if (!room || !clueId) return;
  const card = room.boardCards[clueId];
  if (!card || card.collected) return;
  card.collected = true;
  io.to(code).emit("board3:state", buildBoardState(room));
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
      // factId -> true. Party-wide and persistent across acts and zones,
      // same reasoning as evidence above - a trigger fact learned from one
      // NPC (e.g. the Mage Tower apprentice mentioning the cold forge) has
      // to still be known when a different player later talks to a
      // completely different NPC (the Blacksmith) in a different zone. Not
      // reset per-act like zoneCandles/zoneDoors/etc below, since the whole
      // point is it survives the wave-to-wave Guild Hall round trips.
      knownFacts: {},
      // clueId -> { collected, placement, ignored, claimedBy }. Same
      // persistence reasoning as knownFacts/evidence above - the whole
      // point of the board is that clues found in Wave 1 are still there
      // once the party reaches Wave 2 and beyond.
      boardCards: initBoardCards(),
      // Point the Finger. picks: socketId -> suspectKey, private until
      // everyone connected has voted. cleared: suspectKeys ruled out by a
      // wrong majority already, permanently unselectable for the rest of
      // the room's life (matches the spec: a cleared suspect stays cleared,
      // the party narrows down across re-votes rather than starting over).
      vote: { picks: {}, cleared: [] },
      // zone -> plateId -> { holders: Set<socketId>, targetDoorZoneId, selfDoorZoneId }
      zonePlates: {},
      // zone -> { lit: { candleId: true }, order: [candleId, ...] } - the
      // candle puzzle (Area 3). order tracks the actual lighting sequence so
      // wrong-order attempts can be told apart from the right one once all
      // four happen to be lit at once.
      zoneCandles: {},
      // zone -> { doorId: true } - item-gated doors (e.g. Area 4's Lower
      // Stores door), opened once and persisted per zone, same resync
      // pattern as zoneCandles' solved flag.
      zoneDoors: {},
      // zone -> true - plain one-shot levers with no puzzle/reset state to
      // track (e.g. the sewer finale grate), just "has this been pulled
      // yet", same resync pattern as zoneDoors/zoneCandles' solved flag.
      zoneSimpleLevers: {},
      // zone -> { searchId: count } - two-stage search spots (Area 4's
      // hidden chest key): first interact shows a decoy line, second
      // interact (by anyone, shared party-wide like everything else here)
      // reveals the item and removes the object.
      zoneSearches: {},
      // zone -> { animZoneId: true } - barriers the host force-opened via
      // "Skip this step", independent of whatever puzzle actually governs
      // them (candle, lever, locked door...). Kept separate from those
      // puzzles' own solved-state so a skip never has to know or fake which
      // puzzle type is behind a given barrier, it just adds a second,
      // always-open layer on top. Same resync-on-entry pattern as the rest.
      zoneForcedOpenBarriers: {},
      // socketId -> { x, y, dir, moving }. Live positions for the
      // pre-game waiting room's walkable pen (no map, no collision, just
      // an open area for characters to mill around in before the host
      // begins). Only meaningful while room.started is false - see
      // lobby:move below. Not persisted anywhere beyond the room's own
      // lifetime, same as everything else here.
      lobbyPositions: {},
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
    const cleanName = String(name || "Detective").trim().slice(0, 24) || "Detective";
    if (room.started) {
      // First check: is this the fallback path for a returning player
      // whose automatic reconnect (player:rejoin, keyed on a token saved
      // in that browser's own localStorage) can't run - a different
      // device, a cleared browser, a lost tab. If their name matches an
      // existing seat that's currently disconnected, treat this exactly
      // like a rejoin - same seat, same inventory, same act - rather
      // than leaving them locked out with no way back in except finding
      // the original device again.
      const oldId = Object.keys(room.players).find(
        (id) => !room.players[id].connected &&
          room.players[id].name.toLowerCase() === cleanName.toLowerCase()
      );
      if (oldId) {
        const token = genToken();
        remapSocketId(room, oldId, socket.id);
        const player = room.players[socket.id];
        player.connected = true;
        player.token = token;
        socket.data.roomCode = code;
        socket.data.isHost = room.hostSocketId === socket.id;
        socket.join(code);
        cb && cb({ ok: true, code, token, started: true });
        broadcastRoomState(code);
        if (room.actIndex >= 0) {
          const payload = buildActPayloadForPlayer(room, socket.id);
          io.to(socket.id).emit("act:show", payload);
          io.to(socket.id).emit("inventory:state", buildInventoryState(room, socket.id));
          io.to(socket.id).emit("evidence:state", buildEvidenceState(room));
          emitProgress(code);
        }
        return;
      }

      // Genuinely new player, joining after the game already began.
      // Allowed at any point in the story - the party's evidence, board
      // state, and shared progress all live on the room itself, not on
      // any one player, so a latecomer isn't blocked by anything they
      // missed. They get a fresh seat and an empty private inventory
      // (evidence they didn't personally collect just isn't theirs to
      // hold, the shared Evidence Table/board are unaffected).
      //
      // zone is deliberately left null rather than set to the act's zone
      // here, and the socket isn't pre-joined to that zone's socket.io
      // room either. act:show below drives the client's own
      // enterExplore/enterStagedScene, which always positions a fresh
      // player at that map's own spawn point (so this is what actually
      // gets them "to the entrance" of wherever the story is) and calls
      // player:changeZone the moment it loads, which is what does the
      // real join (zone:playerEntered announce, roster sync, occupancy-
      // gated doors). If this handler pre-set zone/room to match what
      // that call is about to send, changeZone's own early-exit guard
      // ("already in that zone's room") would fire and silently skip all
      // of that setup for a player nobody else was ever told had arrived.
      const token = genToken();
      room.players[socket.id] = {
        id: socket.id,
        name: cleanName,
        gender: cleanGender(gender),
        color: cleanColor(color),
        connected: true,
        zone: null,
        token,
      };
      room.joinOrder.push(socket.id);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.isHost = false;
      cb && cb({ ok: true, code, token, started: true });
      broadcastRoomState(code);
      if (room.actIndex >= 0) {
        const payload = buildActPayloadForPlayer(room, socket.id);
        io.to(socket.id).emit("act:show", payload);
        io.to(socket.id).emit("inventory:state", buildInventoryState(room, socket.id));
        io.to(socket.id).emit("evidence:state", buildEvidenceState(room));
        emitProgress(code);
      }
      return;
    }
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
    // Every other chapter transition gets a real, dedicated black title
    // card (eyebrow + title + a party-wide ready button, no body text)
    // before its content loads - chapter 1 was the one exception, jumping
    // straight into "The Gala" with no card of its own. actIndex stays at
    // -1 (no real story act yet) until everyone's acknowledged this card;
    // game:acknowledgeStart is what actually loads act 0.
    room.actIndex = -1;
    room.gameStartAck = {};
    io.to(code).emit("game:titleCard", { eyebrow: "Act I", title: "The Gala" });
    broadcastRoomState(code);
  });

  socket.on("game:acknowledgeStart", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.started || room.actIndex !== -1) return;
    room.gameStartAck[socket.id] = true;
    const totalPlayers = connectedPlayerCount(room);
    const ackCount = Object.keys(room.gameStartAck).length;
    io.to(code).emit("game:titleCardProgress", { acknowledged: ackCount, total: totalPlayers });
    if (ackCount >= totalPlayers) {
      room.actIndex = 0;
      sendActToRoom(code);
    }
  });

  // Pre-game waiting room only: no map, no collision, just live position
  // broadcast so guests see each other milling around the pen before the
  // host begins. Deliberately a no-op once the game has actually started -
  // that's the overworld engine's job from there, this is just the lobby.
  socket.on("lobby:move", (data) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.started || !room.players[socket.id]) return;
    const x = Number(data && data.x);
    const y = Number(data && data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const dir = ["down", "left", "right", "up"].includes(data && data.dir) ? data.dir : "down";
    const moving = !!(data && data.moving);
    room.lobbyPositions[socket.id] = { x, y, dir, moving };
    socket.to(code).emit("lobby:move", { id: socket.id, x, y, dir, moving });
  });

  socket.on("host:advanceAct", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.hostSocketId !== socket.id) return;
    advanceAct(code);
  });

  // A lighter-weight escape hatch than host:advanceAct: instead of jumping
  // to the next story act entirely, this just force-opens whatever barrier
  // is currently blocking the room(s) the party is standing in, so they can
  // walk forward on their own rather than skipping the whole chapter. Reads
  // real barrier data off the actual map file, same as the puzzles that
  // normally open them, rather than guessing which zone is "stuck" - so it
  // stays correct no matter which room, or how many different rooms
  // different players are currently in, since movement between dungeon
  // rooms is per-player, not synced.
  socket.on("host:skipZonePuzzle", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.hostSocketId !== socket.id) return;
    const act = STORY.acts[room.actIndex];
    if (!act) return;

    if (act.type !== "explore") {
      advanceAct(code);
      return;
    }

    const zones = new Set();
    for (const p of Object.values(room.players)) {
      if (p.zone) zones.add(p.zone);
    }
    if (!zones.size && act.zone) zones.add(act.zone);

    let clearedAny = false;
    for (const zone of zones) {
      const mapUrl = zone === act.zone ? act.mapUrl : ALL_ZONE_MAPS[zone];
      const mapData = loadMapData(mapUrl);
      if (!mapData || !mapData.barriers || !mapData.barriers.length) continue;
      clearedAny = true;
      if (!room.zoneForcedOpenBarriers[zone]) room.zoneForcedOpenBarriers[zone] = {};
      for (const b of mapData.barriers) {
        room.zoneForcedOpenBarriers[zone][b.animZoneId] = true;
        io.to(`${code}:${zone}`).emit("door:state", { doorZoneId: b.animZoneId, open: true });
      }
      io.to(`${code}:${zone}`).emit("explore:dialogue", {
        title: "",
        lines: ["The way ahead has been cleared."],
      });
    }

    // Nothing to skip in the estate specifically (it completes on evidence
    // count, not a barrier) - and nowhere else in this explore act had a
    // barrier either (a plain traversal room, or everyone's already past
    // every gate). Either way there's no puzzle in front of anyone right
    // now, so the useful thing "skip" can still do is move the story on.
    if (!clearedAny) {
      advanceAct(code);
    }
  });

  // The inverse of host:skipZonePuzzle: instead of forcing a zone's
  // barriers open, this wipes whatever puzzle state is behind them
  // (candle sequence, lever pull, locked-door unlock, or a prior skip)
  // back to fresh and re-closes the barriers. Scoped to the same
  // barrier-gated puzzle types skip covers - it does not touch
  // search-twice or locked-container puzzles, since those destroy a map
  // object and hand an item into a player's inventory rather than
  // gating a barrier, undoing that would mean un-deleting objects and
  // clawing items back out of inventories, a different feature.
  socket.on("host:resetZonePuzzle", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.hostSocketId !== socket.id) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "explore") return;

    const zones = new Set();
    for (const p of Object.values(room.players)) {
      if (p.zone) zones.add(p.zone);
    }
    if (!zones.size && act.zone) zones.add(act.zone);

    for (const zone of zones) {
      const mapUrl = zone === act.zone ? act.mapUrl : ALL_ZONE_MAPS[zone];
      const mapData = loadMapData(mapUrl);
      if (!mapData || !mapData.barriers || !mapData.barriers.length) continue;

      delete room.zoneCandles[zone];
      delete room.zoneDoors[zone];
      delete room.zoneSimpleLevers[zone];
      delete room.zoneForcedOpenBarriers[zone];

      for (const b of mapData.barriers) {
        io.to(`${code}:${zone}`).emit("door:state", { doorZoneId: b.animZoneId, open: false });
      }
      io.to(`${code}:${zone}`).emit("candle:state", { lit: {} });
      io.to(`${code}:${zone}`).emit("explore:dialogue", {
        title: "",
        lines: ["The Host has reset this room's puzzle."],
      });
    }
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
  // Party-wide trigger facts (Means and Opportunity's split-knowledge town
  // gathering): learning a fact is purely a server-side flag flip, nothing
  // to broadcast or resync since it has no visual representation on the
  // map like the candle/door states do - it only ever matters at the
  // moment someone later talks to a two-stage NPC, handled below.
  socket.on("fact:learn", ({ factId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !factId) return;
    room.knownFacts[factId] = true;
  });

  // Two-stage NPC dialogue: which of the two dialogue entries to show
  // depends on party-wide fact state, so unlike the plain "dialogue" kind
  // (fully client-side, static content) this needs a real round trip.
  // Response goes to the requesting socket only, not broadcast to the
  // zone - this is one player asking a question, not a shared event like
  // lighting a candle everyone can see happen.
  socket.on("npc:twoStageDialogue", ({ npcId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !npcId) return;
    const config = (INTERACTIONS.twoStageDialogues || {})[npcId];
    if (!config) return;
    const known = !!room.knownFacts[config.requiresFact];
    const entryId = known ? config.revealDialogueId : config.surfaceDialogueId;
    const entry = INTERACTIONS[entryId];
    if (!entry) return;
    socket.emit("npc:dialogue", { title: entry.title, lines: entry.lines });
    // Whichever stage the player actually saw is the clue they now hold,
    // not both - matches the board's design (a card represents what you
    // actually learned, the surface story and the reveal are different
    // claims, not the same one twice).
    collectBoardClue(code, known ? config.revealClueId : config.surfaceClueId);
    // Some two-stage reveals are themselves a trigger fact for a different
    // NPC further down the chain (the Glassblower's reveal unlocking the
    // Inn's serving girl, for instance). Only fires on the reveal stage,
    // never the surface stage - you have to have actually heard the
    // reveal, not just visited the NPC.
    if (known && config.revealTeachesFact) {
      room.knownFacts[config.revealTeachesFact] = true;
    }
  });

  // Generic hook for single-stage clue-bearing interactions (fighters, the
  // dragon statue, anything wired with boardClueId directly rather than
  // going through the two-stage system above).
  socket.on("board:clueFound", ({ clueId }) => {
    const code = socket.data.roomCode;
    collectBoardClue(code, clueId);
  });

  socket.on("board3:requestState", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    socket.emit("board3:state", buildBoardState(room));
  });

  // Claiming is a light lock, not ownership of the card's content - it
  // only exists to stop two players from both dragging the same card at
  // once, same "first request wins" pattern already used for inventory
  // pickups and evidence adds. Broadcasts a small claim-only message
  // rather than full board state, since every other client just needs to
  // know "don't grab this one right now," not re-render everything.
  socket.on("board3:claimCard", ({ clueId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !clueId) return;
    const card = room.boardCards[clueId];
    if (!card || !card.collected || card.claimedBy) return;
    card.claimedBy = socket.id;
    io.to(code).emit("board3:claimed", { clueId, playerId: socket.id });
  });

  socket.on("board3:releaseCard", ({ clueId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !clueId) return;
    const card = room.boardCards[clueId];
    if (!card || card.claimedBy !== socket.id) return;
    card.claimedBy = null;
    io.to(code).emit("board3:claimed", { clueId, playerId: null });
  });

  const BOARD_SUSPECT_IDS = new Set((INTERACTIONS.boardFinalists || []).map((f) => f.key));

  socket.on("board3:placeCard", ({ clueId, placement }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !clueId) return;
    const card = room.boardCards[clueId];
    if (!card || !card.collected) return;
    // A drop finalizes the move regardless of who currently holds the
    // claim - the dragging player's own drop always wins over a stale
    // claim, and this also self-heals a client that never sent a release.
    if (placement === "tray") {
      card.placement = "tray";
    } else if (
      placement && typeof placement === "object" &&
      BOARD_SUSPECT_IDS.has(placement.suspectId) &&
      (placement.category === "means" || placement.category === "opportunity")
    ) {
      card.placement = { suspectId: placement.suspectId, category: placement.category };
    } else {
      return;
    }
    card.claimedBy = null;
    io.to(code).emit("board3:state", buildBoardState(room));
  });

  socket.on("board3:toggleIgnore", ({ clueId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !clueId) return;
    const card = room.boardCards[clueId];
    if (!card || !card.collected) return;
    card.ignored = !card.ignored;
    io.to(code).emit("board3:state", buildBoardState(room));
  });

  // Point the Finger. A suspect can only be voted for once at least one
  // card has been placed against them on the board (means or opportunity,
  // either counts) - a light guard against a zero-effort vote, not a real
  // gate. Picks stay private (only who's voted, not what) until everyone
  // connected has cast one, then everything reveals at once, tagged in
  // each voter's own color. This mirrors the spec's Among Us framing:
  // the vote itself is the submission, there's no separate confirm step.
  function hasBoardSupport(room, suspectKey) {
    return Object.values(room.boardCards).some(
      (card) => card.placement && typeof card.placement === "object" && card.placement.suspectId === suspectKey
    );
  }

  function buildVoteState(room) {
    return {
      votedIds: Object.keys(room.vote.picks),
      total: connectedPlayerCount(room),
      cleared: room.vote.cleared,
    };
  }

  // Shared by vote:cast and the disconnect handler below - if the last
  // holdout drops connection instead of voting, the party still isn't
  // stuck waiting on someone who's gone, same reasoning as
  // recheckGroupThreshold for the Evidence Room's ready-vote.
  function tryResolveVote(room, code) {
    const connectedIds = Object.entries(room.players)
      .filter(([, p]) => p.connected)
      .map(([id]) => id);
    const allVoted = connectedIds.length > 0 && connectedIds.every((id) => room.vote.picks[id]);
    if (!allVoted) return;

    // Tally. Ties (including a tie for the top spot among 3+ options)
    // clear nobody and just send the party back to vote again, per spec.
    const tally = {};
    for (const id of connectedIds) {
      const pick = room.vote.picks[id];
      tally[pick] = (tally[pick] || 0) + 1;
    }
    const maxVotes = Math.max(...Object.values(tally));
    const topPicks = Object.keys(tally).filter((k) => tally[k] === maxVotes);

    const reveal = connectedIds.map((id) => ({
      id,
      name: room.players[id].name,
      color: room.players[id].color,
      suspectId: room.vote.picks[id],
    }));

    if (topPicks.length > 1) {
      room.vote.picks = {};
      io.to(code).emit("vote:result", { outcome: "tie", tally, reveal, cleared: room.vote.cleared });
      return;
    }

    const winner = topPicks[0];
    if (winner === "ashgate") {
      io.to(code).emit("vote:result", { outcome: "correct", tally, reveal, cleared: room.vote.cleared });
      const act = STORY.acts[room.actIndex];
      if (act && act.type === "explore" && act.completionMode === "vote" && !room.actState.transitioning) {
        fadeAndAdvanceAct(code);
      }
      return;
    }

    // Wrong majority: that suspect is cleared for good, party re-votes
    // among whoever's left.
    room.vote.cleared.push(winner);
    room.vote.picks = {};
    io.to(code).emit("vote:result", { outcome: "cleared", clearedSuspect: winner, tally, reveal, cleared: room.vote.cleared });
  }

  socket.on("vote:requestState", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    socket.emit("vote:state", buildVoteState(room));
  });

  socket.on("vote:cast", ({ suspectId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !suspectId) return;
    if (!BOARD_SUSPECT_IDS.has(suspectId)) return;
    if (room.vote.cleared.includes(suspectId)) return;
    if (!hasBoardSupport(room, suspectId)) {
      socket.emit("vote:rejected", { reason: "no_support" });
      return;
    }
    room.vote.picks[socket.id] = suspectId;
    io.to(code).emit("vote:state", buildVoteState(room));
    tryResolveVote(room, code);
  });

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
    if (!puzzle) {
      // Not every lever is a torch-sequence puzzle - a plain lever (like
      // the sewer grate) has nothing to reset, it just opens its door
      // directly the moment it's pulled, every time, no wrong-order state
      // to track.
      const simple = (INTERACTIONS.simpleLevers || {})[z];
      if (!simple) return;
      room.zoneSimpleLevers[z] = true;
      io.to(`${code}:${z}`).emit("door:state", { doorZoneId: simple.exitAnimZoneId, open: true });
      const pullerName = room.players[socket.id]?.name || "Someone";
      io.to(`${code}:${z}`).emit("explore:dialogue", {
        title: "",
        lines: [`${pullerName} pulled the lever, and the sewer gate lifts with a clunk.`],
      });
      return;
    }
    const wasSolved = !!(room.zoneCandles[z] && room.zoneCandles[z].solved);
    room.zoneCandles[z] = { lit: {}, order: [], solved: wasSolved };
    io.to(`${code}:${z}`).emit("candle:state", { lit: {} });
  });

  // Item-gated doors (Area 4's Lower Stores door and any future reuse):
  // interacting checks the player's own inventory for the required item,
  // same "map data stays purely structural" split as the candle puzzle -
  // the required item id lives in interactions.json's lockedDoors, not
  // on the map object itself.
  socket.on("door:unlock", ({ zone, doorId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !doorId) return;
    const z = zone || "estate";
    const lock = (INTERACTIONS.lockedDoors || {})[doorId];
    if (!lock) return;

    if (!room.zoneDoors[z]) room.zoneDoors[z] = {};
    if (room.zoneDoors[z][doorId]) return; // already open

    const has = getInventory(room, socket.id).some((it) => it.itemId === lock.requiresItem);
    if (has) {
      room.zoneDoors[z][doorId] = true;
      io.to(`${code}:${z}`).emit("door:state", { doorZoneId: lock.exitAnimZoneId, open: true });
      io.to(`${code}:${z}`).emit("explore:dialogue", {
        title: "",
        lines: [lock.successText || "The key turns. The door swings open."],
      });
    } else {
      socket.emit("explore:dialogue", {
        title: "",
        lines: [lock.lockedText || "It's locked. You'll need to find a key."],
      });
    }
  });

  // Two-stage search spots: first interact is a decoy line, second interact
  // (from anyone in the party, not necessarily the same player) hands over
  // the item and removes the object from the map, same one-time guard as
  // inventory:pickup.
  socket.on("search:interact", ({ zone, objectId, searchId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !objectId || !searchId) return;
    const z = zone || "estate";
    const search = (INTERACTIONS.searches || {})[searchId];
    if (!search) return;
    if (room.collectedPickups[objectId]) return; // already found, ignore stray clicks

    if (!room.zoneSearches[z]) room.zoneSearches[z] = {};
    const count = (room.zoneSearches[z][searchId] || 0) + 1;
    room.zoneSearches[z][searchId] = count;

    if (count >= 2) {
      const def = ITEMS[search.itemId];
      if (!def) return;
      room.collectedPickups[objectId] = true;
      getInventory(room, socket.id).push({
        itemId: search.itemId, name: def.name, description: def.description, art: def.art,
      });
      io.to(code).emit("map:objectRemoved", { objectId });
      socket.emit("inventory:state", buildInventoryState(room, socket.id));
      socket.emit("explore:dialogue", { title: "", lines: [search.foundText || "You found something."] });
    } else {
      socket.emit("explore:dialogue", { title: "", lines: [search.firstText || "Nothing here yet."] });
    }
  });

  // Locked containers (Area 4's chest): same requires-an-item check as
  // door:unlock, but grants an item into the opener's inventory instead of
  // toggling a door, and only ever needs opening once per zone.
  socket.on("container:unlock", ({ zone, objectId, containerId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !objectId || !containerId) return;
    const z = zone || "estate";
    const lock = (INTERACTIONS.lockedContainers || {})[containerId];
    if (!lock) return;
    if (room.collectedPickups[objectId]) return; // already opened

    const has = getInventory(room, socket.id).some((it) => it.itemId === lock.requiresItem);
    if (!has) {
      socket.emit("explore:dialogue", { title: "", lines: [lock.lockedText || "It's locked."] });
      return;
    }
    const def = ITEMS[lock.grantsItem];
    if (!def) return;
    room.collectedPickups[objectId] = true;
    getInventory(room, socket.id).push({
      itemId: lock.grantsItem, name: def.name, description: def.description, art: def.art,
    });
    io.to(code).emit("map:objectRemoved", { objectId });
    socket.emit("inventory:state", buildInventoryState(room, socket.id));
    socket.emit("explore:dialogue", { title: "", lines: [lock.foundText || "It opens."] });
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
    updateOccupancyDoor(room, code, oldZone);

    player.zone = zone;
    player.pos = { x, y, dir: "down", moving: false };

    // A party member who's fallen behind in the dungeon's one-way chain
    // gets offered a way to catch up rather than either being silently
    // stuck or forcibly yanked along - the player themselves decides
    // whether now's a good time. Only re-prompts once the gap actually
    // grows further than whatever they were last offered (behindPromptRank),
    // so declining doesn't mean getting immediately re-asked on the very
    // next unrelated zone change from a teammate. Resets once they're
    // caught up, so a future gap can prompt fresh.
    const moverRank = dungeonProgressRank(zone);
    if (moverRank >= 0) {
      const connected = Object.entries(room.players).filter(([, p]) => p.connected);
      const leadRank = Math.max(...connected.map(([, p]) => dungeonProgressRank(p.zone || "")));
      const leadEntry = connected.find(([, p]) => dungeonProgressRank(p.zone || "") === leadRank);
      const leadZone = leadEntry ? leadEntry[1].zone : null;
      connected.forEach(([id, p]) => {
        const rank = dungeonProgressRank(p.zone || "");
        if (rank < 0) return;
        if (rank >= leadRank) {
          p.behindPromptRank = null;
          return;
        }
        if (p.behindPromptRank !== null && p.behindPromptRank !== undefined && p.behindPromptRank >= leadRank) return;
        p.behindPromptRank = leadRank;
        const leadMapData = loadMapData(DUNGEON_ZONE_MAPS[leadZone]);
        const spawn = (leadMapData && leadMapData.spawn) || { x: 0, y: 0 };
        io.to(id).emit("party:behindPrompt", {
          zone: leadZone,
          mapUrl: DUNGEON_ZONE_MAPS[leadZone],
          x: spawn.x,
          y: spawn.y,
        });
      });
    }

    // Some explore acts complete when the whole party reaches a specific
    // forward zone (the dungeon arc ends once everyone's out of the
    // sewers) rather than an evidence count. Zone changes happen
    // independently per player, so this checks everyone currently
    // connected, not just the player who just moved.
    const act = STORY.acts[room.actIndex];
    if (act && act.type === "explore" && act.completionMode === "zone" && act.completionZone === zone) {
      const connectedIds = Object.entries(room.players).filter(([, p]) => p.connected).map(([id]) => id);
      const allThere = connectedIds.every((id) => room.players[id].zone === zone);
      if (allThere && connectedIds.length && !room.actState.transitioning) {
        // Guard against firing twice if two players' zone-change events
        // both satisfy "everyone's here" in quick succession - advanceAct
        // isn't safe to call more than once, it would silently skip an
        // act. room.actState gets fully replaced the moment the next act
        // actually starts (see sendActToRoom), so this resets itself,
        // no explicit cleanup needed.
        fadeAndAdvanceAct(code);
      }
    }

    socket.join(`${code}:${zone}`);
    updateOccupancyDoor(room, code, zone);

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

    const openedDoors = room.zoneDoors[zone];
    if (openedDoors) {
      for (const doorId of Object.keys(openedDoors)) {
        const lock = (INTERACTIONS.lockedDoors || {})[doorId];
        if (lock) socket.emit("door:state", { doorZoneId: lock.exitAnimZoneId, open: true });
      }
    }

    if (room.zoneSimpleLevers[zone]) {
      const simple = (INTERACTIONS.simpleLevers || {})[zone];
      if (simple) socket.emit("door:state", { doorZoneId: simple.exitAnimZoneId, open: true });
    }

    const forcedOpen = room.zoneForcedOpenBarriers[zone];
    if (forcedOpen) {
      for (const animZoneId of Object.keys(forcedOpen)) {
        socket.emit("door:state", { doorZoneId: animZoneId, open: true });
      }
    }
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

    // Generic gate: some items (the Herbalist's plant specimens, so far)
    // shouldn't be collectable until a specific party-wide fact is known -
    // here, having actually been sent out to gather them. Told, not just
    // silently ignored, so it doesn't read as a broken interaction.
    if (def.requiresFact && !room.knownFacts[def.requiresFact]) {
      socket.emit("inventory:pickupDenied", {
        objectId,
        text: def.requiresFactDeniedText || "Not yet. There's nothing to gain from picking this before you know what you're looking for.",
      });
      return;
    }

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

  // The Herbalist's Hut: throwing a held specimen into the cauldron.
  // Deliberately modeled as an item-consumption action, not a typed
  // answer - matches the "no typed answers" rule the rest of the game
  // follows. Only one live attempt at a time; a wrong or harmless result
  // has to be cleared with cauldron:reset before anyone can try again,
  // so the whole party sees the same outcome rather than someone
  // quietly retrying in the background.
  socket.on("cauldron:submit", ({ itemId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !itemId) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "explore") return;
    if (!room.cauldron) room.cauldron = { status: "idle" };
    if (room.cauldron.status !== "idle") return;

    const inv = getInventory(room, socket.id);
    const idx = inv.findIndex((it) => it.itemId === itemId);
    if (idx === -1) return;
    inv.splice(idx, 1);

    const puzzle = INTERACTIONS.cauldronPuzzle || {};
    let status = "wrong";
    if (itemId === puzzle.correctItemId) status = "correct";
    else if ((puzzle.harmlessItemIds || []).includes(itemId)) status = "harmless";

    room.cauldron = { status, submittedItemId: itemId, heldBy: socket.id, ackBy: {} };

    const reactionKey =
      status === "correct" ? "cauldronCorrect" : status === "harmless" ? "cauldronHarmless" : "cauldronWrong";
    const reaction = puzzle[reactionKey] || {};

    io.to(code).emit("cauldron:result", {
      status,
      itemId,
      title: reaction.title || "The Herbalist",
      lines: reaction.lines || [],
    });
    socket.emit("inventory:state", buildInventoryState(room, socket.id));
    // Advancing used to fire immediately here, right alongside the result
    // broadcast - the fade-to-black could land before the client had even
    // finished its own reveal animation, cutting the herbalist's praise
    // off before anyone could read it. Now it waits on cauldron:acknowledge,
    // same party-wide ready pattern as every other "read this, then
    // continue" moment in the game.
  });

  // The correct result needs everyone to actually read the herbalist's
  // reaction and choose to move on, not get swept into the next act the
  // instant the answer lands - same pattern as act:acknowledgeReveal, just
  // scoped to the cauldron's own state since this act's type is "explore",
  // not "reveal".
  socket.on("cauldron:acknowledge", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.cauldron || room.cauldron.status !== "correct") return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.completionMode !== "cauldron") return;

    room.cauldron.ackBy[socket.id] = true;
    const totalPlayers = connectedPlayerCount(room);
    const ackCount = Object.keys(room.cauldron.ackBy).length;
    io.to(code).emit("cauldron:ackProgress", { ackCount, totalPlayers });
    if (ackCount >= totalPlayers && !room.actState.transitioning) {
      fadeAndAdvanceAct(code);
    }
  });

  // "Try Again": clears a wrong/harmless cauldron result back to idle, and
  // hands the wasted specimen back to whoever threw it in, so the party
  // isn't forced to walk back out to the garden for a plant they've
  // already gathered once. Correct results don't reset - the act is over.
  socket.on("cauldron:reset", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.cauldron) return;
    if (room.cauldron.status === "idle" || room.cauldron.status === "correct") return;

    const { submittedItemId, heldBy } = room.cauldron;
    if (heldBy && submittedItemId) {
      const def = ITEMS[submittedItemId];
      if (def) {
        getInventory(room, heldBy).push({
          itemId: submittedItemId,
          name: def.name,
          description: def.description,
          art: def.art,
        });
        io.to(heldBy).emit("inventory:state", buildInventoryState(room, heldBy));
      }
    }
    room.cauldron = { status: "idle", submittedItemId: null, heldBy: null };
    io.to(code).emit("cauldron:reset");
  });

  socket.on("inventory:requestState", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    socket.emit("inventory:state", buildInventoryState(room, socket.id));
  });

  // A player joining mid-puzzle (reconnect, or arriving at the cauldron
  // after someone else already threw something in) needs to see whatever
  // the current shared result is, not always start from "idle". Was only
  // sending the status string with nothing to actually render - the
  // client had no listener for it at all, so this never did anything.
  // Sends the same title/lines cauldron:result does, plus this player's
  // own ack state and the party's live progress for a correct result, so
  // reopening the modal mid-puzzle looks identical to having been there
  // for the original result.
  socket.on("cauldron:requestState", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || !room.cauldron) {
      socket.emit("cauldron:currentState", { status: "idle" });
      return;
    }
    const { status, submittedItemId } = room.cauldron;
    if (status === "idle" || !status) {
      socket.emit("cauldron:currentState", { status: "idle" });
      return;
    }
    const puzzle = INTERACTIONS.cauldronPuzzle || {};
    const reactionKey =
      status === "correct" ? "cauldronCorrect" : status === "harmless" ? "cauldronHarmless" : "cauldronWrong";
    const reaction = puzzle[reactionKey] || {};
    const payload = {
      status,
      itemId: submittedItemId,
      title: reaction.title || "The Herbalist",
      lines: reaction.lines || [],
    };
    if (status === "correct") {
      payload.acked = !!room.cauldron.ackBy[socket.id];
      payload.ackCount = Object.keys(room.cauldron.ackBy).length;
      payload.totalPlayers = connectedPlayerCount(room);
    }
    socket.emit("cauldron:currentState", payload);
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
      fadeAndAdvanceAct(code);
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

  // Shared, party-wide word-bank picks for the finale accusation - any
  // player can set any blank, everyone sees the same live passage build
  // up, same "shared board, anyone can edit" pattern as board:move.
  socket.on("finale:select", ({ blank, optionId }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "finale_accusation") return;

    const fa = INTERACTIONS.finaleAccusation || {};
    const blankDef = fa.blanks && fa.blanks[blank];
    if (!blankDef || !blankDef.options.some((o) => o.id === optionId)) return;

    room.actState.finaleSelections[blank] = optionId;

    // Same reasoning as board:move - editing after an agreement to submit
    // means that agreement no longer reflects what's actually being
    // presented, so it's cleared and everyone needs to re-confirm.
    if (Object.keys(room.actState.ackBy).length) {
      room.actState.ackBy = {};
      io.to(code).emit("finale:submitProgress", { ready: 0, total: connectedPlayerCount(room) });
    }

    io.to(code).emit("finale:state", { selections: room.actState.finaleSelections });
  });

  // "Present Your Case" - same ack-counting agreement pattern as
  // board:submit. Everyone has to agree the case as currently filled in
  // is ready before it's actually evaluated.
  socket.on("finale:submit", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "finale_accusation") return;

    const fa = INTERACTIONS.finaleAccusation || {};
    const sel = room.actState.finaleSelections || {};
    if ((fa.blankOrder || []).some((b) => !sel[b])) return; // not every blank chosen yet

    room.actState.ackBy[socket.id] = true;
    const totalPlayers = connectedPlayerCount(room);
    const ackCount = Object.keys(room.actState.ackBy).length;
    io.to(code).emit("finale:submitProgress", { ready: ackCount, total: totalPlayers });
    if (ackCount < totalPlayers) return;

    evaluateFinaleSubmit(room, code);
  });

  // The party-wide "we've read it, move on" click after a correct
  // accusation - see evaluateFinaleSubmit for why this doesn't just
  // auto-advance on a timer.
  socket.on("finale:acknowledgeResult", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const act = STORY.acts[room.actIndex];
    if (!act || act.type !== "finale_accusation" || !room.actState.finaleAwaitingContinue) return;

    room.actState.ackBy[socket.id] = true;
    const totalPlayers = connectedPlayerCount(room);
    const ackCount = Object.keys(room.actState.ackBy).length;
    io.to(code).emit("finale:continueProgress", { ready: ackCount, total: totalPlayers });
    if (ackCount >= totalPlayers) {
      fadeAndAdvanceAct(code);
    }
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
    delete room.lobbyPositions[socket.id];
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
    updateOccupancyDoor(room, code, zone);
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
      updateOccupancyDoor(room, code, zone);
    }

    // Same reasoning as the pressure-plate release below: if they were
    // mid-drag on a board card when they dropped, don't leave it locked
    // for everyone else.
    Object.entries(room.boardCards || {}).forEach(([clueId, card]) => {
      if (card.claimedBy === socket.id) {
        card.claimedBy = null;
        io.to(code).emit("board3:claimed", { clueId, playerId: null });
      }
    });

    // If everyone else had already voted and were just waiting on this
    // player, don't leave the vote stuck open forever.
    if (room.vote && Object.keys(room.vote.picks).length) {
      io.to(code).emit("vote:state", buildVoteState(room));
      tryResolveVote(room, code);
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
