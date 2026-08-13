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

// --- Session persistence across disconnects/refreshes ---
// The server hands back a reconnect token on host:createRoom/player:joinRoom
// that's unrelated to socket.id (which changes every connection). Saving it
// here means a refreshed tab, a dropped wifi connection, or a phone that
// went to sleep can all reclaim the same seat, same inventory, same act,
// instead of the player being locked out once the game has started.
const SESSION_KEY = "sherlockSession";

function saveSession(code, token) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, token }));
  } catch (e) {
    // Private browsing / storage disabled: reconnect just won't be
    // available for this tab, not worth failing the game over.
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // ignore
  }
}

function attemptResume() {
  const session = loadSession();
  if (!session || !session.code || !session.token) return;

  showScreen("screen-reconnecting");
  socket.emit("player:rejoin", session, (res) => {
    if (!res || !res.ok) {
      clearSession();
      showScreen("screen-landing");
      return;
    }
    state.isHost = false; // corrected for real by the room:update that follows
    state.roomCode = res.code;
    saveSession(res.code, res.token);
    document.getElementById("room-code-display").textContent = res.code;
    // If the game hasn't started, room:update drives us to the lobby.
    // If it has, the server follows this callback with act:show, which
    // switches to screen-game on its own. Nothing else to do here.
  });
}

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
    saveSession(res.code, res.token);
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
    saveSession(res.code, res.token);
    document.getElementById("room-code-display").textContent = res.code;
    showScreen("screen-lobby");
  });
});

// --- Lobby / room updates ---
let currentPlayers = [];

attemptResume();

socket.on("room:update", (data) => {
  state.myId = socket.id;
  state.hostId = data.hostId;
  currentPlayers = data.players;
  const isMeHost = data.hostId === socket.id;

  // On a normal join, character creation is what sets these. On a
  // reconnect/refresh resume, that screen is skipped entirely, so without
  // this the local client would render itself with the default
  // gender/color forever while everyone else's client (which renders us
  // from this same roster data) correctly shows our real one.
  const me = data.players.find((p) => p.id === socket.id);
  if (me) {
    state.myGender = me.gender || state.myGender;
    state.myColor = me.color || state.myColor;
  }

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

  document.getElementById("host-tools").classList.toggle("hidden", !isMeHost);
});

document.getElementById("btn-start").addEventListener("click", () => {
  socket.emit("host:startGame");
});

function leaveGame() {
  socket.emit("player:leave");
  clearSession();
  location.reload();
}
document.getElementById("btn-leave-lobby").addEventListener("click", leaveGame);
document.getElementById("btn-leave-game").addEventListener("click", leaveGame);

document.getElementById("btn-host-force-advance").addEventListener("click", () => {
  socket.emit("host:advanceAct");
});

socket.on("host:disconnected", () => {
  alert("The host has disconnected. The game may be paused until they return.");
});

socket.on("game:reset", () => {
  showScreen("screen-lobby");
});

