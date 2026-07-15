const socket = io();

// Act labels read "Act IV", not "Act 4 of 12", the number of acts left is
// not something the party needs advertised mid-story.
const ROMAN_NUMERALS = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
function toRoman(num) {
  let result = "";
  let n = num;
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  }
  return result || String(num);
}

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

    const dot = document.createElement("span");
    dot.className = "player-color-dot";
    dot.style.background = (PALETTE && PALETTE[p.color || "red"]) || "#e83b3b";

    const label = document.createElement("span");
    label.textContent = p.name + (p.id === data.hostId ? " (Host)" : "");

    chip.appendChild(dot);
    chip.appendChild(label);
    roster.appendChild(chip);
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
  currentAct = act;
  showScreen("screen-game");

  // The cutscene fade-to-black only ever gets cleared by its own button
  // being clicked. If the host force-advances past a cutscene mid-fade
  // instead (or a player reconnects mid-fade), that click never happens,
  // and the overlay would otherwise sit there opaque forever. Every act
  // transition goes through here, so this is the one place that's always
  // guaranteed to run, regardless of how the transition happened.
  document.getElementById("cutscene-fade-overlay").classList.remove("visible");

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

  if (act.type === "evidence_room") {
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

  document.getElementById("act-eyebrow").textContent = `Act ${toRoman(act.chapter || 1)}`;
  document.getElementById("act-title").textContent = act.title;

  const container = document.getElementById("act-body-container");
  container.innerHTML = "";
  document.getElementById("act-progress").textContent = "";

  if (act.type === "reveal") {
    renderReveal(container, act);
  } else if (act.type === "cutscene") {
    renderCutscene(container, act);
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
  const lines = String(act.body).split("\n").filter((l) => l.trim().length);
  p.innerHTML = lines.map((l) => `<p>${l}</p>`).join("");
  container.appendChild(p);

  if (act.showEvidenceReview) {
    const reviewBtn = document.createElement("button");
    reviewBtn.className = "btn btn-secondary";
    reviewBtn.textContent = "Review the Evidence";
    reviewBtn.addEventListener("click", () => openTableModal());
    container.appendChild(reviewBtn);
  }

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

// A cutscene is a short paginated sequence of speaker lines, click to advance
// through each one, optionally fading the whole screen to black before the
// party is allowed to continue (used for beats like an arrest or a scene
// change that shouldn't feel like just another reveal card).
function renderCutscene(container, act) {
  const pages = act.pages && act.pages.length ? act.pages : [{ speaker: "", text: "" }];

  if (act.singlePage) {
    renderSinglePageCutscene(container, act, pages);
    return;
  }

  let pageIndex = 0;

  const speakerEl = document.createElement("p");
  speakerEl.className = "cutscene-speaker";
  const textEl = document.createElement("p");
  textEl.className = "cutscene-line";
  const box = document.createElement("div");
  box.className = "act-body cutscene-box";
  box.appendChild(speakerEl);
  box.appendChild(textEl);
  container.appendChild(box);

  const advanceBtn = document.createElement("button");
  advanceBtn.className = "btn btn-primary";
  container.appendChild(advanceBtn);

  function showPage(i) {
    const page = pages[i];
    speakerEl.textContent = page.speaker || "";
    speakerEl.classList.toggle("hidden", !page.speaker);
    textEl.textContent = page.text || "";
    advanceBtn.textContent = i < pages.length - 1 ? "Continue" : "Continue";
  }

  function finishCutscene() {
    if (act.fadeOut) {
      const overlay = document.getElementById("cutscene-fade-overlay");
      overlay.classList.add("visible");
      setTimeout(() => showContinueButton(), 900);
    } else {
      showContinueButton();
    }
  }

  function showContinueButton() {
    box.classList.add("hidden");
    advanceBtn.textContent = "I'm Ready. Continue";
    if (act.fadeOut) advanceBtn.classList.add("cutscene-continue-btn");
    advanceBtn.onclick = () => {
      advanceBtn.disabled = true;
      advanceBtn.textContent = "Waiting for the rest of the table...";
      socket.emit("act:acknowledgeReveal");
      const overlay = document.getElementById("cutscene-fade-overlay");
      overlay.classList.remove("visible");
    };
  }

  advanceBtn.onclick = () => {
    if (pageIndex < pages.length - 1) {
      pageIndex += 1;
      showPage(pageIndex);
    } else {
      finishCutscene();
    }
  };

  showPage(0);
}

// Same content as a regular cutscene, but shown as one stacked block of
// dialogue rather than click-through pages, for beats that read better as
// a single scene than a series of taps.
function renderSinglePageCutscene(container, act, pages) {
  const box = document.createElement("div");
  box.className = "act-body cutscene-box cutscene-box-stacked";

  pages.forEach((page) => {
    if (page.speaker) {
      const speakerEl = document.createElement("p");
      speakerEl.className = "cutscene-speaker";
      speakerEl.textContent = page.speaker;
      box.appendChild(speakerEl);
    }
    const textEl = document.createElement("p");
    textEl.className = "cutscene-line";
    textEl.textContent = page.text || "";
    box.appendChild(textEl);
  });

  container.appendChild(box);

  const advanceBtn = document.createElement("button");
  advanceBtn.className = "btn btn-primary";
  container.appendChild(advanceBtn);

  function showContinueButton() {
    box.classList.add("hidden");
    advanceBtn.textContent = "I'm Ready. Continue";
    if (act.fadeOut) advanceBtn.classList.add("cutscene-continue-btn");
    advanceBtn.onclick = () => {
      advanceBtn.disabled = true;
      advanceBtn.textContent = "Waiting for the rest of the table...";
      socket.emit("act:acknowledgeReveal");
      const overlay = document.getElementById("cutscene-fade-overlay");
      overlay.classList.remove("visible");
    };
  }

  advanceBtn.onclick = () => {
    if (act.fadeOut) {
      const overlay = document.getElementById("cutscene-fade-overlay");
      overlay.classList.add("visible");
      setTimeout(() => showContinueButton(), 900);
    } else {
      showContinueButton();
    }
  };
  advanceBtn.textContent = "Continue";
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
    const countEl = document.getElementById("explore-progress-count");
    if (countEl) countEl.textContent = data.solved;
  }
});

