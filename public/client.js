const socket = io();

const GENDERS = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
];

let state = {
  isHost: false,
  roomCode: null,
  myId: null,
  hostId: null,
  myGender: "male",
  myColor: "red",
};

let BASE_MANIFEST = null;
let PALETTE = null;
let manifestReady = false;

function loadBaseManifest() {
  return Promise.all([
    fetch("/assets/characters/base/manifest.json").then((r) => r.json()),
    fetch("/assets/characters/base/palette.json").then((r) => r.json()),
  ]).then(([m, p]) => {
    BASE_MANIFEST = m;
    PALETTE = p;
    manifestReady = true;
  });
}

// Draws a gender+colour's down-facing idle frame (frame 0, row 0) into a
// preview canvas. The colour tint is already baked into the sprite sheet
// (pre-generated offline), no live recoloring happens here.
function drawAvatar(canvas, gender, color) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!manifestReady) return;

  const genderManifest = BASE_MANIFEST[gender] || BASE_MANIFEST.male;
  const entry = genderManifest[color] || genderManifest.red;
  if (!entry) return;
  const frameSet = entry.idle;
  const img = new Image();
  img.onload = () => {
    const cell = frameSet.cell;
    const scale = Math.min(canvas.width / cell, canvas.height / cell) * 0.85;
    const w = cell * scale;
    const h = cell * scale;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - h - (canvas.height - h) * 0.1;
    ctx.drawImage(img, 0, 0, cell, cell, x, y, w, h);
  };
  img.src = frameSet.src;
}

// --- Screen helpers ---
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.getElementById("app").classList.toggle("app-wide", id === "screen-game");
  if (id === "screen-game" && typeof Overworld !== "undefined" && Overworld.resize) {
    // container size just changed; let the canvas catch up once the browser has laid it out
    requestAnimationFrame(() => Overworld.resize());
  }
}

// --- Character creation (shared by host + joining players) ---
function buildColorRow() {
  const colorRow = document.getElementById("preset-row");
  colorRow.innerHTML = "";
  Object.entries(PALETTE || {}).forEach(([key, hex], i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (key === state.myColor ? " active" : "");
    btn.style.background = hex;
    btn.title = key.charAt(0).toUpperCase() + key.slice(1);
    btn.addEventListener("click", () => {
      document.querySelectorAll("#preset-row .swatch").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.myColor = key;
      refreshPreview();
    });
    colorRow.appendChild(btn);
  });
}

function initCharacterCreator() {
  const genderRow = document.getElementById("gender-row");
  GENDERS.forEach((g, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "height-btn" + (i === 0 ? " active" : "");
    btn.textContent = g.label;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#gender-row .height-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.myGender = g.key;
      refreshPreview();
    });
    genderRow.appendChild(btn);
  });

  buildColorRow();
  refreshPreview();
}

function refreshPreview() {
  const canvas = document.getElementById("avatar-preview");
  drawAvatar(canvas, state.myGender, state.myColor);
}

loadBaseManifest().then(() => {
  buildColorRow();
  refreshPreview();
});

// --- Landing screen ---
document.getElementById("btn-host").addEventListener("click", () => {
  const name = document.getElementById("input-name").value.trim() || "Detective";
  socket.emit("host:createRoom", { name, gender: state.myGender, color: state.myColor }, (res) => {
    if (!res || !res.ok) return;
    state.isHost = true;
    state.roomCode = res.code;
    document.getElementById("room-code-display").textContent = res.code;
    document.getElementById("host-controls").classList.remove("hidden");
    document.getElementById("waiting-text").classList.add("hidden");
    showScreen("screen-lobby");
  });
});

document.getElementById("btn-join").addEventListener("click", () => {
  const name = document.getElementById("input-name").value.trim() || "Detective";
  const code = document.getElementById("input-code").value.trim().toUpperCase();
  const errorEl = document.getElementById("join-error");
  errorEl.textContent = "";

  if (!code) {
    errorEl.textContent = "Enter the case code your host shared.";
    return;
  }

  socket.emit("player:joinRoom", { code, name, gender: state.myGender, color: state.myColor }, (res) => {
    if (!res || !res.ok) {
      errorEl.textContent = (res && res.error) || "Could not join that game.";
      return;
    }
    state.isHost = false;
    state.roomCode = res.code;
    document.getElementById("room-code-display").textContent = res.code;
    showScreen("screen-lobby");
  });
});

