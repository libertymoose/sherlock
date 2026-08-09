# A Study in Boralus - Act 3 Full Dialogue Script

Every line of dialogue in Act 3 (Means and Opportunity), in the order a party would actually encounter it. Edit the text under each `>` blockquote freely, structure/headers/IDs are just for reference, not meant to be changed.

**Key:**
- **[Flavor only, no clue]** - dismissal text, never blocks progress, no board clue.
- **[Single clue]** - one interaction, hands over one board clue immediately.
- **[Two-stage: requires FACTNAME]** - says one thing until the party has learned a specific fact somewhere else in town, then says something different. The surface version shows until FACTNAME is known; the reveal version shows after.
- **[Teaches FACTNAME]** - this is where that fact gets learned.

---

## Transition into Act 3

### Out of the Sewers (cutscene, Corwin's arrival)

**Silas "Hook" Corwin**
> You made it! Ha, knew you would.
>
> Hope you kept your eyes open down there, I left you a few things to find.
>
> Come on, let's get you to the old Guild Hall and cleaned up. You reek.

### Means and Opportunity (reveal, before the explore act starts)

**(narration / Corwin)**
> Corwin brings you to the Guild Hall on the edge of the nearby village.
> "I knew you didn't do it," he chuckles.
> "But somebody did, and I want to know who as much as you do. I'm resourceful, I've got favours to call in and a few strings left to pull. Let's use them and clear your name."

### Act intro text (shown when the explore act begins)

> Corwin's given you the run of his old contacts, the Training Grounds, the Mage Tower, the Blacksmith, and the town itself, the Tavern, the Chapel, the Glass Workshop, the Market. Talk to everyone. Piece together means and opportunity for each of the five names left on the Suspect Board, then bring what you've found back to the board here at the Guild Hall.
>
> When the party's ready, point the finger.

---

## Guild Hall, Ground Floor

*No talking NPCs placed here yet.*

---

## Guild Hall, Upper Floor

*No talking NPCs placed here yet.*

---

## Guild Hall, Exterior

*No talking NPCs placed here yet.*

---

## Training Ground

### The Dragon  
*(object: `flavor_dragon_statue`)* **[Single clue]**

*Gives board clue: `clue_dragon_cryptic`*

> The stone dragon's jaw does not move, but the words come anyway, low as a bellows drawing breath. "Ash and roses smell the same to the dead. The tower's own fire burns only for those it favors. A cold hearth, on the night it should have roared, tells truer tales than any warm one ever will."

### A Fighter  
*(object: `flavor_fighter_1`)* **[Flavor only, no clue]**

> A sword-and-mannequin drill, over and over. "Not now," the fighter grunts, not breaking form. "Trying to actually hit the thing today."

### A Fighter  
*(object: `flavor_fighter_2`)* **[Single clue]**

*Teaches fact: `voss_empty_chair`; Gives board clue: `clue_voss_empty_chair_a`*

> The fighter lowers his shield half an inch. "You're not here about the dice game, are you?" A beat. "No? Shame. That empty chair's still bothering half the barracks."

### A Fighter  
*(object: `flavor_fighter_3`)* **[Flavor only, no clue]**

> The fighter barely glances over, shield up. "Training. Alone. On purpose." Back to drills.

### A Fighter  
*(object: `flavor_fighter_4`)* **[Flavor only, no clue]**

> "If you're not here to spar, you're in my light," the fighter says, squaring up against the mannequin again.

### A Fighter  
*(object: `flavor_fighter_5`)* **[Single clue]**

*Teaches fact: `voss_empty_chair`; Gives board clue: `clue_voss_empty_chair_b`*

> "Commodore Voss? Used to sit in on our dice nights, regular as anything," the fighter says, not looking up from the mannequin. "That night, he vanished mid-game. Chair sat empty the better part of an hour. Nobody's said where he got to."

---

## Blacksmith

### The Blacksmith  
*(object: `npc_blacksmith`)* **[Two-stage: requires `cold_forge`]**

**Before `cold_forge` is known** (gives board clue `clue_blacksmith_surface`):

> "Kestrel? Sure, know her. Buys nails and hinges same as anyone shipping crates." He does not look up from the anvil.
>
> "A receipt with her name on it? Could be, I do a lot of paperwork." He shrugs, hammer never breaking rhythm. "Nothing more to say about it than that."

**After `cold_forge` is known** (gives board clue `clue_blacksmith_reveal`):

