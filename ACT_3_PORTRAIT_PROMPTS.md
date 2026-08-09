# A Study in Boralus - Act 3 Portrait Prompts

Every NPC in Act 3 who has a dialogue popup (i.e. everyone in
`ACT_3_DIALOGUE_SCRIPT.md`) needs a portrait to fill that popup's frame.
Right now, anyone without one falls back to a small 32x32 auto-cropped
sprite icon, which is what the existing 8/12 Estate portraits already
solved for Ashgate, Ashby, Marrow, Corwin, Voss, the maid, and two gala
guests. This does the same job for Act 3.

## Technical spec (read this before generating anything)

- **Aspect ratio**: roughly square to slightly-tall, similar to the
  existing portraits (Thorne's and Corwin's, which you've already seen
  in-game, are the reference quality bar). 480-1200px on the long edge is
  fine, doesn't need to be exact.
- **Composition**: bust/chest-up, character roughly centered
  horizontally. The game code does a bottom-anchored cover-fit crop into
  a 180x180 square, with a 1.15x zoom on top of that - meaning **the
  bottom portion of your image is what actually shows**, and some
  headroom at the top gets cropped away automatically. Don't compose
  with the face too low in frame, but a little extra headroom above the
  head is fine and expected to be trimmed.
- **Background**: flat and solid (white is easiest, but any single flat
  colour works). The game auto-removes it via corner flood-fill, so it
  doesn't need to be transparent when you generate it, just genuinely
  flat and not textured.
- **Style**: semi-realistic painted fantasy-RPG portrait style, matching
  Thorne's and Corwin's portraits already in the game - soft cel-shading,
  visible brushwork, NOT flat vector art, NOT photorealistic, NOT pixel
  art (the pixel sprites are a different, lower-detail layer, the
  portraits are always the more detailed painted upgrade).
- **File format**: PNG.
- **File naming**: `{Name}_Portrait.png`, matching the existing files
  exactly (e.g. `Bartender_Portrait.png`). Case matters, the existing set
  is inconsistent (a few are `_portrait.png` lowercase) but new ones
  should follow the capitalized `_Portrait.png` form.
- **Where they go**: drop every finished file straight into
  `public/assets/npcs/portraits/`.

### How to wire a finished portrait into the game (I can do this part once you have the files)

Every object that has one gets a `"portrait"` field added to its
`interaction`-adjacent object data in the relevant map JSON, pointing at
the file, e.g.:
```json
{"id": "npc_bartender_tavern", "name": "The Bartender", "x": 13, "y": 7,
 "portrait": "/assets/npcs/portraits/Bartender_Portrait.png",
 "interaction": {...}}
```
Just hand me the finished PNGs (or drop them in the folder yourself if
you're comfortable editing map JSON directly) and I'll wire the
`portrait` field into every object listed below in one pass.

## Colour reference note

Where I could confirm a character's actual in-game sprite colours by
opening the source PNG directly, I've listed real sampled hex codes
below, not guesses. Where I couldn't (mostly one-line flavour NPCs, noted
per entry), I've named the exact sprite file instead so you can open it
yourself and sample from it - more reliable than me describing a colour
from memory.

---

## Guild Hall

No NPCs are placed in any of the three Guild Hall zones yet (ground
floor, upper floor, exterior) beyond zone exits and the vote table. No
portraits needed here for this delivery.

---

## Training Ground

### The Dragon (statue)
*Object: `flavor_dragon_statue`. Sprite: `Dragon_body.png` /
`Dragon_wing.png` (training_ground pack), a large stone dragon fixture,
not a walking character.*

This one doesn't really need a bust portrait in the usual sense, it's a
stone statue that speaks in riddles. If you want one anyway for
consistency:

> Painted fantasy-RPG portrait bust, in the style of a Boralus stone
> dragon statue: weathered grey-blue stone carved into a coiled dragon
> head and neck, moss growing in the carved grooves, faint magical teal
> glow in the eye sockets, cracked and ancient, Kul Tiras architecture.
> Square-ish composition, character centered, flat solid background,
> semi-realistic painted style matching Captain Thorne's portrait.

### A Fighter (x5)

