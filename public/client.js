const socket = io();

const skinTones = [
  { name: "Tan",        hex: "#ab947a" },
  { name: "Rose Tan",   hex: "#966c6c" },
  { name: "Copper",     hex: "#cd683d" },
  { name: "Warm Tan",   hex: "#e6904e" },
  { name: "Deep Red",   hex: "#9e4539" },
  { name: "Maroon",     hex: "#7a3045" },
  { name: "Olive Green",hex: "#a2a947" },
  { name: "Sage Green", hex: "#92a984" },
  { name: "Moss",       hex: "#547e64" },
  { name: "Deep Olive", hex: "#676633" },
];

const outfitColors = [
  { name: "Crimson",  hex: "#b33831" },
  { name: "Rust",     hex: "#ae2334" },
  { name: "Forest",   hex: "#239063" },
  { name: "Teal",     hex: "#0b5e65" },
  { name: "Deep Teal",hex: "#165a4c" },
  { name: "Navy",     hex: "#323353" },
  { name: "Indigo",   hex: "#484a77" },
  { name: "Plum",     hex: "#45293f" },
  { name: "Violet",   hex: "#905ea9" },
  { name: "Magenta",  hex: "#831c5d" },
  { name: "Blue",     hex: "#4d65b4" },
  { name: "Olive",    hex: "#676633" },
];

const RACES = [
  { key: "human", label: "Human" },
  { key: "orc", label: "Orc" },
  { key: "elf", label: "Elf" },
  { key: "troll", label: "Troll" },
  { key: "dwarf", label: "Dwarf" },
];

let state = {
  isHost: false,
  roomCode: null,
  myId: null,
  hostId: null,
  myRace: "human",
  mySkinColor: skinTones[0].hex,
  myOutfitColor: outfitColors[6].hex,
};

const sprites = { human: new Image(), orc: new Image(), elf: new Image(), troll: new Image(), dwarf: new Image(), clothes: new Image(), clothesDwarf: new Image(), tusks: new Image() };
let spritesReady = false;

function loadSprites() {
  return new Promise((resolve) => {
    let loaded = 0;
    const total = 8;
    const done = () => { loaded++; if (loaded === total) { spritesReady = true; resolve(); } };
    Object.values(sprites).forEach((img) => {
      img.onload = done;
      img.onerror = done; // don't let one failed image hang character creation forever
    });
    sprites.human.src = "/images/avatar-human.png";
    sprites.orc.src = "/images/avatar-orc.png";
    sprites.elf.src = "/images/avatar-elf.png";
    sprites.troll.src = "/images/avatar-troll.png";
    sprites.dwarf.src = "/images/avatar-dwarf.png";
    sprites.clothes.src = "/images/avatar-clothes.png";
    sprites.clothesDwarf.src = "/images/avatar-clothes-dwarf.png";
    sprites.tusks.src = "/images/avatar-tusks.png";
  });
}

function tintOnto(ctx, img, colorHex, canvasW, canvasH) {
  if (!img.complete || img.naturalWidth === 0) return;
  const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight) * 0.85;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (canvasW - w) / 2;
  const y = canvasH - h - (canvasH - h) * 0.15;

  ctx.drawImage(img, x, y, w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, x, y, w, h);
  ctx.globalCompositeOperation = "source-over";
}

// Recolours a base greyscale/skin-tone sprite by multiplying in a flat colour, then
// masking back to the sprite's own silhouette. Similar approach to classic
// "pick a colour" party-game avatars. Draws skin tone first, then the clothes
// overlay (its own silhouette, derived from the body) tinted with the outfit colour.
function drawAvatar(canvas, race, skinColor, outfitColor) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bodyImg = sprites[race] || sprites.human;
  const clothesImg = race === "dwarf" ? sprites.clothesDwarf : sprites.clothes;

  tintOnto(ctx, bodyImg, skinColor, canvas.width, canvas.height);
  tintOnto(ctx, clothesImg, outfitColor, canvas.width, canvas.height);

  if (race === "orc" || race === "troll") {
    const img = sprites.tusks;
    if (img.complete && img.naturalWidth > 0) {
      const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * 0.85;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const x = (canvas.width - w) / 2;
      const y = canvas.height - h - (canvas.height - h) * 0.15;
      ctx.drawImage(img, x, y, w, h);
    }
  }
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
function initCharacterCreator() {
  const raceRow = document.getElementById("race-row");
  RACES.forEach((r, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "height-btn" + (i === 0 ? " active" : "");
    btn.textContent = r.label;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#race-row .height-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.myRace = r.key;
      refreshPreview();
    });
    raceRow.appendChild(btn);
  });

  const skinRow = document.getElementById("skin-swatch-row");
  skinTones.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (i === 0 ? " active" : "");
    btn.style.background = c.hex;
    btn.title = c.name;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#skin-swatch-row .swatch").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      state.mySkinColor = c.hex;
      refreshPreview();
    });
    skinRow.appendChild(btn);
  });

  const outfitRow = document.getElementById("outfit-swatch-row");
  outfitColors.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (i === 6 ? " active" : "");
    btn.style.background = c.hex;
    btn.title = c.name;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#outfit-swatch-row .swatch").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      state.myOutfitColor = c.hex;
      refreshPreview();
    });
    outfitRow.appendChild(btn);
  });

  refreshPreview();
}