> He sets the hammer down this time. "Alright. A receipt with her name on it, dated the night of the gala? Could be." A pause. "Could also be dated a few days off."
>
> "Wouldn't be the first favor I've done for a regular customer who needed paperwork to say something convenient."
>
> "Nothing to do with any murder, if that's what you're fishing for. Just a woman trying to look like she was somewhere she wasn't, for reasons that are her business, not mine."

---

## Mage Tower, 1st Floor

### The Head Warlock  
*(object: `npc_head_warlock`)* **[Flavor only, no clue]**

> He doesn't look up from the pentagram chalked into the floor. "Champions of Azeroth. In my tower. How thrilling for me."
>
> "I know why you're here. I know most things that happen in this town, eventually." He still doesn't look up. "I simply choose which of them are worth saying out loud."

---

## Mage Tower, 2nd Floor

### The Head Mage  
*(object: `npc_head_mage`)* **[Single clue]**

*Teaches fact: `cold_forge`; Gives board clue: `clue_mage_cold_forge`*

> He gestures vaguely at the window, not breaking his line of sight from whatever he's scrying. "You want gossip, not magic. Fine."
>
> "The night of the gala, I had this window open for the stars. The forge below never lit. Not once, all night. Odd, for a man who works metal for a living." A thin smile. "Make of that what you will."

---

## Mage Tower, Basement

### A Small Dragon  
*(object: `flavor_dragon_child`)* **[Flavor only, no clue]**

> A dragon no bigger than a large dog, curled up on a cushion clearly meant for something else. It cracks one eye open, decides you are uninteresting, and goes back to sleep.

---

## Town Exterior (the Market)

### The Flute Player  
*(object: `npc_market_flute_player`)* **[Flavor only, no clue - cycles, one new line per interaction]**

> She doesn't break rhythm, doesn't open her eyes. Whatever you wanted, it'll have to wait for the song to end.
>
> "Not now," she breathes between phrases. "Stopping mid-song draws more stares than finishing it does."

### The Lute Player  
*(object: `npc_market_lute_player`)* **[Flavor only, no clue - cycles, one new line per interaction]**

> He's too deep in the tune to notice you're there. His fingers don't slow down for anyone.
>
> "Stop playing in the middle of the market?" He almost laughs. "That's a faster way to get attention than I'd like, thanks."

### The Dragon on the Chapel Roof  
*(object: `npc_dragon_chapel_roof`)* **[Flavor only, no clue - cycles, one new line per interaction]**

> "Ash and roses, glass and wine, none of these are truly mine," the dragon rumbles, not opening its eyes.
>
> "The steward counts what isn't there, the merchant swears an alibi."
>
> "But riddle me this, and riddle me true: which of them has lied to you?"
>
> "I do not know. I am a dragon. I sit on a roof and I rhyme."
>
> "Ask me again, if you're still stuck. I've got nowhere else to be."

### The Fruit Seller  
*(object: `npc_market_fruit_seller`)* **[Flavor only, no clue]**

> "Fresh off the cart this morning!" She barely glances up from arranging the display. "Buying, or just looking?"

### The Bread Seller  
*(object: `npc_market_bread_seller`)* **[Single clue]**

*Teaches fact: `market_stalls_shuttered`; Gives board clue: `clue_market_stalls_shuttered`*

> "Everything's fresh," he says, then pauses. "Funny thing, we all shuttered early that night. Boarded up well before dusk, ahead of the gala procession coming through. Nobody was doing business out here after that."

### The Armour Seller  
*(object: `npc_market_armour_seller`)* **[Two-stage: requires `market_stalls_shuttered`]**

**Before `market_stalls_shuttered` is known** (gives board clue `clue_market_marrow_surface`):

> "Marrow? The architect fella, yeah, sat right over there most of the evening," he says, nodding toward an empty stretch of stall. "Going through his own ledgers, muttering about materials. Practically lived at that stall for a few hours."

**After `market_stalls_shuttered` is known** (gives board clue `clue_market_marrow_reveal`):

> He rubs the back of his neck. "Shuttered that early, you said? Huh. Now that you mention it, that ledger business was that morning, not the night of the gala. Memory plays tricks."
>
> "That evening he wasn't here at all. I did see him heading back toward the Estate, though. The east wall, where the scaffolding still is. Didn't think much of it at the time."

### The Potion Seller  
*(object: `npc_market_potion_seller`)* **[Flavor only, no clue]**

> Bottles clink as she rearranges her shelf. "Everything here does exactly what the label says. Mostly."

### The Witch Seller  
*(object: `npc_market_witch_seller`)* **[Flavor only, no clue]**

> She eyes you for a long moment before going back to her herbs. "Not everything on this table is for sale. Ask first."

### A Guy Eating  
*(object: `npc_market_guy_eating`)* **[Flavor only, no clue]**