// --- Lobby / room updates ---
let currentPlayers = [];

socket.on("room:update", (data) => {
  state.myId = socket.id;
  state.hostId = data.hostId;
  currentPlayers = data.players;
  const isMeHost = data.hostId === socket.id;

  document.getElementById("room-code-display").textContent = data.code;

  if (typeof Overworld !== "undefined" && Overworld.setRoster) {
    Overworld.setRoster(data.players, socket.id);
  }
  document.title = data.storyTitle || "Case File";

  const roster = document.getElementById("player-roster");
  roster.innerHTML = "";
  data.players.forEach((p) => {
    const chip = document.createElement("div");
    chip.className = "player-chip" + (p.connected ? "" : " disconnected");

    const mini = document.createElement("canvas");
    mini.className = "mini-avatar";
    mini.width = 48;
    mini.height = 64;

    const label = document.createElement("span");
    label.textContent = p.name + (p.id === data.hostId ? " (Host)" : "");

    chip.appendChild(mini);
    chip.appendChild(label);
    roster.appendChild(chip);

    if (manifestReady) {
      drawAvatar(mini, p.gender || "male", p.color || "red");
    } else {
      loadBaseManifest().then(() => drawAvatar(mini, p.gender || "male", p.color || "red"));
    }
  });

  if (!data.started) {
    document.getElementById("host-controls").classList.toggle("hidden", !isMeHost);
    document.getElementById("waiting-text").classList.toggle("hidden", isMeHost);
    if (document.getElementById("screen-game").classList.contains("active") === false &&
        document.getElementById("screen-end").classList.contains("active") === false) {
      showScreen("screen-lobby");
    }
  }

  document.getElementById("host-advance-wrap").classList.toggle("hidden", !isMeHost);
});

document.getElementById("btn-start").addEventListener("click", () => {
  socket.emit("host:startGame");
});

document.getElementById("btn-force-advance").addEventListener("click", () => {
  socket.emit("host:advanceAct");
});

socket.on("host:disconnected", () => {
  alert("The host has disconnected. The game may be paused until they return.");
});

socket.on("game:reset", () => {
  showScreen("screen-lobby");
});

// --- Act rendering ---
socket.on("act:show", (act) => {
  if (!act) return;
  showScreen("screen-game");

  const actFrame = document.getElementById("act-frame");
  const exploreFrame = document.getElementById("explore-frame");
  const boardFrame = document.getElementById("board-frame");

  if (act.type === "explore") {
    actFrame.classList.add("hidden");
    boardFrame.classList.add("hidden");
    exploreFrame.classList.remove("hidden");
    Overworld.stop();
    enterExplore(act);
    return;
  }

  if (act.type === "suspect_board") {
    actFrame.classList.add("hidden");
    exploreFrame.classList.add("hidden");
    boardFrame.classList.remove("hidden");
    Overworld.stop();
    enterSuspectBoard(act);
    return;
  }

  exploreFrame.classList.add("hidden");
  boardFrame.classList.add("hidden");
  actFrame.classList.remove("hidden");
  Overworld.stop();

  document.getElementById("act-eyebrow").textContent = `Act ${act.index + 1} of ${act.total}`;
  document.getElementById("act-title").textContent = act.title;

  const container = document.getElementById("act-body-container");
  container.innerHTML = "";
  document.getElementById("act-progress").textContent = "";

  if (act.type === "reveal") {
    renderReveal(container, act);
  } else if (act.type === "puzzle_group") {
    renderGroupPuzzle(container, act);
  } else if (act.type === "puzzle_individual") {
    renderIndividualPuzzle(container, act);
  } else if (act.type === "puzzle_split") {
    renderSplitPuzzle(container, act);
  } else if (act.type === "final") {
    renderFinal(act);
  }
});