function refreshPreview() {
  if (!spritesReady) return;
  const canvas = document.getElementById("avatar-preview");
  drawAvatar(canvas, state.myRace, state.mySkinColor, state.myOutfitColor);
}

loadSprites().then(() => {
  refreshPreview();
});

// --- Landing screen ---
document.getElementById("btn-host").addEventListener("click", () => {
  const name = document.getElementById("input-name").value.trim() || "Detective";
  socket.emit("host:createRoom", { name, race: state.myRace, skinColor: state.mySkinColor, outfitColor: state.myOutfitColor }, (res) => {
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

  socket.emit("player:joinRoom", { code, name, race: state.myRace, skinColor: state.mySkinColor, outfitColor: state.myOutfitColor }, (res) => {
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

    if (spritesReady) {
      drawAvatar(mini, p.race || "human", p.skinColor || "#ab947a", p.outfitColor || "#484a77");
    } else {
      loadSprites().then(() => drawAvatar(mini, p.race || "human", p.skinColor || "#ab947a", p.outfitColor || "#484a77"));
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
  document.getElementById("explore-title").textContent = act.title;
  document.getElementById("explore-progress").textContent = `0 / ${act.requiredCount} clues found`;
  document.getElementById("btn-explore-force-advance").classList.toggle("hidden", state.hostId !== state.myId);

  const canvas = document.getElementById("explore-canvas");
  await Overworld.init({
    canvas,
    socket,
    mapUrl: act.mapUrl,
    myRace: state.myRace,
    mySkinColor: state.mySkinColor,
    myOutfitColor: state.myOutfitColor,
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
  } else if (kind === "scrap_pickup") {
    socket.emit("explore:pickupScrap", { scrapId: obj.interaction.scrapId });
  } else if (kind === "table") {
    openTableModal();
  }
}

function setVnPortrait(obj) {
  const canvas = document.getElementById("vn-portrait");
  if (obj && obj.sprite) {
    canvas.classList.remove("hidden");
    drawFixedPortrait(canvas, obj.sprite);
  } else if (obj && obj.height && obj.color) {
    canvas.classList.remove("hidden");
    if (spritesReady) {
      drawAvatar(canvas, obj.race, obj.skinColor, obj.outfitColor);
    } else {
      loadSprites().then(() => drawAvatar(canvas, obj.race, obj.skinColor, obj.outfitColor));
    }
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

socket.on("explore:scrapFound", (data) => {
  Overworld.markSolved(data.scrapId);
  openDialogueModal("A Torn Scrap", [
    `You find a scrap of paper, torn at the edges. On it, a single word: "${data.word}".`,
    "Best bring it to the evidence table. Someone's probably already started piecing the others together.",
  ]);
});

// --- The Evidence Table (collaborative drag-and-drop) ---
let dragFromIndex = null;

function openTableModal() {
  socket.emit("table:requestState");
  document.getElementById("modal-table").classList.remove("hidden");
}

document.getElementById("btn-close-table").addEventListener("click", () => {
  document.getElementById("modal-table").classList.add("hidden");
});

socket.on("table:state", (state) => {
  const container = document.getElementById("table-slots");
  container.innerHTML = "";

  document.getElementById("table-status").textContent = state.solved
    ? "Solved! The order is right."
    : `${state.foundCount} / ${state.totalScraps} scraps found so far. Drag the pieces into order.`;

  state.slots.forEach((slot, index) => {
    const el = document.createElement("div");
    el.className = "table-slot" + (slot ? " filled" : "") + (state.solved ? " solved" : "");
    el.textContent = slot ? slot.word : "empty";
    el.dataset.index = index;

    if (slot) {
      el.draggable = true;
      el.addEventListener("dragstart", () => {
        dragFromIndex = index;
      });
    }

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
      if (dragFromIndex === null || dragFromIndex === index) return;
      socket.emit("table:swap", { fromIndex: dragFromIndex, toIndex: index });
      dragFromIndex = null;
    });

    container.appendChild(el);
  });
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

  if (person.sprite) {
    drawFixedPortrait(canvas, person.sprite);
  } else if (spritesReady) {
    drawAvatar(canvas, person.race, person.skinColor, person.outfitColor);
  } else {
    loadSprites().then(() => drawAvatar(canvas, person.race, person.skinColor, person.outfitColor));
  }

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