> He's got both hands full and no interest in conversation. He nods at you, mouth too full to speak.

### A Guy Eating Chicken  
*(object: `npc_market_guy_eating_chicken`)* **[Flavor only, no clue]**

> "Best chicken in Boralus," he says, entirely to himself, and takes another bite before you can reply.

### An Adventurer, Drinking  
*(object: `npc_market_adventurer_dude`)* **[Flavor only, no clue]**

> "Rough week," he says, raising his cup like that explains everything. It mostly does.

### An Adventurer, Drinking  
*(object: `npc_market_adventurer_lady`)* **[Flavor only, no clue]**

> She toasts you without much enthusiasm. "To surviving another one," she says, and leaves it at that.

---

## The Tavern, Ground Floor

### The Back Door  
*(object: `flavor_tavern_1f_back_door_a`)* **[Flavor only, no clue]**

> Locked, bolted from the other side. Deliveries only, and not for you.

### A Side Door  
*(object: `flavor_tavern_1f_back_door_b`)* **[Flavor only, no clue]**

> Locked tight. Whatever's kept back there, it's not for customers.

### A Side Door  
*(object: `flavor_tavern_1f_side_door`)* **[Flavor only, no clue]**

> Bolted shut. The kind of door that only opens for people the owner already knows.

### The Bartender  
*(object: `npc_bartender_tavern`)* **[Two-stage: requires `voss_empty_chair`]**

**Before `voss_empty_chair` is known** (gives board clue `clue_inn_voss_surface`):

> "Commodore Voss? Regular enough face in here." She keeps wiping the same spot on the bar. "Gala night he was parked right there at the end, drinking steady, from before sundown 'til well past the bell. Solid as anyone I've poured for."
>
> "Don't know what you're after, but if you're asking whether he left, the answer's no. I'd have noticed. He tips well and complains worse, hard to miss either one."

**After `voss_empty_chair` is known** (gives board clue `clue_inn_voss_reveal`):

> She glances up properly this time. "Empty chair, you said? Ah. All right. Between us, he did slip out for a stretch. Not the whole night, mind, just long enough that I noticed the same drink sitting flat when he came back."
>
> "Went to a second game, is my guess. A rougher one, upstairs at a place I won't name. He came back looking like a man who'd rather not explain himself, which is usually about welching, not murder. Draw your own conclusions."

### Big Hat Lady Enjoying Music  
*(object: `npc_gossip_guest`)* **[Single clue]**

*Teaches fact: `ashgate_anxious`; Gives board clue: `clue_inn_ashgate_anxious`*

> She leans in like she's been waiting all night for someone to ask. "Lady Ashgate? Odd all evening, if you want my honest word on it. Kept drifting back to the drinks table like she'd lost something there."
>
> "Wouldn't sit still, wouldn't finish a conversation. My husband said I was imagining it. I wasn't imagining it."

### Human Drinking  
*(object: `npc_ashby_witness`)* **[Single clue]**

*Gives board clue: `clue_inn_ashby_confirm`*

> "The Steward? Buried in paperwork the whole night, far as I saw. Practically had to shout to get a word out of him."
>
> "Kept muttering about the books not adding up. Poor man looked like he hadn't slept in a week. Didn't have it in him to plan a murder, if you ask me, let alone carry one off."

### A Sleeping Drunk  
*(object: `flavor_tavern_sleeping_drunk`)* **[Flavor only, no clue]**

> Face-down on the table, dead to the world. Whatever he knows, it's staying with him tonight.

### A Card Game  
*(object: `flavor_tavern_card_game`)* **[Flavor only, no clue]**

> "Not now, not now, I'm about to win this one back." Nobody looks up from the table.

### A Lute Player  
*(object: `flavor_tavern_lute_player`)* **[Flavor only, no clue - cycles, one new line per interaction]**

> He nods at you without missing a chord, eyes closed, lost in it. Not the moment to interrupt.
>
> "Not now," he murmurs, barely audible over his own playing. "Stop the music in a place like this, you draw the kind of attention nobody wants."

### A Hopeful Suitor  
*(object: `flavor_tavern_guy_flirting`)* **[Flavor only, no clue]**

> He's mid-sentence, entirely focused on the woman across the table. He does not notice you at all.

### A Table of Adventurers  
*(object: `flavor_tavern_adventurers`)* **[Flavor only, no clue]**

> Maps and marked-up notes cover the table. "Not looking for hires tonight," one of them says, without looking up.

### A Draenei and a San'layn  
*(object: `flavor_tavern_drinkers`)* **[Flavor only, no clue]**

> An unlikely pair, deep in conversation over their cups. Neither one so much as glances your way.