function renderReveal(container, act) {
  const p = document.createElement("div");
  p.className = "act-body";
  p.innerHTML = `<p>${act.body}</p>`;
  container.appendChild(p);

  const btn = document.createElement("button");
  btn.className = "btn btn-primary";
  btn.textContent = "I'm Ready. Continue";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Waiting for the rest of the table...";
    socket.emit("act:acknowledgeReveal");
  });
  container.appendChild(btn);
}

function renderGroupPuzzle(container, act) {
  const p = document.createElement("div");
  p.className = "act-body";
  p.innerHTML = `<p>${act.prompt}</p>`;
  container.appendChild(p);
  container.appendChild(buildAnswerRow("act:submitGroup", act.hint));
}

function renderIndividualPuzzle(container, act) {
  const intro = document.createElement("div");
  intro.className = "act-body";
  intro.innerHTML = `<p><em>${act.intro}</em></p><p>${act.prompt}</p>`;
  container.appendChild(intro);

  if (act.solved) {
    const done = document.createElement("p");
    done.className = "feedback correct";
    done.textContent = "Your report is logged. Waiting on the rest of the table...";
    container.appendChild(done);
  } else {
    container.appendChild(buildAnswerRow("act:submitIndividual", null));
  }
}

function renderSplitPuzzle(container, act) {
  const intro = document.createElement("div");
  intro.className = "act-body";
  intro.innerHTML = `<p><em>${act.intro}</em></p>`;
  container.appendChild(intro);

  const frag = document.createElement("div");
  frag.className = "fragment-card";
  frag.textContent = act.fragment;
  container.appendChild(frag);

  const prompt = document.createElement("p");
  prompt.textContent = act.finalPrompt;
  container.appendChild(prompt);

  container.appendChild(buildAnswerRow("act:submitGroup", act.hint));
}

function renderFinal(act) {
  document.getElementById("end-title").textContent = act.title;
  document.getElementById("end-body").innerHTML = `<p>${act.body}</p>`;
  document.getElementById("final-word").textContent = act.finalWord;
  showScreen("screen-end");
}

function buildAnswerRow(eventName, hint) {
  const wrap = document.createElement("div");

  const row = document.createElement("div");
  row.className = "answer-row";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type your answer...";

  const btn = document.createElement("button");
  btn.className = "btn btn-primary";
  btn.textContent = "Submit";

  const feedback = document.createElement("div");
  feedback.className = "feedback";

  function submit() {
    const val = input.value.trim();
    if (!val) return;
    socket.emit(eventName, { answer: val });
  }

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  row.appendChild(input);
  row.appendChild(btn);
  wrap.appendChild(row);
  wrap.appendChild(feedback);

  if (hint) {
    const hintToggle = document.createElement("span");
    hintToggle.className = "hint-toggle";
    hintToggle.textContent = "Need a hint?";
    hintToggle.addEventListener("click", () => {
      hintToggle.textContent = hint;
      hintToggle.style.cursor = "default";
      hintToggle.style.textDecoration = "none";
    });
    wrap.appendChild(hintToggle);
  }

  wrap._feedbackEl = feedback;
  wrap._inputEl = input;
  currentAnswerWrap = wrap;

  return wrap;
}

let currentAnswerWrap = null;

socket.on("act:result", (res) => {
  if (!currentAnswerWrap) return;
  const fb = currentAnswerWrap._feedbackEl;
  if (!fb) return;
  if (res.correct) {
    fb.className = "feedback correct";
    fb.textContent = "Correct!";
  } else {
    fb.className = "feedback incorrect";
    fb.textContent = "Not quite. Try again.";
    currentAnswerWrap._inputEl.value = "";
  }
});

socket.on("act:groupSolved", (data) => {
  if (!currentAnswerWrap) return;
  const fb = currentAnswerWrap._feedbackEl;
  if (fb) {
    fb.className = "feedback correct";
    fb.textContent = `${data.by || "Someone"} cracked it! Moving on...`;
  }
});