socket.on("scene:fadeToBlack", () => {
  document.getElementById("cutscene-fade-overlay").classList.add("visible");
  document.getElementById("btn-interact").classList.add("hidden");
  Overworld.freeze();
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
  // Exception: acts flagged fadeIn arrive with the overlay already visible
  // (from scene:fadeToBlack, broadcast the moment the previous act's
  // completion condition was met) - those clear it themselves once their
  // own setup is actually ready, in enterStagedScene, so the fade up
  // happens after the scene is loaded and positioned, not before.
  if (!act.fadeIn) {
    document.getElementById("cutscene-fade-overlay").classList.remove("visible");
  }

  // Same "one guaranteed place, every transition" reasoning as the fade
  // overlay above - the board button's visibility just tracks whatever
  // the current act says, on every single act change, so it can never be
  // left showing (or hidden) from a previous act's setting.
  document.getElementById("btn-open-board").classList.toggle("hidden", !act.showBoard);
  if (act.showBoard) {
    // Pulls the live count for the HUD badge immediately, not just once
    // the player actually opens the panel - the counter is meant to be
    // visible at a glance the whole time, per Elle's spec.
    socket.emit("board3:requestState");
  }
  // Same reasoning as the board button above - Point the Finger only ever
  // shows during the one act that actually uses it.
  document.getElementById("btn-open-vote").classList.toggle("hidden", !act.showVote);
  const strayReadyBtn = document.getElementById("staged-scene-ready-btn");
  if (strayReadyBtn) strayReadyBtn.remove();
  const strayLabel = document.getElementById("staged-scene-next-act-label");
  if (strayLabel) strayLabel.remove();
  const strayVideoBtn = document.getElementById("staged-scene-video-btn");
  if (strayVideoBtn) strayVideoBtn.remove();
  const strayVideo = document.getElementById("staged-scene-video");
  if (strayVideo) strayVideo.remove();

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

  if (act.type === "staged_scene") {
    actFrame.classList.add("hidden");
    boardFrame.classList.add("hidden");
    exploreFrame.classList.remove("hidden");
    Overworld.stop();
    enterStagedScene(act);
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
let candleLitState = {}; // candleId -> true, mirrors the current zone's server state
let currentNearbyObj = null; // last object passed to onNearbyChange, so candle:state can refresh its label without waiting for proximity to change

function refreshInteractButtonLabel() {
  const btn = document.getElementById("btn-interact");
  if (!btn || btn.classList.contains("hidden")) return;
  const obj = currentNearbyObj;
  if (obj && obj.interaction && obj.interaction.kind === "zone_exit") {
    // Within the dungeon arc, every progress exit reads the same simple
    // "Continue" regardless of source/target room, per house request -
    // this is distinct from the estate's contextual Enter/Exit/Examine
    // convention, which stays as-is outside the dungeon.
    if (DUNGEON_ZONES.has(Overworld.getZone())) {
      btn.textContent = "Continue";
    } else {
      btn.textContent = obj.interaction.targetZone === "estate" ? "Exit" : "Enter";
    }
  } else if (obj && obj.interaction && obj.interaction.kind === "candle") {
    btn.textContent = candleLitState[obj.interaction.candleId] ? "Extinguish" : "Light";
  } else if (obj && obj.interaction && obj.interaction.kind === "lever") {
    const zone = Overworld.getZone();
    const isSimpleLever = interactionsCache && interactionsCache.simpleLevers && interactionsCache.simpleLevers[zone];
    btn.textContent = isSimpleLever ? "Pull the Lever" : "Reset";
  } else if (obj && obj.interaction && obj.interaction.kind === "pet") {
    btn.textContent = "Pet";
  } else if (obj && obj.interaction && obj.interaction.kind === "locked_door") {
    btn.textContent = "Unlock";
  } else if (obj && obj.interaction && obj.interaction.kind === "search_twice") {
    btn.textContent = "Search";
  } else if (obj && obj.interaction && obj.interaction.kind === "locked_container") {
    btn.textContent = "Open";
  } else {
    btn.textContent = "Examine";
  }
}

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
  // This little counter only means anything for the Estate's own
  // evidence-gated completion. Acts that finish some other way (the
  // dungeon's zone-reached completion, this one's vote-based completion)
  // have their own dedicated progress indicators already (the Board's
  // clue badge, the vote's "voted: X/Y"), so showing an unrelated "0"
  // here would just be confusing clutter, not real information.
  document.getElementById("explore-progress").classList.toggle("hidden", act.completionMode !== "evidence");

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
    spawnIndex: typeof act.spawnIndex === "number" ? act.spawnIndex : currentPlayers.findIndex((p) => p.id === socket.id),
    collectedIds: act.collectedPickups || [],
    onNearbyChange: (obj) => {
      isNearInteractable = !!obj;
      currentNearbyObj = obj;
      const panelOpen = !document.getElementById("vn-panel").classList.contains("hidden");
      const btn = document.getElementById("btn-interact");
      btn.classList.toggle("hidden", !obj || panelOpen);
      refreshInteractButtonLabel();
    },
    onInteract: (obj) => handleObjectInteract(obj),
    onPlateEnter: (plate) => {
      socket.emit("plate:enter", {
        zone: Overworld.getZone(),
        plateId: plate.id,
        cellId: plate.cellId,
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

// A scripted in-game beat (Voss + two guards walking in on the party to
// end "Means and Opportunity, Interrupted"): loads a map like a normal
// explore act, but freezes the local player at a fixed mark instead of
// giving them movement, plays a scripted walk-in for the named actors,
// then hands off to a VN dialogue sequence once everyone's arrived.
async function enterStagedScene(act) {
  document.getElementById("btn-interact").classList.add("hidden");
  updateZoneLabel("");

  const zoneId = act.zone || "estate";
  socket.emit("player:changeZone", { zone: zoneId, x: 0, y: 0 });

  const myIndex = Math.max(0, currentPlayers.findIndex((p) => p.id === socket.id));
  const marks = act.playerMarks || [];
  const myMark = marks.length ? marks[myIndex % marks.length] : null;

  const canvas = document.getElementById("explore-canvas");
  await Overworld.init({
    startZone: zoneId,
    canvas,
    socket,
    mapUrl: act.mapUrl,
    myGender: state.myGender,
    myColor: state.myColor,
    myName: (currentPlayers.find((p) => p.id === socket.id) || {}).name || "",
    spawnIndex: myIndex,
    collectedIds: [],
  });

  Overworld.resize();
  Overworld.setRoster(currentPlayers || [], socket.id);
  Overworld.start();

  // TILE is 16px in overworld.js's internal grid - matched here so other
  // clients see us standing at the right mark too, same as any ordinary
  // player:move broadcast.
  if (myMark) {
    socket.emit("player:move", { x: myMark[0] * 16 + 8, y: myMark[1] * 16 + 8, dir: "up", moving: false });
  }

  // Fade up now that the scene is actually loaded and everyone's mark is
  // set - see act:show's matching skip of the instant clear for fadeIn
  // acts. A tiny delay lets the mark position above actually paint one
  // frame before the black clears, so the fade-up doesn't reveal a
  // half-placed scene.
  if (act.fadeIn) {
    requestAnimationFrame(() => {
      document.getElementById("cutscene-fade-overlay").classList.remove("visible");
    });
  }

  if (act.video) {
    showStagedSceneVideoPrompt(act);
  } else {
    Overworld.beginStagedScene({
      myMark,
      actors: act.actors || [],
      cameraCenter: act.cameraCenter || null,
      playerSortBoost: act.playerSortBoost || 0,
      onArrived: () => {
        playScriptedDialogue(act.dialogue || [], () => finishStagedScene(act));
      },
    });
  }
}

// A real recorded video standing in for the scripted sprite walk-in.
// Everyone gets teleported to their mark first (above), same as before,
// then whoever clicks Play triggers it for the whole table at once via the
// server (stagedScene:playVideo / stagedScene:videoStarted), so nobody
// watches it out of sync with everyone else.
function showStagedSceneVideoPrompt(act) {
  const btn = document.createElement("button");
  btn.id = "staged-scene-video-btn";
  btn.className = "btn btn-primary cutscene-continue-btn";
  btn.textContent = "Play Cutscene";
  btn.onclick = () => {
    btn.disabled = true;
    btn.textContent = "Starting...";
    socket.emit("stagedScene:playVideo");
  };
  document.body.appendChild(btn);
}

function playStagedSceneVideo(act) {
  const stray = document.getElementById("staged-scene-video-btn");
  if (stray) stray.remove();

  const video = document.createElement("video");
  video.id = "staged-scene-video";
  video.src = act.video;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = false;
  video.className = "staged-scene-video";

  const finish = () => {
    video.remove();
    playScriptedDialogue(act.dialogue || [], () => finishStagedScene(act));
  };
  video.addEventListener("ended", finish);
  video.addEventListener("error", finish); // don't strand the party if the file 404s
  document.body.appendChild(video);
  video.play().catch(() => {
    // Autoplay blocked (rare with a prior user gesture from the Play
    // button click, but browsers vary) - show a manual play control instead
    // of silently doing nothing.
    video.controls = true;
  });
}

socket.on("stagedScene:videoStarted", () => {
  if (currentAct && currentAct.type === "staged_scene" && currentAct.video) {
    playStagedSceneVideo(currentAct);
  }
});

function finishStagedScene(act) {
  if (act.fadeOut) {
    const overlay = document.getElementById("cutscene-fade-overlay");
    overlay.classList.add("visible");
    setTimeout(() => showStagedSceneReadyButton(act.nextActEyebrow, act.nextActTitle), 900);
  } else {
    showStagedSceneReadyButton(act.nextActEyebrow, act.nextActTitle);
  }
}

function showStagedSceneReadyButton(nextActEyebrow, nextActTitle) {
  if (nextActEyebrow || nextActTitle) {
    const header = document.createElement("div");
    header.id = "staged-scene-next-act-label";
    header.className = "staged-scene-next-act-header";
    header.innerHTML =
      (nextActEyebrow ? `<p class="eyebrow">${nextActEyebrow}</p>` : "") +
      (nextActTitle ? `<h2 class="act-title">${nextActTitle}</h2>` : "");
    document.body.appendChild(header);
  }
  const btn = document.createElement("button");
  btn.id = "staged-scene-ready-btn";
  btn.className = "btn btn-primary cutscene-continue-btn";
  btn.textContent = "I'm Ready. Continue";
  btn.onclick = () => {
    btn.disabled = true;
    btn.textContent = "Waiting for the rest of the table...";
    socket.emit("act:acknowledgeReveal");
  };
  document.body.appendChild(btn);
}

window.addEventListener("resize", () => {
  if (!document.getElementById("explore-frame").classList.contains("hidden")) {
    Overworld.resize();
  }
});

document.getElementById("btn-interact").addEventListener("click", () => {
  Overworld.triggerInteractFromButton();
});

document.getElementById("btn-host-skip-step").addEventListener("click", () => {
  socket.emit("host:skipZonePuzzle");
});

document.getElementById("btn-host-reset-puzzle").addEventListener("click", () => {
  socket.emit("host:resetZonePuzzle");
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
  guild_hall_ground: "/assets/maps/guild_hall_ground.json",
  guild_hall_upper: "/assets/maps/guild_hall_upper.json",
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
  training_ground: "/assets/maps/training_ground.json",
  blacksmith_interior: "/assets/maps/blacksmith_interior.json",
  mage_tower_basement: "/assets/maps/mage_tower_basement.json",
  mage_tower_1st_floor: "/assets/maps/mage_tower_1st_floor.json",
  mage_tower_2nd_floor: "/assets/maps/mage_tower_2nd_floor.json",
  tavern_2nd_floor: "/assets/maps/tavern_2nd_floor.json",
  tavern_1st_floor: "/assets/maps/tavern_1st_floor.json",
  chapel_interior: "/assets/maps/chapel_interior.json",
  glass_workshop: "/assets/maps/glass_workshop.json",
  guild_hall_exterior: "/assets/maps/guild_hall_exterior.json",
  town_exterior: "/assets/maps/town_exterior.json",
};

// Zones that make up the post-jail dungeon arc, used to switch the zone_exit
// interact button to the simpler "Continue" label instead of the estate's
// contextual Enter/Exit/Examine convention.
const DUNGEON_ZONES = new Set([
  "jail_cells",
  "dungeon_area_2",
  "dungeon_area_3",
  "dungeon_area_4",
  "dungeon_area_4_kennels",
  "dungeon_area_4_ossuary",
  "dungeon_area_4_treasury",
  "dungeon_area_4_lower_stores",
  "dungeon_area_5",
  "dungeon_area_6",
  "dungeon_finale",
  "outside_sewer",
]);

function updateZoneLabel(zoneId) {
  const label = {
    estate: "",
    barn_interior: "The Barn",
    dock_interior: "The Dockhouse",
    manor_ground: "The Manor",
    manor_upper: "The Manor, Upstairs",
    guild_hall_ground: "The Guild Hall",
    guild_hall_upper: "The Guild Hall, Upstairs",
  }[zoneId] || "";
  const el = document.getElementById("explore-zone-label");
  if (el) el.textContent = label;
}

// Cycling flavor dialogue: an object that hands back a different line each
// time it's interacted with (the flirty guy's pickup lines, the dragon's
// riddle fragments), wrapping back to the start once it runs out. Purely
// client-side and per-tab, not synced or persisted - there's nothing here
// worth the round trip, it's a repeatable joke, not game state. Resets on
// refresh, which is fine for what this is.
const cycleDialogueState = {};
function nextCycleLine(objId, lines) {
  const i = cycleDialogueState[objId] || 0;
  cycleDialogueState[objId] = (i + 1) % lines.length;
  return lines[i];
}

async function handleObjectInteract(obj) {
  const kind = obj.interaction && obj.interaction.kind;
  const data = await getInteractions();

  // Generic hook, not tied to any one interaction kind: any object can
  // optionally teach the party a trigger fact the instant it's interacted
  // with (a document, a dialogue line, a note), independent of whatever
  // else that interaction does. Means and Opportunity's split-knowledge
  // town gathering is the first real use of this.
  if (obj.interaction && obj.interaction.learnsFact) {
    socket.emit("fact:learn", { factId: obj.interaction.learnsFact });
  }

  // Same generic-hook pattern as learnsFact above, for interactions that
  // hand the party a board clue directly (not gated behind a two-stage
  // reveal, which handles its own clue collection server-side since only
  // the server knows which stage the player actually saw). Some NPCs
  // (the lying monk) hand over several clues in one conversation, so this
  // accepts either a single id or an array.
  if (obj.interaction && obj.interaction.boardClueId) {
    const ids = Array.isArray(obj.interaction.boardClueId) ? obj.interaction.boardClueId : [obj.interaction.boardClueId];
    ids.forEach((clueId) => socket.emit("board:clueFound", { clueId }));
  }

  if (kind === "two_stage_dialogue") {
    socket.emit("npc:twoStageDialogue", { npcId: obj.interaction.npcId });
  } else if (kind === "dialogue") {
    const entry = data[obj.interaction.dialogueId];
    if (entry) openDialogueModal(entry.title, entry.lines, obj);
  } else if (kind === "note") {
    openDialogueModal(obj.name, [obj.interaction.text], obj);
  } else if (kind === "cycle_note") {
    const lines = obj.interaction.lines || [];
    if (lines.length) {
      openDialogueModal(obj.name, [nextCycleLine(obj.id, lines)], obj);
    }
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
  } else if (kind === "open_vote") {
    openVoteModal();
  } else if (kind === "candle") {
    socket.emit("candle:toggle", { zone: Overworld.getZone(), candleId: obj.interaction.candleId });
  } else if (kind === "lever") {
    socket.emit("candle:reset", { zone: Overworld.getZone() });
  } else if (kind === "pet") {
    socket.emit("pet:animal", { zone: Overworld.getZone(), animalId: obj.interaction.animalId, x: obj.x, y: obj.y });
  } else if (kind === "locked_door") {
    socket.emit("door:unlock", { zone: Overworld.getZone(), doorId: obj.interaction.doorId });
  } else if (kind === "search_twice") {
    socket.emit("search:interact", { zone: Overworld.getZone(), objectId: obj.id, searchId: obj.interaction.searchId });
  } else if (kind === "locked_container") {
    socket.emit("container:unlock", { zone: Overworld.getZone(), objectId: obj.id, containerId: obj.interaction.containerId });
  } else if (kind === "zone_exit") {
    const targetZone = obj.interaction.targetZone;
    const mapUrl = ZONE_MAPS[targetZone];
    if (!mapUrl) return;
    document.getElementById("btn-interact").classList.add("hidden");
    try {
      await Overworld.changeZone(targetZone, mapUrl, obj.interaction.targetX, obj.interaction.targetY);
    } catch (err) {
      console.error("Zone change to", targetZone, "failed:", err);
      document.getElementById("btn-interact").classList.remove("hidden");
      return;
    }
    socket.emit("player:changeZone", {
      zone: targetZone,
      x: obj.interaction.targetX,
      y: obj.interaction.targetY,
    });
    updateZoneLabel(targetZone);
  }
}

// Sprite-based dialogue "portraits": Act 1 and Act 3 alike no longer use
// illustrated character art in the dialogue frame - too many NPCs to
// commission full portraits for consistently, so the whole game now uses
// each NPC's own walking sprite instead, kept small and simple rather
// than trying to make a tiny pixel-art figure fill a big portrait frame.
let npcLooksManifestCache = null;
async function getNpcLooksManifest() {
  if (!npcLooksManifestCache) {
    const res = await fetch("/assets/npcs/looks/manifest.json");
    npcLooksManifestCache = await res.json();
  }
  return npcLooksManifestCache;
}

async function drawNpcSpritePortrait(canvas, lookKey) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const manifest = await getNpcLooksManifest();
  const look = manifest[lookKey];
  if (!look) return;
  const frameSet = look.idle || look.walk;
  const img = new Image();
  img.onload = () => {
    const cell = frameSet.cell;
    // Down-facing, first idle frame (a plain standing pose) - row 0 always
    // means "down" across every look in this manifest, matching the same
    // convention the overworld renderer uses for these NPCs.
    const sx = 0;
    const sy = 0;
    // Contain-fit, not cover-fit: unlike the old illustrated portraits,
    // there's no reason to crop a small sprite - the whole character
    // should be visible, just centred and scaled up cleanly.
    const scale = Math.min(canvas.width / cell, canvas.height / cell);
    const drawW = cell * scale;
    const drawH = cell * scale;
    const dx = (canvas.width - drawW) / 2;
    const dy = (canvas.height - drawH) / 2;
    ctx.drawImage(img, sx, sy, cell, cell, dx, dy, drawW, drawH);
  };
  img.src = frameSet.src;
}

function setVnPortrait(obj) {
  const frame = document.getElementById("vn-portrait-frame");
  const canvas = document.getElementById("vn-portrait");
  const textFrame = document.getElementById("vn-text-frame");
  const hasPortrait = !!(obj && obj.portrait);
  const hasSprite = !hasPortrait && !!(obj && obj.look);
  if (hasPortrait) {
    frame.classList.remove("hidden");
    frame.classList.remove("vn-sprite-mode");
    canvas.classList.remove("vn-sprite-mode");
    drawFixedPortrait(canvas, obj.portrait);
  } else if (hasSprite) {
    frame.classList.remove("hidden");
    frame.classList.add("vn-sprite-mode");
    canvas.classList.add("vn-sprite-mode");
    drawNpcSpritePortrait(canvas, obj.look);
  } else {
    frame.classList.add("hidden");
  }
  if (textFrame) {
    textFrame.classList.toggle("vn-compact", !hasPortrait && !hasSprite);
    textFrame.classList.toggle("vn-sprite-mode", hasSprite);
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

  // Authored content uses "\n\n" as a paragraph break within a single
  // logical utterance (the same convention used throughout the dialogue
  // script), but each incoming array entry was being turned into exactly
  // one <p> regardless of how many paragraphs it actually contained. A
  // long multi-paragraph entry became one giant unsplittable element -
  // pagination only ever triggers between separate elements, so that
  // whole block just overflowed instead of splitting into pages. Flatten
  // every entry's internal paragraph breaks into their own elements
  // first, so pagination has real, individually-sized units to work with.
  const paragraphs = lines.flatMap((line) => String(line).split(/\n\s*\n/));

  const elements = paragraphs.map((line) => {
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
  if (inScriptedDialogue) {
    advanceScriptedDialogue();
    return;
  }
  if (vnPageIndex < vnPages.length - 1) {
    vnPageIndex += 1;
    showVnPage(vnPageIndex);
  }
});

// --- Scripted multi-speaker dialogue (staged scenes) ---
// Reuses the same VN panel as ordinary NPC dialogue, but each page can
// have its own speaker name and portrait (Thorne, narration, Voss...)
// instead of one fixed speaker for the whole conversation. Text overflow
// still paginates internally per line via setupPagination/showVnPage;
// this only decides when to move to the *next scripted line* once a
// line's own internal pages are exhausted.
let inScriptedDialogue = false;
let scriptedDialoguePages = [];
let scriptedDialogueIndex = 0;
let scriptedDialogueOnComplete = null;

function playScriptedDialogue(pages, onComplete) {
  if (!pages || !pages.length) {
    if (onComplete) onComplete();
    return;
  }
  inScriptedDialogue = true;
  scriptedDialoguePages = pages;
  scriptedDialogueIndex = 0;
  scriptedDialogueOnComplete = onComplete;

  document.getElementById("vn-dialogue-set").classList.remove("hidden");
  document.getElementById("vn-document-set").classList.add("hidden");
  document.getElementById("vn-panel").classList.remove("hidden");
  document.getElementById("btn-interact").classList.add("hidden");
  document.getElementById("btn-close-vn").classList.add("hidden"); // mandatory beat, no early dismiss
  showScriptedDialoguePage(0);
}

function showScriptedDialoguePage(i) {
  const page = scriptedDialoguePages[i];
  document.getElementById("dialogue-title").textContent = page.speaker || "";
  setVnPortrait({ portrait: page.portrait || null, look: page.look || null });
  setupPagination("dialogue-lines", [page.text || ""], "dialogue-line");
  document.getElementById("vn-continue-indicator").classList.remove("hidden");
}

function advanceScriptedDialogue() {
  if (vnPageIndex < vnPages.length - 1) {
    vnPageIndex += 1;
    showVnPage(vnPageIndex);
    document.getElementById("vn-continue-indicator").classList.remove("hidden");
    return;
  }
  scriptedDialogueIndex += 1;
  if (scriptedDialogueIndex >= scriptedDialoguePages.length) {
    inScriptedDialogue = false;
    document.getElementById("vn-panel").classList.add("hidden");
    document.getElementById("btn-close-vn").classList.remove("hidden");
    const cb = scriptedDialogueOnComplete;
    scriptedDialogueOnComplete = null;
    if (cb) cb();
    return;
  }
  showScriptedDialoguePage(scriptedDialogueIndex);
}

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

// Response to npc:twoStageDialogue - separate listener from explore:dialogue
// above (which is party-wide broadcast content like candle puzzle results)
// since this is a private answer to one player's own question, resolved
// server-side against party fact state.
socket.on("npc:dialogue", (data) => {
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

socket.on("candle:state", (data) => {
  candleLitState = data.lit || {};
  Overworld.setCandleState(candleLitState);
  refreshInteractButtonLabel();
});

socket.on("pet:animal", (data) => {
  Overworld.showPetHeart(data.x, data.y);
});

// --- Player inventory (private, held items not yet on the Evidence Table) ---
let myInventory = [];

function openInventoryModal() {
  socket.emit("inventory:requestState");
  const desc = document.getElementById("inventory-description");
  desc.textContent =
    currentAct && currentAct.prefillInventoryFromEvidence
      ? "This is the evidence you were carrying the night they arrested you - all of it, whether you found it yourself or not."
      : "Take items to the evidence table to investigate.";
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
    grid.appendChild(
      buildItemCard(item, {
        title: item.letter ? `EXHIBIT ${item.letter}` : item.name,
        subtitle: item.letter ? item.name : null,
        // Lets a picked-up document (dungeon loose pages, chest notes, etc)
        // be reread at any time from the plain Inventory panel, not just
        // once in the field - previously these cards had no onClick at
        // all, so nothing happened when you tapped one.
        onClick: () => openInvestigateModal({ letter: item.letter, name: item.name, itemId: item.itemId, art: item.art }),
      })
    );
  });
}

// Icons for each evidence item, falling back to a plain star for anything
// without a good thematic match in the icon packs.
const EVIDENCE_ICONS = {
  ledger_ashby: "/assets/ui/icons/evidence/ledger.png",
  satchel_voss: "/assets/ui/icons/evidence/satchel.png",
  manifests_kestrel: "/assets/ui/icons/evidence/bundle.png",
  blueprint_marrow: "/assets/ui/icons/evidence/blueprint.png",
  letter_ashgate: "/assets/ui/icons/evidence/letter.png",
  rota_reyes: "/assets/ui/icons/evidence/scroll.png",
  diary_maid: "/assets/ui/icons/evidence/diary.png",
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
  const title = document.createElement("div");
  title.className = "item-card-label";
  title.textContent = opts.title || item.name;
  card.appendChild(icon);
  card.appendChild(title);
  if (opts.subtitle) {
    const sub = document.createElement("div");
    sub.className = "item-card-subtitle";
    sub.textContent = opts.subtitle;
    card.appendChild(sub);
  }
  if (opts.onClick) card.addEventListener("click", opts.onClick);
  return card;
}

// --- Means and Opportunity deduction board (shared, live-synced) ---
let boardState = { clues: {}, total: 0, foundCount: 0 };
let boardFinalists = [];
let draggedClueId = null;

async function openBoardModal() {
  if (!boardFinalists.length) {
    const data = await getInteractions();
    boardFinalists = data.boardFinalists || [];
  }
  socket.emit("board3:requestState");
  document.getElementById("modal-board").classList.remove("hidden");
}

document.getElementById("btn-open-board").addEventListener("click", openBoardModal);
document.getElementById("btn-close-board").addEventListener("click", () => {
  document.getElementById("modal-board").classList.add("hidden");
});

socket.on("board3:state", (state) => {
  boardState = state;
  updateBoardCounters();
  renderDeductionBoard();
});

socket.on("board3:claimed", ({ clueId, playerId }) => {
  if (!boardState.clues[clueId]) return;
  boardState.clues[clueId].claimedBy = playerId;
  renderDeductionBoard();
});

function updateBoardCounters() {
  const text = `${boardState.foundCount} / ${boardState.total}`;
  document.getElementById("board-clue-progress").textContent = `Clues found: ${text}`;
  document.getElementById("board-clue-count").textContent = text;
}

function buildBoardCard(clue) {
  const card = document.createElement("div");
  card.className = "board-card";
  if (clue.ignored) card.classList.add("ignored");
  const claimedByMe = clue.claimedBy === socket.id;
  const claimedByOther = clue.claimedBy && !claimedByMe;
  if (claimedByOther) card.classList.add("claimed-by-other");
  card.draggable = !claimedByOther;
  card.dataset.clueId = clue.id;

  const ignoreBtn = document.createElement("button");
  ignoreBtn.className = "board-card-ignore-btn";
  ignoreBtn.textContent = clue.ignored ? "unignore" : "ignore";
  // The card itself is draggable=true. Without this, a browser can
  // interpret a click that starts on this button as the start of a card
  // drag instead (any tiny mouse movement during the click gets read as
  // a drag gesture beginning on a draggable ancestor), so the button's
  // own click handler never fires - this was very likely why "ignore"
  // looked completely dead rather than just unreliable.
  ignoreBtn.draggable = false;
  ignoreBtn.addEventListener("dragstart", (e) => e.stopPropagation());
  ignoreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    socket.emit("board3:toggleIgnore", { clueId: clue.id });
  });
  card.appendChild(ignoreBtn);

  const title = document.createElement("div");
  title.className = "board-card-title";
  title.textContent = clue.title;
  card.appendChild(title);

  // Full clue quotes can run long, and with 23 of these across the tray
  // and grid the board was growing far taller than the viewport. Shows
  // a short preview on the card itself; "more" opens the full text in
  // its own modal rather than expanding the card in place, so reading
  // one long clue doesn't reflow every other card around it.
  const text = document.createElement("div");
  text.className = "board-card-text";
  const isLong = clue.text.length > 70;
  text.textContent = isLong ? clue.text.slice(0, 70).trimEnd() + "\u2026" : clue.text;
  card.appendChild(text);

  if (isLong) {
    const toggle = document.createElement("button");
    toggle.className = "board-card-expand-btn";
    toggle.textContent = "more";
    toggle.draggable = false;
    toggle.addEventListener("dragstart", (e) => e.stopPropagation());
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      openClueDetailModal(clue);
    });
    card.appendChild(toggle);
  }

  const source = document.createElement("div");
  source.className = "board-card-source";
  source.textContent = clue.source;
  card.appendChild(source);

  card.addEventListener("dragstart", () => {
    draggedClueId = clue.id;
    socket.emit("board3:claimCard", { clueId: clue.id });
  });
  card.addEventListener("dragend", () => {
    // If the drop landed on a real zone, board3:placeCard already cleared
    // the claim server-side by the time this fires. If it didn't land
    // anywhere valid, this releases the lock so the card isn't stuck
    // showing as claimed for everyone else.
    if (draggedClueId === clue.id) {
      socket.emit("board3:releaseCard", { clueId: clue.id });
      draggedClueId = null;
    }
  });

  return card;
}

function openClueDetailModal(clue) {
  document.getElementById("clue-detail-title").textContent = clue.title;
  document.getElementById("clue-detail-text").textContent = clue.text;
  document.getElementById("clue-detail-source").textContent = clue.source;
  document.getElementById("modal-clue-detail").classList.remove("hidden");
}
document.getElementById("btn-close-clue-detail").addEventListener("click", () => {
  document.getElementById("modal-clue-detail").classList.add("hidden");
});

function wireBoardDropzone(el, placement) {
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
    if (!draggedClueId) return;
    const clueId = draggedClueId;
    draggedClueId = null;
    // Update and re-render immediately rather than waiting on the
    // server's broadcast to come back - a card visibly landing in its
    // box the instant you drop it shouldn't depend on a network
    // round-trip. The server call right after is still the source of
    // truth (and syncs everyone else's board); if it disagrees for any
    // reason, the next board3:state message corrects this local guess.
    const clue = boardState.clues[clueId];
    if (clue) {
      clue.placement = placement;
      clue.claimedBy = null;
      renderDeductionBoard();
    }
    socket.emit("board3:placeCard", { clueId, placement });
  });
}

function renderDeductionBoard() {
  const clueList = Object.values(boardState.clues || {}).filter((c) => c.collected);

  const tray = document.getElementById("board-tray");
  // The tray element itself persists across renders (unlike the grid's
  // cells, which are torn down and rebuilt fresh every time) - wiring it
  // unconditionally on every render was stacking up a new "drop" listener
  // on top of the last one each time the board state changed, so a drop
  // late in a session could fire several duplicate placeCard emits at
  // once. Wire it exactly once.
  if (!tray.dataset.wired) {
    wireBoardDropzone(tray, "tray");
    tray.dataset.wired = "1";
  }
  tray.innerHTML = "";
  clueList.filter((c) => c.placement === "tray").forEach((c) => tray.appendChild(buildBoardCard(c)));

  const grid = document.getElementById("board-grid");
  grid.innerHTML = "";
  grid.appendChild(document.createElement("div")).className = "board-grid-header-spacer";
  boardFinalists.forEach((f) => {
    const header = document.createElement("div");
    header.className = "board-suspect-header";
    header.innerHTML = `<img src="${f.sprite}" alt="${f.name}" /><span class="board-suspect-name">${f.name}</span><span class="board-suspect-motive">${f.motive}</span>`;
    grid.appendChild(header);
  });

  ["means", "opportunity"].forEach((category) => {
    const label = document.createElement("div");
    label.className = "board-row-label";
    label.textContent = category === "means" ? "Means" : "Opportunity";
    grid.appendChild(label);

    boardFinalists.forEach((f) => {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      wireBoardDropzone(cell, { suspectId: f.key, category });
      clueList
        .filter((c) => c.placement && c.placement.suspectId === f.key && c.placement.category === category)
        .forEach((c) => cell.appendChild(buildBoardCard(c)));
      grid.appendChild(cell);
    });
  });
}


// --- Point the Finger (the accusation vote) ---
let voteState = { votedIds: [], total: 0, cleared: [] };
let myVotePick = null;

async function openVoteModal() {
  if (!boardFinalists.length) {
    const data = await getInteractions();
    boardFinalists = data.boardFinalists || [];
  }
  socket.emit("vote:requestState");
  document.getElementById("vote-result-panel").classList.add("hidden");
  document.getElementById("modal-vote").classList.remove("hidden");
  renderVoteSuspects();
}

document.getElementById("btn-open-vote").addEventListener("click", openVoteModal);
document.getElementById("btn-close-vote").addEventListener("click", () => {
  document.getElementById("modal-vote").classList.add("hidden");
});
document.getElementById("btn-vote-continue").addEventListener("click", () => {
  document.getElementById("vote-result-panel").classList.add("hidden");
  myVotePick = null;
  renderVoteSuspects();
});

socket.on("vote:state", (state) => {
  voteState = state;
  document.getElementById("vote-progress").textContent = `Voted: ${state.votedIds.length} / ${state.total}`;
  renderVoteSuspects();
});

socket.on("vote:rejected", ({ reason }) => {
  if (reason === "no_support") {
    // Same lightweight inline-feedback approach used elsewhere in the UI
    // for a rejected action, rather than a full modal/alert for something
    // this minor.
    const progress = document.getElementById("vote-progress");
    const original = progress.textContent;
    progress.textContent = "Needs at least one card on the board against them first.";
    setTimeout(() => { progress.textContent = original; }, 2500);
  }
});

socket.on("vote:result", (result) => {
  voteState.cleared = result.cleared;
  myVotePick = null;

  const revealRow = document.getElementById("vote-reveal-row");
  revealRow.innerHTML = "";
  result.reveal.forEach((r) => {
    const finalist = boardFinalists.find((f) => f.key === r.suspectId);
    const chip = document.createElement("div");
    chip.className = "vote-reveal-chip";
    chip.style.borderColor = r.color || "#999";
    chip.innerHTML = `<span class="vote-reveal-name" style="color:${r.color || '#ccc'}">${r.name}</span><span class="vote-reveal-pick">${finalist ? finalist.name : r.suspectId}</span>`;
    revealRow.appendChild(chip);
  });

  const entry = result.outcome === "tie" ? data_vote_tie
    : result.outcome === "correct" ? data_vote_correct
    : data_vote_clear[result.clearedSuspect];
  // Falls back gracefully if content hasn't loaded for some reason - the
  // reveal itself (who voted for whom) is the important part and still
  // shows either way.
  document.getElementById("vote-result-title").textContent = entry ? entry.speaker : "";
  document.getElementById("vote-result-lines").innerHTML = entry ? entry.lines.map((l) => `<p>${l}</p>`).join("") : "";

  document.getElementById("vote-result-panel").classList.remove("hidden");
  renderVoteSuspects();
});

// Loaded once, alongside boardFinalists, the first time the vote modal
// opens - small enough to just keep in memory rather than re-fetching
// per outcome.
let data_vote_tie = null;
let data_vote_correct = null;
let data_vote_clear = {};
(async () => {
  const data = await getInteractions();
  data_vote_tie = data.vote_tie || null;
  data_vote_correct = data.vote_correct || null;
  data_vote_clear = {
    ashby: data.vote_clear_ashby || null,
    voss: data.vote_clear_voss || null,
    kestrel: data.vote_clear_kestrel || null,
    marrow: data.vote_clear_marrow || null,
  };
})();

function renderVoteSuspects() {
  const grid = document.getElementById("vote-suspect-grid");
  grid.innerHTML = "";
  const iVoted = voteState.votedIds.includes(socket.id);
  boardFinalists.forEach((f) => {
    const cleared = voteState.cleared.includes(f.key);
    const card = document.createElement("div");
    card.className = "vote-suspect-card";
    if (cleared) card.classList.add("cleared");
    if (myVotePick === f.key) card.classList.add("picked");
    card.innerHTML = `
      <img src="${f.sprite}" alt="${f.name}" />
      <span class="board-suspect-name">${f.name}</span>
      <span class="board-suspect-motive">${f.motive}</span>
      ${cleared ? '<span class="vote-cleared-label">Cleared</span>' : ""}
    `;
    if (!cleared && !iVoted) {
      const btn = document.createElement("button");
      btn.className = "btn btn-secondary vote-cast-btn";
      btn.textContent = "Point the Finger";
      btn.addEventListener("click", () => {
        myVotePick = f.key;
        socket.emit("vote:cast", { suspectId: f.key });
        renderVoteSuspects();
      });
      card.appendChild(btn);
    } else if (!cleared && iVoted && myVotePick === f.key) {
      const waiting = document.createElement("p");
      waiting.className = "hint-text";
      waiting.textContent = "Waiting on the rest of the party...";
      card.appendChild(waiting);
    }
    grid.appendChild(card);
  });
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
        title: `EXHIBIT ${ex.letter}`,
        subtitle: ex.name,
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
        title: `+ ${item.name}`,
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
  document.getElementById("investigate-title").textContent = exhibit.letter
    ? `Exhibit ${exhibit.letter}: ${exhibit.name}`
    : exhibit.name;
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
  // No crossOrigin attribute: every portrait this loads is a same-origin
  // asset served by this same game server, which never sends CORS headers
  // (nothing here is actually cross-origin). Setting crossOrigin=anonymous
  // anyway can cause the canvas to come back tainted for some images
  // depending on caching/load-order quirks, silently skipping the
  // chroma-key step below and leaving the original flat background
  // visible - exactly the "white background" symptom this was causing on
  // some portraits. Same-origin same-tab image loads don't need it.
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
      source = chromaKeyBackground(img);
    }

    // Cover-fit anchored at the bottom: fills the whole frame the way a
    // Stardew-style bust portrait does, cropping off any excess (usually
    // the top of the hair) rather than leaving empty space around a
    // smaller contained image. A bigger zoom on top of pure cover-fit
    // keeps this tight even when a source image has a lot of breathing
    // room baked in around the character - several portraits have quite
    // a bit of background above and to the sides of the actual bust,
    // and even correctly chroma-keyed to transparent, that much empty
    // area let the frame's own background colour read as a visible flat
    // block behind the character rather than a tight portrait crop.
    // Cropping in harder leaves less of that area on screen at all.
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

function chromaKeyBackground(img) {
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

  // Sample the actual corner colour instead of assuming white - portraits
  // in this project have used both a flat white background and a flat tan
  // one, and hardcoding white silently left the tan ones fully opaque.
  const bgR = data[0], bgG = data[1], bgB = data[2];
  const TOLERANCE = 20;
  const isBackground = (i) =>
    Math.abs(data[i] - bgR) <= TOLERANCE &&
    Math.abs(data[i + 1] - bgG) <= TOLERANCE &&
    Math.abs(data[i + 2] - bgB) <= TOLERANCE;

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
    if (!isBackground(i)) continue;
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