### A Dracthyr on the Table  
*(object: `flavor_tavern_dracthyr`)* **[Flavor only, no clue]**

> She's dancing on the tabletop to no music anyone else can hear. The regulars have long since stopped minding.

### A Cheering Goblin  
*(object: `npc_goblin_tavern`)* **[Two-stage: requires `ashgate_plant_question`]**

**Before `ashgate_plant_question` is known** (gives board clue `clue_inn_goblin_surface`):

> "Lady Ashgate? Hah! Wouldn't share a drop of whatever she had, all night. Practically hissed at me when I reached for it." He laughs it off, sloshing his mug. "Nobles, eh. Probably wasn't even good wine."

**After `ashgate_plant_question` is known** (gives board clue `clue_inn_ashgate_reveal`):

> He squints at you, the joke suddenly less funny. "Wait. A little glass vial, you said?" He goes quiet for a goblin. "That's, hah, that's exactly what she wouldn't let me near. Kept it right by her, poured from it herself and everything. Didn't think nothing of it at the time."

### The Flirty Guy  
*(object: `npc_flirty_guy`)* **[Flavor only, no clue - cycles, one new line per interaction]**

> "Are you a barmaid? Because you just served me a heart attack."
>
> "Is your name Ale? Because I could drink you in all night." *hic*
>
> "Did it hurt? When you fell from Boralus's highest tower, obviously, because you're clearly royalty."
>
> "I'd cross the whole of Kul Tiras for a smile like that."
>
> "You must be a siege engine, because you just knocked down every wall I had." *hic*
>
> "Excuse me, but I think you dropped something. My jaw."
>
> "Is it hot in here, or is that just the tavern fire? Actually don't answer that, I might be on fire."
>
> "They say the sea's full of fish, but I've only got eyes for the one standing right here."
>
> "I must be a sailor, because I'm completely lost in your eyes." *hic*
>
> "If I said you had a beautiful face, would you hold this for me?" He hands you nothing. There is nothing there.

---

## The Tavern, Upper Floor

### A Guest Room Door  
*(object: `flavor_tavern_door_1`)* **[Flavor only, no clue]**

> The door is locked tight. Whoever's staying here clearly wants to be left alone.

### A Guest Room Door  
*(object: `flavor_tavern_door_2`)* **[Flavor only, no clue]**

> Locked. Best not to go rifling through a stranger's room while they're not around.

### A Guest Room Door  
*(object: `flavor_tavern_door_3`)* **[Flavor only, no clue]**

> The handle doesn't budge. Someone's private business is behind this one, not yours.

### A Guest Room Door  
*(object: `flavor_tavern_door_4`)* **[Flavor only, no clue]**

> Locked, and probably for good reason. You're not here to rummage through guest rooms.

---

## The Chapel

### The Priest  
*(object: `npc_priest`)* **[Flavor only, no clue]**

> He barely glances up from the altar. "Not now. There is always something that needs doing before evensong, and today it is everything."
>
> "Whatever you need, I am sure it can wait. Or find someone else. I am, as you can see, thoroughly occupied."

### A Monk  
*(object: `flavor_monk_1`)* **[Single clue]**

*Gives board clue: `clue_monk_impossible`*

> He greets you warmly, glad of the company. "Terrible business at the Estate. I hope it's all sorted soon."
>
> "I heard her confession myself, during matins. Long before the gala ever began, of course."

### A Monk  
*(object: `flavor_monk_2`)* **[Single clue]**

*Gives board clue: `clue_monk_voss_dispute`*

> "The Commodore? I remember him well. Left before sundown, actually, here for a private penance."
>
> "Gambling debts, I'd guess, though it isn't my place to ask."

### A Monk  
*(object: `flavor_monk_3`)* **[Single clue]**

*Gives board clue: `clue_monk_marrow_dispute`*

> "The architect, you mean? I saw him myself, sneaking through the servants' entrance, well past midnight."
>
> "Furtive sort of thing. I did wonder what he had to hide."

### A Monk  
*(object: `flavor_monk_4`)* **[Single clue]**

*Gives board clue: `clue_monk_ashgate_alibi`*

> "Lady Ashgate? She was here the whole evening. Evening prayers, same as always."
>
> "I'd stake my own name on it."

### A Parishioner, Praying Quietly  
*(object: `flavor_parishioner_1`)* **[Single clue]**

*Gives board clue: `clue_chapel_ashby_candles`*

> She doesn't look at you, keeps her eyes on the altar. "The Steward's been in every day this week," she says, barely above a breath. "Lighting candles. A lot of them." A pause. "Man like that doesn't pray for nothing."