initCharacterCreator();

// --- Explore mode (overworld) ---
let interactionsCache = null;
let isNearInteractable = false;

async function getInteractions() {
  if (interactionsCache) return interactionsCache;
  const res = await fetch("/content/interactions.json");
  interactionsCache = await res.json();
  return interactionsCache;
}

async function enterExplore(act) {
  const zoneId = act.zone || "estate";
  ZONE_MAPS[zoneId] = act.mapUrl;
  document.getElementById("explore-title").textContent = act.title;
  document.getElementById("explore-progress-count").textContent = "0";
  document.getElementById("btn-explore-force-advance").classList.toggle("hidden", state.hostId !== state.myId);

  // Walking through a zone_exit already tells the server which zone-room
  // to join (player:changeZone). Starting a brand new act never did, every
  // player was only ever joined to :estate at connection time, so anything
  // zone-scoped (pressure plate doors, the zone roster) would silently
  // never reach them here. Exact x/y doesn't matter much, the next move
  // update corrects it almost immediately.
  socket.emit("player:changeZone", { zone: zoneId, x: 0, y: 0 });

  const canvas = document.getElementById("explore-canvas");
  await Overworld.init({
    startZone: zoneId,
    canvas,
    socket,
    mapUrl: act.mapUrl,
    myGender: state.myGender,
    myColor: state.myColor,
    myName: (currentPlayers.find((p) => p.id === socket.id) || {}).name || "",
    spawnIndex: currentPlayers.findIndex((p) => p.id === socket.id),
    onNearbyChange: (obj) => {
      isNearInteractable = !!obj;
      const panelOpen = !document.getElementById("vn-panel").classList.contains("hidden");
      const btn = document.getElementById("btn-interact");
      btn.classList.toggle("hidden", !obj || panelOpen);
      if (obj && obj.interaction && obj.interaction.kind === "zone_exit") {
        btn.textContent = obj.interaction.targetZone === "estate" ? "Exit" : "Enter";
      } else {
        btn.textContent = "Examine";
      }
    },
    onInteract: (obj) => handleObjectInteract(obj),
    onPlateEnter: (plate) => {
      socket.emit("plate:enter", {
        zone: Overworld.getZone(),
        plateId: plate.id,
        targetDoorZoneId: plate.targetDoorZoneId,
        selfDoorZoneId: plate.selfDoorZoneId,
      });
    },
    onPlateLeave: (plate) => {
      socket.emit("plate:leave", { zone: Overworld.getZone(), plateId: plate.id });
    },
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
  jail_cells: null,
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
  } else if (kind === "evidence_document") {
    const entry = data[obj.interaction.documentId];
    if (entry) openDocumentModal(obj, entry);
  } else if (kind === "inventory_pickup") {
    socket.emit("inventory:pickup", { objectId: obj.id });
  } else if (kind === "table") {
    const allFound = currentAct && currentAct.completionCount && tableExhibits.length >= currentAct.completionCount;
    if (allFound && currentAct.type === "explore") {
      openReadyCheckModal();
    } else {
      openTableModal();
    }
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
  const frame = document.getElementById("vn-portrait-frame");
  const canvas = document.getElementById("vn-portrait");
  if (obj && obj.portrait) {
    frame.classList.remove("hidden");
    drawFixedPortrait(canvas, obj.portrait);
  } else {
    frame.classList.add("hidden");
  }
}

// --- Pagination: no scrollbars and no font-shrinking allowed, so when
// dialogue or document text doesn't fit the (deliberately short) box, it's
// split into pages instead, advanced by clicking the continue indicator.
let vnPages = [];
let vnPageIndex = 0;
let vnPageContainerId = null;

function paginateIntoContainer(containerId, lines, className) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const elements = lines.map((line) => {
    const p = document.createElement("p");
    p.className = className;
    p.textContent = line;
    return p;
  });

  const pages = [];
  let currentPage = [];
  elements.forEach((el) => {
    container.appendChild(el);
    currentPage.push(el);
    if (container.scrollHeight > container.clientHeight + 1 && currentPage.length > 1) {
      container.removeChild(el);
      pages.push(currentPage.slice(0, -1));
      currentPage = [el];
      container.appendChild(el);
    }
  });
  pages.push(currentPage);

  container.innerHTML = "";
  return pages;
}

function showVnPage(index) {
  const container = document.getElementById(vnPageContainerId);
  container.innerHTML = "";
  vnPages[index].forEach((el) => container.appendChild(el));
  document.getElementById("vn-continue-indicator").classList.toggle("hidden", index >= vnPages.length - 1);
}

function setupPagination(containerId, lines, className) {
  vnPageContainerId = containerId;
  vnPages = paginateIntoContainer(containerId, lines, className);
  vnPageIndex = 0;
  showVnPage(0);
}

document.getElementById("vn-continue-indicator").addEventListener("click", () => {
  if (vnPageIndex < vnPages.length - 1) {
    vnPageIndex += 1;
    showVnPage(vnPageIndex);
  }
});

function openDialogueModal(title, lines, obj) {
  document.getElementById("vn-dialogue-set").classList.remove("hidden");
  document.getElementById("vn-document-set").classList.add("hidden");
  document.getElementById("vn-continue-indicator").classList.add("hidden");
  setVnPortrait(obj);

  document.getElementById("dialogue-title").textContent = title;
  document.getElementById("vn-panel").classList.remove("hidden");
  document.getElementById("btn-interact").classList.add("hidden");

  // Panel has to actually be visible (and laid out) before we can measure
  // how much text fits, so pagination happens after the unhide above.
  setupPagination("dialogue-lines", lines, "dialogue-line");
}

function closeVnPanel() {
  document.getElementById("vn-panel").classList.add("hidden");
  document.getElementById("btn-interact").classList.toggle("hidden", !isNearInteractable);
}

document.getElementById("btn-close-vn").addEventListener("click", closeVnPanel);

socket.on("explore:dialogue", (data) => {
  openDialogueModal(data.title, data.lines);
});

let activeDocumentObj = null;
let activeDocumentEntry = null;

function openDocumentModal(obj, entry) {
  activeDocumentObj = obj;
  activeDocumentEntry = entry;

  document.getElementById("vn-dialogue-set").classList.add("hidden");
  document.getElementById("vn-document-set").classList.remove("hidden");
  document.getElementById("vn-continue-indicator").classList.add("hidden");
  setVnPortrait(obj);

  // Deliberately shows only the flavor/quest text here (entry.intro), never
  // the actual puzzle content (entry.table/list/closing). That stays hidden
  // until the item is on the Evidence Table and gets Investigated properly,
  // see openInvestigateModal, so examining evidence in the field can't
  // accidentally spoil the solve.
  document.getElementById("document-title").textContent = entry.title;
  document.getElementById("vn-panel").classList.remove("hidden");
  document.getElementById("btn-interact").classList.add("hidden");

  setupPagination("document-intro", [entry.intro || ""], "vn-prompt");
}

function buildDocumentTable(table) {
  const el = document.createElement("table");
  el.className = "document-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  table.headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  el.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  el.appendChild(tbody);
  return el;
}

function buildDocumentList(list) {
  const el = document.createElement("ul");
  el.className = "document-list";
  list.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    el.appendChild(li);
  });
  return el;
}

