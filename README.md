# A Study in Boralus — Sherlock Night Game Engine

A real-time, multiplayer murder-mystery/escape-room engine for your Discord Sherlock Nights, set in the Warcraft universe (Kul Tiras / Boralus). No player limit, no accounts, no installs — everyone opens a link and enters a room code.

## Current status (read this first)

**Working now:**
- Full lobby / room-code / character-creation flow (Short/Tall build, 12-colour palette, live avatar preview)
- Story acts: intro reveal, the frame-up reveal, the "naming the culprit" puzzle, and the epilogue twist
- **A real explorable overworld** for Act 2 (the Duskmere Estate) — smooth WASD/arrow-key movement, a proper tile map built from your Cute Fantasy Free assets, walk-cycle character animation, and live multiplayer avatars (everyone sees everyone else walking around)
- Six suspects placed on the map as walk-up-to NPCs (four give a riddle/clue puzzle, two are dialogue-only flavor/red herrings), plus a coded-cipher clue and a locked chest puzzle
- All puzzle content for the estate is written and working (`content/interactions.json`)

**Not yet built:**
- **Zone 2 (the ship, *Duskmere's Providence*) is currently narrated in text only**, not an explorable map. The story acts skip from "you're thrown in the brig" straight to "here's how the escape goes" as prose. Turning that into a second walkable zone (using the Kenney Roguelike Indoors/RPG tile packs already sitting in `public/assets/tiles/`) is the natural next step.
- The pixel UI packs (Kenney Pixel UI Pack, UI Pack Pixel Adventure) and the Raven Fantasy Icons are copied into `public/assets/` but not yet wired into the interface — buttons/panels are still plain CSS, and clue objects use simple colored dots on the map rather than proper icons.
- No sound.

## How it works

- Host opens the site, creates a character, clicks **Host a New Game** → gets a 5-character case code.
- Everyone else creates a character and joins with that code.
- Host clicks **Begin the Case** and the story plays out in "Acts" (`content/story.json`):
  - **`reveal`** — a shared story beat. Advances once everyone clicks "Ready" (or the host forces it).
  - **`explore`** — a live walkable map (points at a map file in `public/assets/maps/`). Players move around, walk up to NPCs/objects, and solve puzzles pulled from `content/interactions.json`. The act auto-advances once enough clues are found (`completionCount`), or the host can force it.
  - **`puzzle_group`** — one shared question, one shared answer box.
  - **`puzzle_individual`** / **`puzzle_split`** — per-player or fragment-based puzzles (used less now that `explore` exists, but still available).
  - **`final`** — the ending screen with the word/phrase for Discord.

## Running it locally

```bash
npm install
npm start
```
Open `http://localhost:3000` in a few tabs to test as multiple "players." Use WASD or arrow keys to move in explore mode, and E (or the on-screen Examine button) to interact.

## Deploying for your friends

Same as before — free tier on **Render**, **Railway**, or **Fly.io**:
1. Push this folder to a GitHub repo.
2. New Web Service → Build Command `npm install`, Start Command `npm start`.
3. Share the resulting URL.

Free tiers can take ~30-60s to wake up on first request — open the link yourself a few minutes early.

## Characters

Everyone picks Short/Tall and a colour before joining; the base sprite (your uploaded template, no clothes/features) is recoloured live in the browser via a canvas multiply+mask trick. Walk-cycle frames were extracted from your Walk-Sheet template (down/side/up rows, 4 frames each); side-facing left uses a horizontal mirror of the "side" row rather than a separate left-facing sprite.

**Worth double-checking once you run it:** the row-to-direction mapping (which row of your Walk-Sheet is "down" vs "side" vs "up") was inferred from the sheet's grid layout, not visually confirmed frame-by-frame. If a direction looks wrong in the browser, tell me which one and I'll adjust the row mapping in `overworld.js` (`drawCharSprite`) — it's a one-line fix, not a rebuild.

## The map format

Maps live in `public/assets/maps/*.json`:
```json
{
  "tileSize": 16,
  "width": 22, "height": 15,
  "ground": [["grass","grass"], []],
  "collision": [[0,0,1], []],
  "decor": [{"key":"house","x":7,"y":0,"w":6,"h":8,"src":"/assets/decor/House_1_Wood_Base_Blue.png"}],
  "objects": [{"id":"npc_steward","type":"npc","name":"Steward Wren Ashby","x":13,"y":4,
               "interaction":{"kind":"individual_puzzle","puzzleId":"steward"}}],
  "spawn": {"x": 10, "y": 13}
}
```
Ground tiles reference a small registry in `overworld.js` (`TILE_SRC`) — currently grass/path/water from Cute Fantasy Free. Adding more (e.g. Kenney's indoor floor tiles for the ship) means adding entries there and to the map's `ground` grid.

Puzzle/dialogue content is separate, in `content/interactions.json`, keyed by `puzzleId`/`dialogueId` — so you can rewrite clue text without touching the map layout, and vice versa.

## Customizing the story

`content/story.json` drives the act sequence — swap it for a new mystery without touching code, following the shapes described above (`reveal`, `explore`, `puzzle_group`, `final`, etc.)

## Known limitations

- Game state lives in memory — a server restart mid-game resets progress. Fine for a one-off session.
- If a player refreshes mid-game, they rejoin as a new player rather than resuming their character. Ask your table not to refresh once the case begins.
- Movement/positions aren't server-validated (clients self-report) — completely fine for a private friend game, not meant for a public/competitive server.
- No profanity filter or moderation.

## Suggested next steps

1. Playtest the estate explore act with 2-3 people and confirm the walk-direction mapping looks right.
2. Build Zone 2 (the ship) as a second explorable map using the Kenney Roguelike Indoors/RPG tiles.
3. Wire in the Kenney UI packs for buttons/panels and the Raven Fantasy Icons for clue markers/evidence log.
4. Add the framing/epilogue "screenshot" moment as an actual styled scene rather than plain text.