socket.on("act:progress", (data) => {
  const el = document.getElementById("act-progress");
  if (data.kind === "individual" && el) {
    el.textContent = `${data.solved} / ${data.total} reports logged`;
  } else if (data.kind === "reveal" && el) {
    el.textContent = `${data.acknowledged} / ${data.total} ready`;
  } else if (data.kind === "explore") {
    const exploreEl = document.getElementById("explore-progress");
    if (exploreEl) exploreEl.textContent = `${data.solved} / ${data.total} clues found`;
  }
});

initCharacterCreator();

// --- Explore mode (overworld) ---
let interactionsCache = null;
let activePuzzleObj = null;
let activePuzzleEntry = null;
let isNearInteractable = false;

async function getInteractions() {
  if (interactionsCache) return interactionsCache;
  const res = await fetch("/content/interactions.json");
  interactionsCache = await res.json();
  return interactionsCache;
}

async function enterExplore(act) {
  ZONE_MAPS.estate = act.mapUrl;
  document.getElementById("explore-title").textContent = act.title;
  document.getElementById("explore-progress").textContent = `0 / ${act.requiredCount} clues found`;
  document.getElementById("btn-explore-force-advance").classList.toggle("hidden", state.hostId !== state.myId);

  const canvas = document.getElementById("explore-canvas");
  await Overworld.init({
    canvas,
    socket,
    mapUrl: act.mapUrl,
    myGender: state.myGender,
    myColor: state.myColor,
    myName: (currentPlayers.find((p) => p.id === socket.id) || {}).name || "",
    onNearbyChange: (obj) => {
      isNearInteractable = !!obj;
      const panelOpen = !document.getElementById("vn-panel").classList.contains("hidden");
      document.getElementById("btn-interact").classList.toggle("hidden", !obj || panelOpen);
    },
    onInteract: (obj) => handleObjectInteract(obj),
  });

  Overworld.resize();
  Overworld.setRoster(currentPlayers || [], socket.id);

  // Mark clues the group has already solved (e.g. rejoining mid-act)
  (act.solvedClues || []).forEach((puzzleId) => Overworld.markSolved(puzzleId));

  Overworld.start();
}

window.addEventListener("resize", () => {
  if (!document.getElementById("explore-frame").classList.contains("hidden")) {
    Overworld.resize();
  }
});

document.getElementById("btn-interact").addEventListener("click", () => {
  Overworld.triggerInteractFromButton();
});

document.getElementById("btn-explore-force-advance").addEventListener("click", () => {
  socket.emit("host:advanceAct");
});

// Interior zones a player can walk into independently of the rest of the
// party. "estate" isn't listed here, it's whatever act.mapUrl the current
// explore act is using, set in enterExplore().
const ZONE_MAPS = {
  estate: null,
  barn_interior: "/assets/maps/barn_interior.json",
  dock_interior: "/assets/maps/dock_interior.json",
  manor_ground: "/assets/maps/manor_ground.json",
  manor_upper: "/assets/maps/manor_upper.json",
};

function updateZoneLabel(zoneId) {
  const label = {
    estate: "",
    barn_interior: "The Barn",
    dock_interior: "The Dockhouse",
    manor_ground: "The Manor",
    manor_upper: "The Manor, Upstairs",
  }[zoneId] || "";
  const el = document.getElementById("explore-zone-label");
  if (el) el.textContent = label;
}

async function handleObjectInteract(obj) {
  const kind = obj.interaction && obj.interaction.kind;
  const data = await getInteractions();

  if (kind === "dialogue") {
    const entry = data[obj.interaction.dialogueId];
    if (entry) openDialogueModal(entry.title, entry.lines, obj);
  } else if (kind === "note") {
    openDialogueModal(obj.name, [obj.interaction.text], obj);
  } else if (kind === "puzzle") {
    const entry = data[obj.interaction.puzzleId];
    if (entry) openPuzzleModal(obj, entry);
  } else if (kind === "inventory_pickup") {
    socket.emit("inventory:pickup", { objectId: obj.id });
  } else if (kind === "table") {
    openTableModal();
  } else if (kind === "zone_exit") {
    const targetZone = obj.interaction.targetZone;
    const mapUrl = ZONE_MAPS[targetZone];
    if (!mapUrl) return;
    document.getElementById("btn-interact").classList.add("hidden");
    await Overworld.changeZone(targetZone, mapUrl, obj.interaction.targetX, obj.interaction.targetY);
    socket.emit("player:changeZone", {
      zone: targetZone,
      x: obj.interaction.targetX,
      y: obj.interaction.targetY,
    });
    updateZoneLabel(targetZone);
  }
}