document.getElementById("btn-document-take").addEventListener("click", () => {
  if (!activeDocumentObj) return;
  socket.emit("inventory:pickup", {
    objectId: activeDocumentObj.id,
    itemId: activeDocumentEntry && activeDocumentEntry.itemId,
  });
  closeVnPanel();
  activeDocumentObj = null;
  activeDocumentEntry = null;
});

socket.on("map:objectRemoved", (data) => {
  Overworld.removeObject(data.objectId);
});

// Pressure-plate doors: the server decides open/closed (based on who's
// standing where, and whether this is the solo timed-pulse fallback), this
// just applies whatever it says to the local engine's animation/collision
// state machine.
socket.on("door:state", (data) => {
  Overworld.setRemoteDoorPhase(data.doorZoneId, data.open);
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

// Icons for each evidence item, falling back to a plain star for anything
// without a good thematic match in the icon packs.
const EVIDENCE_ICONS = {
  ledger_ashby: "/assets/ui/icons/star.png",
  satchel_voss: "/assets/ui/icons/star.png",
  manifests_kestrel: "/assets/ui/icons/evidence/bundle.png",
  blueprint_marrow: "/assets/ui/icons/star.png",
  letter_ashgate: "/assets/ui/icons/evidence/letter.png",
  rota_reyes: "/assets/ui/icons/evidence/scroll.png",
  diary_maid: "/assets/ui/icons/star.png",
};

function buildItemCard(item, opts) {
  const card = document.createElement("div");
  card.className = "item-card";
  const icon = document.createElement("div");
  icon.className = "item-card-icon";
  const img = document.createElement("img");
  img.src = EVIDENCE_ICONS[item.itemId] || "/assets/ui/icons/star.png";
  img.alt = "";
  img.className = "item-card-icon-img";
  icon.appendChild(img);
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
let currentAct = null; // the act payload from the most recent act:show, used by interactions that need to know completion state (e.g. the desk)

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

// --- The ready-check at the desk, once everything's been found ---
function openReadyCheckModal() {
  document.getElementById("ready-check-progress").textContent = "";
  const btn = document.getElementById("btn-ready-check");
  btn.disabled = false;
  btn.textContent = "I'm Ready. Continue";
  document.getElementById("modal-ready-check").classList.remove("hidden");
}
function closeReadyCheckModal() {
  document.getElementById("modal-ready-check").classList.add("hidden");
}
document.getElementById("btn-close-ready-check").addEventListener("click", closeReadyCheckModal);
document.getElementById("btn-ready-check").addEventListener("click", () => {
  const btn = document.getElementById("btn-ready-check");
  btn.disabled = true;
  btn.textContent = "Waiting for the rest of the table...";
  socket.emit("evidenceRoom:ready");
});

// --- Captain Thorne's evidence-complete announcement ---
// This pop-up is broadcast to every player the moment the last piece of
// evidence is found (server-side io.to(code).emit, not per-socket), and now
// carries the ready vote itself so the party can agree to continue right
// from here, no separate desk walk required. The desk (modal-ready-check)
// still works too, same vote, same progress counter, for anyone who closed
// this pop-up first.
function openThorneModal(text) {
  document.getElementById("thorne-message-text").textContent = text || "";
  const btn = document.getElementById("btn-thorne-ready");
  btn.disabled = false;
  btn.textContent = "I'm Ready. Continue";
  document.getElementById("thorne-ready-progress").textContent = "";
  document.getElementById("modal-thorne").classList.remove("hidden");
}
function closeThorneModal() {
  document.getElementById("modal-thorne").classList.add("hidden");
}
document.getElementById("btn-close-thorne").addEventListener("click", closeThorneModal);
document.getElementById("btn-thorne-ready").addEventListener("click", () => {
  const btn = document.getElementById("btn-thorne-ready");
  btn.disabled = true;
  btn.textContent = "Waiting for the rest of the table...";
  socket.emit("evidenceRoom:ready");
});
socket.on("thorne:message", ({ text }) => openThorneModal(text));

socket.on("evidenceRoom:readyProgress", ({ ready, total }) => {
  document.getElementById("ready-check-progress").textContent = `${ready} / ${total} ready`;
  document.getElementById("thorne-ready-progress").textContent = `${ready} / ${total} ready`;
});

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

// --- Investigate an exhibit (the real puzzle content lives here) ---
let documentByItemId = null;

async function findDocumentForItem(itemId) {
  if (!documentByItemId) {
    const data = await getInteractions();
    documentByItemId = {};
    Object.values(data).forEach((entry) => {
      if (entry && entry.type === "document" && entry.itemId) {
        documentByItemId[entry.itemId] = entry;
      }
    });
  }
  return documentByItemId[itemId] || null;
}

async function openInvestigateModal(exhibit) {
  document.getElementById("investigate-title").textContent = `Exhibit ${exhibit.letter}: ${exhibit.name}`;
  const art = document.getElementById("investigate-art");
  if (exhibit.art) {
    art.src = exhibit.art;
    art.classList.remove("hidden");
  } else {
    art.classList.add("hidden");
  }

  const extra = document.getElementById("investigate-extra");
  extra.innerHTML = "";
  const doc = await findDocumentForItem(exhibit.itemId);
  if (doc) {
    document.getElementById("investigate-intro").textContent = doc.intro || "";
    if (doc.table) extra.appendChild(buildDocumentTable(doc.table));
    if (doc.list) extra.appendChild(buildDocumentList(doc.list));
    // doc.closing deliberately not shown here. It's the actual deduction
    // (why the evidence doesn't add up), and the party needs to work that
    // out themselves at the table, not have it handed to them the moment
    // they investigate the exhibit.
  } else {
    document.getElementById("investigate-intro").textContent =
      exhibit.description || "No further details recorded yet.";
  }

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
  document.getElementById("board-submit-progress").textContent = "";
  resetBoardSubmitButton();
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
  img.crossOrigin = "anonymous";
  img.onload = () => {
    // Chroma-key the flat white background out via flood fill from the
    // four corners, rather than a blanket colour threshold across the
    // whole image, so a genuinely white detail inside the portrait (an
    // eye, a shirt collar) that isn't connected to the outer edge is left
    // alone. Only run this on portraits big enough to be real
    // illustrations, the small 32x32 auto-cropped sprite icons don't
    // reliably have a flat background and shouldn't be touched.
    let source = img;
    if (img.naturalWidth > 64 && img.naturalHeight > 64) {
      source = chromaKeyWhiteBackground(img);
    }

    // Cover-fit anchored at the bottom: fills the whole frame the way a
    // Stardew-style bust portrait does, cropping off any excess (usually
    // the top of the hair) rather than leaving empty space around a
    // smaller contained image. A small extra zoom on top of pure cover-fit
    // keeps this tight even when a source image has some breathing room
    // baked in around the character, rather than only filling the frame
    // exactly when the source happens to already be a perfect crop.
    const ZOOM = 1.15;
    const scale = Math.max(canvas.width / source.width, canvas.height / source.height) * ZOOM;
    const w = source.width * scale;
    const h = source.height * scale;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - h;
    ctx.drawImage(source, x, y, w, h);
  };
  img.src = src;
}

function chromaKeyWhiteBackground(img) {
  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0);

  let imgData;
  try {
    imgData = octx.getImageData(0, 0, off.width, off.height);
  } catch (e) {
    return img; // canvas got tainted (cross-origin without CORS headers), just use the image as-is
  }
  const data = imgData.data;
  const w = off.width, h = off.height;
  const isNearWhite = (i) => data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235;

  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) {
    stack.push([x, 0], [x, h - 1]);
  }
  for (let y = 0; y < h; y++) {
    stack.push([0, y], [w - 1, y]);
  }

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    const i = idx * 4;
    if (!isNearWhite(i)) continue;
    visited[idx] = 1;
    data[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  octx.putImageData(imgData, 0, 0);
  return off;
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

document.getElementById("btn-review-evidence").addEventListener("click", () => openTableModal());

document.getElementById("btn-board-submit").addEventListener("click", () => {
  const btn = document.getElementById("btn-board-submit");
  btn.disabled = true;
  btn.textContent = "Waiting for the rest of the table...";
  socket.emit("board:submit");
});

socket.on("board:state", (state) => {
  renderBoard(state.zone || []);
});

function resetBoardSubmitButton() {
  const btn = document.getElementById("btn-board-submit");
  btn.disabled = false;
  btn.textContent = "Submit to Captain Thorne";
}

socket.on("board:submitProgress", ({ ready, total }) => {
  document.getElementById("board-submit-progress").textContent =
    ready > 0 ? `${ready} / ${total} ready to submit` : "";
  if (ready === 0) resetBoardSubmitButton();
});

socket.on("board:result", (data) => {
  const fb = document.getElementById("board-feedback");
  if (data.correct) {
    fb.className = "feedback correct";
    fb.textContent = "\"...Yes. That's it. Good work.\"";
  } else {
    fb.className = "feedback incorrect";
    fb.textContent = data.message || "That's not right. Try again.";
    resetBoardSubmitButton();
    document.getElementById("board-submit-progress").textContent = "";
  }
});