### A Parishioner  
*(object: `flavor_parishioner_2`)* **[Flavor only, no clue]**

> "Terrible business at the Estate," they murmur, eyes still on the altar. "Terrible. We pray for the family."

### A Parishioner  
*(object: `flavor_parishioner_3`)* **[Flavor only, no clue]**

> "Terrible business at the Estate," they murmur, eyes still on the altar. "Terrible. We pray for the family."

---

## The Glass Workshop

### The Glassmaker  
*(object: `npc_glassblower`)* **[Two-stage: requires `ashgate_anxious`]**

**Before `ashgate_anxious` is known** (gives board clue `clue_glassblower_surface`):

> He doesn't look up from the pipe he's turning over the flame. "A vial? Sure, I make plenty. Small, sealed tight, easy to carry without it rattling."
>
> "Had someone in not long ago wanting exactly that. Didn't think much of it. People want discreet vials for all sorts of reasons, perfume, medicine, ink."

**After `ashgate_anxious` is known** (gives board clue `clue_glassblower_reveal`, teaches `ashgate_plant_question` once heard):

> He sets the pipe down properly this time. "Funny you ask. She came back a second time, more insistent. Wanted to know if whatever went in the vial would show through wine once it was poured."
>
> "Asked me straight out whether a certain tint would still read against red wine. I make glass, not poison, so I told her I couldn't say for certain. She didn't seem to like that answer."
>
> He shrugs. "Strange thing to need glass for. Strange thing to ask a glassblower at all, now that I think on it."

### The Shopkeeper  
*(object: `npc_shopkeeper_glass`)* **[Single clue]**

*Gives board clue: `clue_shopkeeper_glass_corroborate`*

> "Looking for glassware? The master's through the back, past the archway. I just mind the counter."
>
> "Actually, funny you ask about customers. There was a woman in not long back, wouldn't stop fidgeting with her gloves the whole time he worked. Never seen someone so nervous over a little glass vial."

### A Back Door  
*(object: `flavor_glass_back_door`)* **[Flavor only, no clue]**

> Locked. Whatever's kept back here, the master isn't sharing it with customers.

### A Staircase  
*(object: `flavor_glass_staircase`)* **[Flavor only, no clue]**

> The stairs up are roped off. Whatever's up there isn't for customers.

---

## Point the Finger (the accusation vote)

Hook's response once the whole party has voted. All spoken by Hook (Silas Corwin) - `/assets/npcs/portraits/Fighter3_Portrait.png`.

### Correct - the party names Ashgate  
*(content key: `vote_correct`)*

> Corwin goes quiet for a long moment, then nods slowly. "Ashgate. Alright. That tracks with everything else we've got."
>
> "We're not done yet, though. Knowing who isn't the same as proving how. Let's go find out what was actually in that goblet."

### Wrong majority - clearing Ashby  
*(content key: `vote_clear_ashby`)*

> Corwin shakes his head before you've even finished. "Ashby? The man's been lighting candles and drowning himself in ledgers since the night it happened. That's not a murderer's guilt, that's an accountant who knows an audit's coming."
>
> "Forgery's a hanging offence on its own, no need to hang poison on him too. He's not your man."

### Wrong majority - clearing Voss  
*(content key: `vote_clear_voss`)*

> "Voss vanished from that dice game for the better part of an hour, sure," Corwin says, "but I know exactly where he really was, and it isn't anywhere near a goblet of wine."
>
> "Man welched on a second, rougher game and couldn't face the table after. That's shameful. It isn't murder."

### Wrong majority - clearing Kestrel  
*(content key: `vote_clear_kestrel`)*

> "Kestrel's receipt was backdated, I'll give you that," Corwin says, "but that's the blacksmith covering something else entirely, not her. The forge sat cold and dark the whole night, an apprentice up at the tower saw it herself."
>
> "She was nowhere near the gala when it mattered. Whatever she's hiding, it isn't this."

### Wrong majority - clearing Marrow  
*(content key: `vote_clear_marrow`)*

> "Marrow lied about where he was that evening, no question," Corwin admits, "but not to cover poison. He was back at the Estate's east wall scaffolding, in plain sight, going over materials he was never paid for."
>
> "A man circling what he's owed isn't hiding a murder. He's just embarrassed about being broke."

### Tie - nobody cleared  
*(content key: `vote_tie`)*

> Corwin looks between the split picks and folds his arms. "You can't name two murderers and call it a night. Talk it through properly this time, and vote again."

---

*End of Act 3 script, as of v93. Herbalist's Hut and Breaking Back Into the Estate are not written yet, next act after this one.*