function setVnPortrait(obj) {
  const canvas = document.getElementById("vn-portrait");
  if (obj && obj.portrait) {
    canvas.classList.remove("hidden");
    drawFixedPortrait(canvas, obj.portrait);
  } else {
    canvas.classList.add("hidden");
  }
}

function openDialogueModal(title, lines, obj) {
  document.getElementById("vn-puzzle-set").classList.add("hidden");
  document.getElementById("vn-dialogue-set").classList.remove("hidden");
  setVnPortrait(obj);

  document.getElementById("dialogue-title").textContent = title;
  const container = document.getElementById("dialogue-lines");
  container.innerHTML = "";
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.className = "dialogue-line";
    p.textContent = line;
    container.appendChild(p);
  });
  document.getElementById("vn-panel").classList.remove("hidden");
  document.getElementById("btn-interact").classList.add("hidden");
}

document.getElementById("btn-close-dialogue").addEventListener("click", () => {
  document.getElementById("vn-panel").classList.add("hidden");
  document.getElementById("btn-interact").classList.toggle("hidden", !isNearInteractable);
});

socket.on("explore:dialogue", (data) => {
  openDialogueModal(data.title, data.lines);
});

function openPuzzleModal(obj, entry) {
  activePuzzleObj = obj;
  activePuzzleEntry = entry;

  document.getElementById("vn-dialogue-set").classList.add("hidden");
  document.getElementById("vn-puzzle-set").classList.remove("hidden");
  setVnPortrait(obj);

  document.getElementById("puzzle-title").textContent = entry.title;
  document.getElementById("puzzle-prompt").textContent = entry.prompt;
  document.getElementById("puzzle-feedback").textContent = "";
  document.getElementById("puzzle-feedback").className = "feedback";
  document.getElementById("puzzle-answer-input").value = "";

  const extra = document.getElementById("puzzle-extra");
  extra.innerHTML = "";
  if (entry.render === "wordsearch") {
    extra.appendChild(buildLetterGrid(entry.grid, []));
    const wordList = document.createElement("div");
    wordList.className = "word-list";
    entry.wordList.forEach((w) => {
      const chip = document.createElement("span");
      chip.className = "word-chip";
      chip.textContent = w;
      wordList.appendChild(chip);
    });
    extra.appendChild(wordList);
  } else if (entry.render === "highlightgrid") {
    extra.appendChild(buildLetterGrid(entry.grid, entry.highlightPath));
  }

  const hintToggle = document.getElementById("puzzle-hint-toggle");
  hintToggle.textContent = "Need a hint?";
  hintToggle.style.cursor = "pointer";
  hintToggle.style.textDecoration = "underline";
  hintToggle.onclick = () => {
    hintToggle.textContent = entry.hint || "No hint available.";
    hintToggle.style.cursor = "default";
    hintToggle.style.textDecoration = "none";
  };

  document.getElementById("vn-panel").classList.remove("hidden");
  document.getElementById("btn-interact").classList.add("hidden");
}

function buildLetterGrid(grid, highlightPath) {
  const size = grid.length;
  const wrap = document.createElement("div");
  wrap.className = "letter-grid";
  wrap.style.gridTemplateColumns = `repeat(${size}, 26px)`;

  const highlightMap = {};
  (highlightPath || []).forEach((p, i) => {
    highlightMap[`${p.r},${p.c}`] = i + 1;
  });

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = document.createElement("div");
      const key = `${r},${c}`;
      cell.className = "letter-cell" + (highlightMap[key] ? " highlighted" : "");
      cell.textContent = grid[r][c];
      if (highlightMap[key]) {
        const badge = document.createElement("span");
        badge.className = "path-index";
        badge.textContent = highlightMap[key];
        cell.appendChild(badge);
      }
      wrap.appendChild(cell);
    }
  }
  return wrap;
}