**`flavor_fighter_1`** - sprite `Fighter_sword1_with_shadow.png`. Sampled
colours: hair `#452820` (warm dark brown), skin `#cca469`, tunic
`#884a21` (rust red-brown).
> Painted fantasy-RPG bust portrait of a young human swordsman, short
> tousled dark brown hair (#452820), warm tan skin (#cca469), wearing a
> rust-red training tunic (#884a21), focused determined expression,
> mid-drill sweat on the brow, holding the top of a training sword just
> in frame. Square composition, flat solid background, semi-realistic
> painted style matching Captain Thorne's and Corwin's portraits.

**`flavor_fighter_2`** - sprite `Fighter_sword_shield_with_shadow.png`.
Sampled colours: steel blue armor `#3d3b59`/`#6584a6`, deep maroon
undertunic `#481916`.
> Painted fantasy-RPG bust portrait of a human knight in blued steel
> plate armor (#3d3b59 with #6584a6 highlights), a dark maroon tunic
> visible at the collar (#481916), helm removed or open-faced, alert
> guarded expression like he's mid-conversation but still on duty,
> shield strap visible at the shoulder. Square composition, flat solid
> background, semi-realistic painted style matching Captain Thorne's and
> Corwin's portraits.

**`flavor_fighter_3`** - sprite `Fighter_sword3_with_shadow.png`. Sampled
colours: skin `#f1b97e`, dark hair `#2c1614`.
> Painted fantasy-RPG bust portrait of a young human swordsman, light
> tan skin (#f1b97e), very dark brown almost-black cropped hair
> (#2c1614), narrow focused eyes, faint scar or dirt smudge on one
> cheek from drilling, plain leather training gear. Square composition,
> flat solid background, semi-realistic painted style matching Captain
> Thorne's and Corwin's portraits.

**`flavor_fighter_4`** - sprite `Fighter_sword4_with_shadow.png` (not
individually colour-sampled, verified visually only: auburn/copper hair,
olive-green tunic, tan skin, blue trousers).
> Painted fantasy-RPG bust portrait of a human swordsman, auburn copper
> hair, tan skin, olive-green training tunic over dark trousers,
> slightly irritated "you're in my light" expression, mid-turn as if
> interrupted from a drill. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits.

**`flavor_fighter_5`** - sprite `Fighter_sword5_with_shadow.png`. Sampled
colours: hair/brow `#4f2620`, skin `#c37f4c`, tunic accent `#a96846`.
> Painted fantasy-RPG bust portrait of a human swordsman, dark
> reddish-brown hair (#4f2620), warm tan skin (#c37f4c), simple rust-tan
> training garb (#a96846), looking slightly away as if distracted,
> mentioning something in passing rather than looking the viewer dead in
> the eye. Square composition, flat solid background, semi-realistic
> painted style matching Captain Thorne's and Corwin's portraits.

---

## Blacksmith

### The Blacksmith
*Object: `npc_blacksmith`. Sprite: `Smith_forge_full.png`
(blacksmith_interior pack). Sampled colours: hair/beard `#401c2a`-ish
region is actually the background/anvil, character's own hair reads as
a warm auburn-red, skin `#3e475a` region is armor-adjacent - see note
below.*

**Important flag before you commission this one**: I looked at this
sprite directly and it shows an auburn-haired, bearded figure at an
anvil, holding a hammer, wearing a dark leather apron over what reads as
banded armor at the shoulders. This does **not** match what's currently
showing in your screenshot (Image 4) - that shows a bald, tan-skinned
character in dark hair and blue overalls. Something's mismatched between
the map data and what's actually rendering. I'll dig into that as part
of the bug list below rather than guess which one is "correct" here -
hold off commissioning this specific portrait until that's resolved, so
you don't end up matching the wrong sprite.

---

## Mage Tower

### The Head Warlock
*Object: `npc_head_warlock`, 1st floor. Sprite: `Mage1_fit2.png`. Sampled
colours: deep maroon hood `#341319`/`#792323`, warm tan skin `#e1b26e`.*

> Painted fantasy-RPG bust portrait of a robed warlock, deep maroon
> hooded robe (#341319 shadow, #792323 highlight), warm tan skin
> (#e1b26e), hood up and shadowing the upper face, holding an open
> spellbook low in frame, sardonic knowing half-smile, doesn't quite meet
> the viewer's eyes, radiates "I know more than I'm telling you." Square
> composition, flat solid background, semi-realistic painted style
> matching Captain Thorne's and Corwin's portraits.

### The Head Mage
*Object: `npc_head_mage`, 2nd floor. Sprite: `Mage2_fit2.png`. Sampled
colours: near-black robe/hat `#171620`/`#2b2a38`, teal hair accents
visible in the sprite.*

> Painted fantasy-RPG bust portrait of a robed mage, dark navy-black
> pointed witch-style hat and robe (#171620 shadow, #2b2a38 highlight),
> teal-streaked hair visible beneath the hat brim, dark skin, holding an
> open spellbook, composed and observant expression, the kind of person
> who notices everything and says little. Square composition, flat solid
> background, semi-realistic painted style matching Captain Thorne's and
> Corwin's portraits.

### The Dragon Child
*Object: `flavor_dragon_child`, basement. Sprite: `Dragon_child.png`, not
individually colour-sampled this pass.*
> Painted fantasy-RPG bust portrait of a small juvenile dragon-whelp,
> in the same visual family as the chapel-roof dragon and the training
> ground's stone dragon but younger and smaller-scaled, curious wide
> eyes, warm earthy scale tones. Square composition, flat solid
> background, semi-realistic painted style matching Captain Thorne's and
> Corwin's portraits. *(Reference `Dragon_child.png` in
> `mage_tower/` directly for exact scale colour.)*

---

## Town Exterior (the Market)

### The Flute Player / The Lute Player
*Objects: `npc_market_flute_player`, `npc_market_lute_player`. Sprites:
`Flutist_animation_with_shadow.png`, `Lute_player_animation_with_shadow.png`,
not individually colour-sampled this pass - both are flavor-only, never
block progress, lower priority than the clue-holders below.*
> (Flute Player) Painted fantasy-RPG bust portrait of a street musician
> mid-performance, flute raised to the lips, eyes closed in
> concentration, simple travelling minstrel clothing. Square
> composition, flat solid background, semi-realistic painted style
> matching Captain Thorne's and Corwin's portraits. *(Reference
> `Flutist_animation_with_shadow.png` directly for palette.)*
>
> (Lute Player) Painted fantasy-RPG bust portrait of a street musician,
> mid-strum on a lute, relaxed confident half-smile, simple travelling
> minstrel clothing. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits. *(Reference `Lute_player_animation_with_shadow.png`
> directly for palette.)*

### The Dragon on the Chapel Roof
*Object: `npc_dragon_chapel_roof`. Sprite: `Dragon_body.png` +
`Dragon_wing_animation.png` (chapel pack, distinct file from Training
Ground's own dragon statue).*
> Painted fantasy-RPG bust portrait of a large dragon perched on a
> chapel rooftop, weathered scales in muted earth tones, wings
> partially folded, an amused knowing glint in the eye like it enjoys
> being cryptic, Kul Tiras gothic architecture visible behind it. Square
> composition, flat solid background, semi-realistic painted style
> matching Captain Thorne's and Corwin's portraits.

### The Fruit Seller
*Object: `npc_market_fruit_seller`. Sprite: `Trader_fruits_animation.png`.
Sampled colours: dark blue-black hair `#1a1b29`, skin `#e1b26e`, dark red
top `#552d24`.*
> Painted fantasy-RPG bust portrait of a market fruit seller, dark
> near-black hair (#1a1b29), warm tan skin (#e1b26e), simple dark
> red-brown work clothes (#552d24), practical no-nonsense expression,
> mid-arranging produce. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits.

### The Bread Seller
*Object: `npc_market_bread_seller`. Sprite:
`Trader_bread_animation_with_shadow.png`. Sampled colours: golden-blonde
hair `#db9b3e`/`#e6b739`, apron `#683321`.*
> Painted fantasy-RPG bust portrait of a market bread seller, bright
> golden-blonde hair in loose pigtails (#db9b3e, #e6b739 highlights),
> pale skin, warm brown work apron (#683321) over a cream shirt, bright
> friendly customer-facing smile, holding a bread basket low in frame.
> Square composition, flat solid background, semi-realistic painted
> style matching Captain Thorne's and Corwin's portraits.

### The Armour Seller
*Object: `npc_market_armour_seller`. Sprite:
`Trader_weapon_animation_with_shadow.png`. Sampled colours: auburn hair
`#582219`, skin `#f6c382`.*
> Painted fantasy-RPG bust portrait of a market armour and weapon
> seller, auburn hair pulled back (#582219), fair skin with light
> freckling (#f6c382), sharp appraising green eyes, practical
> leather-and-steel trader's gear, arms-crossed confident stance. Square
> composition, flat solid background, semi-realistic painted style
> matching Captain Thorne's and Corwin's portraits.

### The Potion Seller
*Object: `npc_market_potion_seller`. Sprite:
`Trader_drinks_animation_with_shadow.png`. Sampled colours: silver-white
hair `#b1b6bf`, purple robe `#332d30` region, tan skin `#cca46a`.*
> Painted fantasy-RPG bust portrait of an older market potion seller,
> wild silver-white hair (#b1b6bf), weathered tan skin (#cca46a), deep
> plum-purple robes, sly knowing half-smile, holding a small corked
> bottle up near the face. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits.

### The Witch Seller
*Object: `npc_market_witch_seller`. Sprite:
`Trader_magic_animation_with_shadow.png`. Sampled colours: near-black
witch hat and robe `#171620`/`#303142`, teal hair, tan skin.*
> Painted fantasy-RPG bust portrait of a market witch/herb seller, tall
> pointed dark witch hat (#171620), teal-streaked hair spilling out from
> under it, warm tan skin, deep charcoal-black robes (#303142), sharp
> violet eyes, faint knowing smirk, herbs or a small vial visible at the
> edge of frame. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits.

### A Guy Eating / A Guy Eating Chicken / An Adventurer, Drinking (x2)
*Objects: `npc_market_guy_eating` (sprite `Eater_animation.png`),
`npc_market_guy_eating_chicken` (sprite `Animation_eater.png`, a
different file from the tavern pack despite the similar name),
`npc_market_adventurer_dude` (sprite `Animation_Drinker1.png`),
`npc_market_adventurer_lady` (sprite `Animation_Drinker2.png`). None
colour-sampled this pass, all flavour-only, lowest priority in this
batch.*
> (Guy Eating) Painted fantasy-RPG bust portrait, a market patron mid-bite
> into a large meal, cheeks full, entirely absorbed in the food. Square
> composition, flat solid background, semi-realistic painted style
> matching Captain Thorne's and Corwin's portraits. *(Reference
> `Eater_animation.png` for palette.)*
>
> (Guy Eating Chicken) Painted fantasy-RPG bust portrait, a market patron
> gnawing enthusiastically on a chicken leg, satisfied grin. Square
> composition, flat solid background, semi-realistic painted style
> matching Captain Thorne's and Corwin's portraits. *(Reference
> `Animation_eater.png`, tavern pack, for palette.)*
>
> (Adventurer, male) Painted fantasy-RPG bust portrait, a weary
> adventurer mid-drink, tankard raised, "rough week" written on his
> face. Square composition, flat solid background, semi-realistic
> painted style matching Captain Thorne's and Corwin's portraits.
> *(Reference `Animation_Drinker1.png` for palette.)*
>
> (Adventurer, female) Painted fantasy-RPG bust portrait, a weary
> adventurer raising a cup in an unenthusiastic toast, tired
> good-humour. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits. *(Reference `Animation_Drinker2.png` for palette.)*

---

## The Tavern

### The Bartender
*Object: `npc_bartender_tavern`. Sprite: `Animation_host.png`. Sampled
colours: skin `#e1b26e`, deep red hair/beard `#662022`/`#9f3329`.*
> Painted fantasy-RPG bust portrait of a tavern bartender, bald or
> close-cropped, warm tan skin (#e1b26e), a full deep auburn-red beard
> (#662022 shadow, #9f3329 highlight), sharp green eyes, sleeves rolled
> up, mid-wiping a glass or the bar, professionally unbothered
> expression, the kind of person who's heard every story in the room
> twice. Square composition, flat solid background, semi-realistic
> painted style matching Captain Thorne's and Corwin's portraits.

### Big Hat Lady Enjoying Music
*Object formerly `npc_gossip_guest`, now correctly named for the actual
NPC. Sprite: `Animation_killer.png` (tavern pack - an odd source
filename, but this is confirmed to be her sprite by direct tile
position, not the asset's internal name). Sampled colours: wide-brimmed
hat in navy/steel-blue `#1c1b2a`/`#2d3752`/`#3a4565`.*
> Painted fantasy-RPG bust portrait of a woman at a tavern table, a wide
> dark navy-blue brimmed hat (#1c1b2a shadow, #3a4565 highlight) tilted
> at a rakish angle, warm tan skin, sharp green eyes, simple overalls
> visible at the shoulder, slightly tipsy conspiratorial smile like
> she's about to tell you something she probably shouldn't. Square
> composition, flat solid background, semi-realistic painted style
> matching Captain Thorne's and Corwin's portraits.

### Human Drinking
*Object: `npc_ashby_witness`. **Flagging honestly**: my first pass at
identifying this sprite by tile position pulled up `Animation_dancer.png`,
but when I actually opened that file it turned out to be the Dracthyr's
sprite instead (green scales, clearly not human) - the two objects sit
one tile apart and my lookup grabbed the wrong neighbour. I did not find
the correct file for this NPC's actual sprite within this session's
research pass. Rather than write a prompt from a wrong or invented
sprite, I'm flagging this one as unconfirmed - let me know if you want me
to take another, more careful pass at pinning down her actual sprite file
before you commission this one.*

### A Sleeping Drunk / A Card Game / A Hopeful Suitor / A Table of Adventurers / A Draenei and a San'layn / A Dracthyr on the Table
*Objects: `flavor_tavern_sleeping_drunk` (`Animation_sleep_guy2.png`),
`flavor_tavern_card_game` (`Animation_orc_player.png` +
`Animation_player_drow.png`, two characters), `flavor_tavern_guy_flirting`
(`Animation_client.png`), `flavor_tavern_adventurers`
(`Animation_ sit_char.png`, note the literal space in the filename),
`flavor_tavern_drinkers` (sprite not resolved this pass, sits between two
other multi-tile sprites and my lookup came back empty), `flavor_tavern_dracthyr`
(`Animation_dancer.png`, confirmed - green-scaled dragonkin, red mane,
verified by direct viewing). All flavour-only, never block progress,
lowest priority of this whole batch. Full individual prompts skipped
here given the tool-call budget this session - reference each file
directly for palette when you're ready for these; the Dracthyr's is
already confirmed (green scaled skin, dark red horns/mane, teal
undertones) if you want to start there.*

### A Cheering Goblin
*Object: `npc_goblin_tavern`. Sprite: `Animation_drinker7.png`. Partial
view only, confirmed: green skin, pointed ears, clearly goblin-coded.
Full palette not sampled - the frame size for this file didn't divide
evenly the way the others did, so I only got a partial crop. Good enough
to confirm species/general coloring, not enough for a precise hex list.*
> Painted fantasy-RPG bust portrait of a tavern goblin patron, green
> skin, prominent pointed ears, gap-toothed cheerful grin, mug raised
> mid-toast, sloshing over the rim, a little unsteady, having a great
> time. Square composition, flat solid background, semi-realistic
> painted style matching Captain Thorne's and Corwin's portraits.
> *(Reference `Animation_drinker7.png` directly to confirm exact green
> tone and clothing colour before finalizing.)*

### The Flirty Guy
*Object: `npc_flirty_guy`. Sprite: `Animation_watcher.png`. Sampled
colours: dark brown hair `#2f1f22`, warm tan skin `#a06142`/`#bc7645`.*
> Painted fantasy-RPG bust portrait of a tavern patron, tousled dark
> brown hair (#2f1f22), warm tan skin (#a06142), lopsided cheesy grin,
> clearly a few drinks in, leaning in like he's about to deliver a
> terrible pickup line, one eyebrow raised. Square composition, flat
> solid background, semi-realistic painted style matching Captain
> Thorne's and Corwin's portraits.

---

## The Chapel

### The Priest
*Object: `npc_priest`. Sprite: `Priest_speech.png`. Sampled colours:
blue/white mitre and robes `#363958`/`#b1d5fe`/`#96afe3`, dark skin.*
> Painted fantasy-RPG bust portrait of a priest, tall pointed blue and
> white mitre hat (#363958 shadow, #b1d5fe highlight), matching
> blue-and-gold ceremonial robes, dark skin, permanently harried
> "I don't have time for this" expression, mid-gesture as if already
> turning back to some other task. Square composition, flat solid
> background, semi-realistic painted style matching Captain Thorne's and
> Corwin's portraits.

### A Monk (x4)
*Objects: `flavor_monk_1` (sprite `Mon3k_Pray.png`), `flavor_monk_2`
(`Mon4k_Pray.png`), `flavor_monk_3` (`Mon2k_Pray.png`), `flavor_monk_4`
(`Mon1k_Pray.png`). All four sampled and confirmed near-identical: deep
warm brown hooded robes, `#311a1b` shadow through `#814a36` highlight,
faces mostly hidden in shadow beneath the hood. The pack draws them as
visually interchangeable, which actually works well for "four
indistinguishable monks, one of whom is lying to your face and you can't
tell which."*
> Painted fantasy-RPG bust portrait of a hooded monk, deep warm brown
> robes (#311a1b shadow, #814a36 highlight), hood pulled low enough that
> the upper face is mostly in shadow, hands folded, unreadable
> expression, deliberately giving nothing away. Square composition, flat
> solid background, semi-realistic painted style matching Captain
> Thorne's and Corwin's portraits.
>
> Generate this same prompt 4 times with very slight variation (a
> slightly different jaw, a touch more or less visible under the hood,
> minor robe-fold differences) so the four are recognizably a set without
> being identical twins - matches how the sprites themselves are subtly
> different per monk.

### A Parishioner (x3, one of them clue-bearing)
*Objects: `flavor_parishioner_1` (sprite `Parishioner10.png`, this is the
one with the whispered Ashby clue), `flavor_parishioner_2`
(`Parishioner8.png`), `flavor_parishioner_3` (`Parishioner11.png`). I
attempted to crop and view these directly but my frame-size guesses
didn't line up with the actual sheet layout, and I ran out of session
budget to keep iterating blind. I don't have a confirmed visual for any
of the three parishioners.*
> Painted fantasy-RPG bust portrait of a chapel parishioner, modest
> humble clothing suited to evening prayer, quiet unassuming presence.
> Square composition, flat solid background, semi-realistic painted
> style matching Captain Thorne's and Corwin's portraits. *(Reference
> `Parishioner10.png` / `Parishioner8.png` / `Parishioner11.png`
> respectively in the chapel pack's `Tiled_files` folder directly for
> hair, skin, and clothing colour before finalizing any of the three -
> I don't have verified details for these.)*

---

## The Glass Workshop

### The Glassmaker
*Object: `npc_glassblower`. Sprite: `Master.png`. Verified by direct
viewing: elderly man, bushy white/grey hair, warm tan-orange skin,
standing behind a grey workbench holding a thin dark glassblowing rod.*
> Painted fantasy-RPG bust portrait of an elderly glassblower, bushy
> white-grey hair receding at the temples, warm tan-orange weathered
> skin, focused squint from decades of close work, holding a thin dark
> glassblowing rod up near the shoulder, workshop tools softly blurred
> in the background. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits.

### The Shopkeeper
*Object: `npc_shopkeeper_glass`. Sprite: `Seller.png`. Verified by direct
viewing: auburn/red hair pulled up, purple top.*
> Painted fantasy-RPG bust portrait of a shop clerk, auburn-red hair
> pulled back, warm tan skin, simple deep purple work top, polite
> customer-facing smile with something a little guarded behind the eyes,
> minding the counter. Square composition, flat solid background,
> semi-realistic painted style matching Captain Thorne's and Corwin's
> portraits.

---

## Point the Finger (the vote)

All 6 outcome lines are spoken by Corwin, who already has a full portrait
(`Fighter3_Portrait.png`, already wired in). No new portraits needed for
this section - the vote UI reuses his existing art.

---

## Priority order, if you want to tackle these in batches

1. **The clue-holders** (block real progress, seen most often): The
   Bartender, Big Hat Lady, The Cheering Goblin, The Flirty Guy, The
   Glassmaker, The Shopkeeper, The Blacksmith (once the mismatch below is
   resolved), Head Warlock, Head Mage, Bread Seller, Armour Seller.
2. **The Priest, the 4 Monks, the 3 Parishioners** - Chapel is dense with
   named dialogue and currently has zero portraits.
3. **The 5 Training Ground fighters, the 5 Market traders not already
   covered above** (Fruit/Potion/Witch Sellers).
4. **Everyone else** - flavour-only, never blocks progress, lowest value
   per portrait.

Send finished files whenever, in whatever order, and I'll wire each one
in as it arrives rather than waiting for the full set.
