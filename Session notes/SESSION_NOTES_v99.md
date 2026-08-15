# v99 delivery notes - the real Tavern bug, and a more honest look at the cutscene

## The big one: the Tavern was never actually rendering, anywhere

Went back and checked every single Act 3 map's tileset paths against
what's actually on disk, file by file, rather than trusting my earlier
notes. Found it: **`tavern_1st_floor` was missing 20 of its 22 tileset
image files.** I flagged this exact gap all the way back when the
Tavern floor was first built, and again after the CraftPix pack zips
were uploaded - but when those zips landed, I only pulled the specific
files `town_exterior` needed from the tavern pack, and never actually
went back and finished the Tavern's own original gap. That's on me, it
sat unresolved for several deliveries. All 20 files were sitting right
there in the already-uploaded tavern pack the whole time. Verified every
one against the map's declared column counts before copying (all
matched exactly, no surprises), copied them in, and confirmed all 22 of
the Tavern's tilesets now resolve.

This is very likely most of what "no map rendering anywhere in Act 3"
actually was - the Tavern is one of the most-visited zones (Voss's
alibi, Ashgate's reveal, the goblin, the flirty guy, the whole musicians
pass all live there), so a completely blank Tavern would read as a huge
chunk of the act just not working.

**Checked everywhere else too, not just the Tavern.** Ran a full sweep
of all 13 Act 3 maps for missing files (all clear now) and separately
checked every single tileset path for a case-sensitivity mismatch
between what the JSON references and the actual filename on disk - a
real, sneaky class of bug that works fine locally on Mac/Windows but
silently fails on a case-sensitive Linux host like Railway. None found,
anywhere.

**Guild Hall's blank map (bug 5 from before) is still unresolved.**
Given the Tavern turned out to have a real, concrete cause, I want to be
honest that I don't have the same confidence here - I checked file
existence, tile data, tileset dimensions, and now case-sensitivity too,
and everything genuinely looks correct in the files. If it's still blank
after this delivery (with the Tavern fix in place too), I'd really
appreciate a browser console screenshot when that map loads - a 404 or a
JS error there would tell us far more than another round of me checking
files that keep checking out fine.

## The manor cutscene camera - a more honest pass

I need to walk back part of my last fix. I'd diagnosed the black space
above the scene as the camera centering a map shorter than the viewport,
and "fixed" it by top-aligning in that case. Going back through the math
properly this time: the viewport height is CSS-capped at 820px maximum,
and this map's real height is 960px - meaning the "shorter than viewport"
condition can mathematically never be true here, so that fix never
actually applied to this scene at all. I got the diagnosis wrong.

Rather than keep guessing at the exact cause without being able to see
it render, I've added a more robust, timing-independent fix: the game
canvas now uses a `ResizeObserver` to keep its actual pixel dimensions
continuously synced with its real on-screen size, instead of relying on
manual resize() calls at specific moments in the code that can run
before a fade-in or layout settle has actually finished. This covers a
real, plausible class of bug (a stale canvas size from before a
transition) regardless of whether it's the exact cause here, and it's a
strict improvement either way - it can't make anything worse.

**Held off on moving Captain Thorne again.** Her exact position relative
to the book only makes sense to fine-tune once we know the scene is
rendering at the right scale and position - adjusting her tile
coordinates against a screenshot that's affected by this sizing bug
risks chasing the wrong target. Once this lands, if she's still off,
send a fresh screenshot and I'll get her properly centered on the book.

## Validation run before this zip

node --check: clean on server.js, client.js, overworld.js. JSON parse:
clean, all 33 content/map files. em-dash grep: clean.