document.getElementById("btn-close-puzzle").addEventListener("click", () => {
  document.getElementById("vn-panel").classList.add("hidden");
  document.getElementById("btn-interact").classList.toggle("hidden", !isNearInteractable);
});

function submitPuzzleAnswer() {
  if (!activePuzzleObj) return;
  const val = document.getElementById("puzzle-answer-input").value.trim();
  if (!val) return;
  socket.emit("explore:submitAnswer", { puzzleId: activePuzzleObj.interaction.puzzleId, answer: val });
}

document.getElementById("btn-puzzle-submit").addEventListener("click", submitPuzzleAnswer);
document.getElementById("puzzle-answer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitPuzzleAnswer();
});

socket.on("explore:result", (data) => {
  const fb = document.getElementById("puzzle-feedback");
  if (data.correct) {
    fb.className = "feedback correct";
    const successText = activePuzzleEntry && activePuzzleEntry.successText;
    fb.textContent = successText || "Correct! Logged to the case file.";
    const delay = successText ? 4000 : 1200;
    setTimeout(() => {
      document.getElementById("vn-panel").classList.add("hidden");
      document.getElementById("btn-interact").classList.toggle("hidden", !isNearInteractable);
    }, delay);
  } else {
    fb.className = "feedback incorrect";
    fb.textContent = "Not quite. Try again.";
  }
});

socket.on("explore:clueSolved", (data) => {
  Overworld.markSolved(data.puzzleId);
});

socket.on("map:objectRemoved", (data) => {
  Overworld.removeObject(data.objectId);
});

// --- Player inventory (private, held items not yet on the Evidence Table) ---
let myInventory = [];

function openInventoryModal() {
  socket.emit("inventory:requestState");
  document.getElementById("modal-inventory").classList.remove("hidden");
}

document.getElementById("btn-open-inventory").addEventListener("click", openInventoryModal);
document.getElementById("btn-close-inventory").addEventListener("click", () => {
  document.getElementById("modal-inventory").classList.add("hidden");
});

socket.on("inventory:state", (items) => {
  myInventory = items || [];
  document.getElementById("inventory-count").textContent = myInventory.length;
  renderInventoryGrid();
});

function renderInventoryGrid() {
  const grid = document.getElementById("inventory-grid");
  const empty = document.getElementById("inventory-empty-note");
  grid.innerHTML = "";
  empty.classList.toggle("hidden", myInventory.length > 0);
  myInventory.forEach((item) => {
    grid.appendChild(buildItemCard(item, { label: item.name }));
  });
}

function buildItemCard(item, opts) {
  const card = document.createElement("div");
  card.className = "item-card";
  const icon = document.createElement("div");
  icon.className = "item-card-icon";
  icon.textContent = (opts.label || item.name || "?").slice(0, 1).toUpperCase();
  const label = document.createElement("div");
  label.className = "item-card-label";
  label.textContent = opts.label || item.name;
  card.appendChild(icon);
  card.appendChild(label);
  if (opts.exhibitLetter) {
    const ex = document.createElement("div");
    ex.className = "item-card-exhibit";
    ex.textContent = `Exhibit ${opts.exhibitLetter}`;
    card.appendChild(ex);
  }
  if (opts.onClick) card.addEventListener("click", opts.onClick);
  return card;
}

// --- The Evidence Table (shared, synced across the whole party) ---
let tableExhibits = [];

function openTableModal() {
  socket.emit("evidence:requestState");
  socket.emit("inventory:requestState");
  document.getElementById("modal-table").classList.remove("hidden");
}

function closeTableModal() {
  document.getElementById("modal-table").classList.add("hidden");
}

document.getElementById("btn-close-table").addEventListener("click", closeTableModal);
document.getElementById("btn-close-table-2").addEventListener("click", closeTableModal);

socket.on("evidence:state", (exhibits) => {
  tableExhibits = exhibits || [];
  renderTableGrid();
});

function renderTableGrid() {
  const grid = document.getElementById("table-grid");
  const empty = document.getElementById("table-empty-note");
  grid.innerHTML = "";
  empty.classList.toggle("hidden", tableExhibits.length > 0);
  tableExhibits.forEach((ex) => {
    grid.appendChild(
      buildItemCard(ex, {
        label: `Exhibit ${ex.letter}`,
        exhibitLetter: ex.letter,
        onClick: () => openInvestigateModal(ex),
      })
    );
  });
  renderTableAddGrid();
}

function renderTableAddGrid() {
  const grid = document.getElementById("table-add-grid");
  const section = document.getElementById("table-add-section");
  grid.innerHTML = "";
  section.classList.toggle("hidden", myInventory.length === 0);
  myInventory.forEach((item) => {
    grid.appendChild(
      buildItemCard(item, {
        label: `+ ${item.name}`,
        onClick: () => socket.emit("evidence:add", { itemId: item.itemId }),
      })
    );
  });
}

// --- Investigate an exhibit (illustrated art plus description) ---
function openInvestigateModal(exhibit) {
  document.getElementById("investigate-title").textContent = `Exhibit ${exhibit.letter}: ${exhibit.name}`;
  const art = document.getElementById("investigate-art");
  if (exhibit.art) {
    art.src = exhibit.art;
    art.classList.remove("hidden");
  } else {
    art.classList.add("hidden");
  }
  document.getElementById("investigate-text").textContent =
    exhibit.description || "No further details recorded yet.";
  document.getElementById("modal-investigate").classList.remove("hidden");
}

document.getElementById("btn-close-investigate").addEventListener("click", () => {
  document.getElementById("modal-investigate").classList.add("hidden");
});

// --- The Suspect Board (live-synced portrait matching) ---
let suspectPoolData = [];
let draggedSuspectKey = null;

function enterSuspectBoard(act) {
  document.getElementById("board-title").textContent = act.title;
  document.getElementById("board-intro").textContent = act.intro || "";
  document.getElementById("board-feedback").textContent = "";
  document.getElementById("board-feedback").className = "feedback";
  suspectPoolData = act.pool || [];
  renderBoard(act.zone || []);
}

function renderBoard(zoneKeys) {
  const poolEl = document.getElementById("board-pool");
  const zoneEl = document.getElementById("board-zone");
  poolEl.innerHTML = "";
  zoneEl.innerHTML = "";

  suspectPoolData.forEach((person) => {
    const inZone = zoneKeys.includes(person.key);
    const card = buildPortraitCard(person);
    (inZone ? zoneEl : poolEl).appendChild(card);
  });
}

function drawFixedPortrait(canvas, src) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * 3.2;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - h;
    ctx.drawImage(img, x, y, w, h);
  };
  img.src = src;
}

function buildPortraitCard(person) {
  const card = document.createElement("div");
  card.className = "portrait-card";
  card.draggable = true;
  card.dataset.key = person.key;

  const canvas = document.createElement("canvas");
  canvas.width = 60;
  canvas.height = 80;
  card.appendChild(canvas);

  const label = document.createElement("div");
  label.className = "portrait-name";
  label.textContent = person.name;
  card.appendChild(label);

  card.addEventListener("dragstart", () => {
    draggedSuspectKey = person.key;
  });

  drawFixedPortrait(canvas, person.sprite);

  return card;
}

function wireDropzone(el, toZone) {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("drag-over");
  });
  el.addEventListener("dragleave", () => {
    el.classList.remove("drag-over");
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("drag-over");
    if (!draggedSuspectKey) return;
    socket.emit("board:move", { key: draggedSuspectKey, toZone });
    draggedSuspectKey = null;
  });
}
wireDropzone(document.getElementById("board-pool"), "pool");
wireDropzone(document.getElementById("board-zone"), "suspects");

document.getElementById("btn-board-submit").addEventListener("click", () => {
  socket.emit("board:submit");
});

socket.on("board:state", (state) => {
  renderBoard(state.zone || []);
});

socket.on("board:result", (data) => {
  const fb = document.getElementById("board-feedback");
  if (data.correct) {
    fb.className = "feedback correct";
    fb.textContent = "\"...Yes. That's it. Good work.\"";
  } else {
    fb.className = "feedback incorrect";
    fb.textContent = data.message || "That's not right. Try again.";
  }
});
