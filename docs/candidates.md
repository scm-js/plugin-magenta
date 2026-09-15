# Candidate conditions and actions

What Magenta could add now that a build server with eudplib stands behind it, and the maps
that decide which of it works. `plan.md` is the plan for what exists; this is the plan for
what comes next, written on 2026-09-14.

## Where things stand

Magenta offers two kinds of EUD row today:

- **Tier A**, one plain trigger record at a fixed address (`src/catalogue/eud.json`, 43
  entries): units.dat and weapons.dat fields, a player's resources, upgrades, techs, stance
  and vision, the game speed and trigger timer, the local player, the mouse, the screen, a key,
  and the fields of a placed unit by slot. These work in any map; no build needed.
- **Build rows**, data in the sidecar that `plugins/magenta.py` in scm-js/eud-server turns
  into eudplib code: chat commands, text with numbers and names in it, counter maths, a pass
  over every unit of a kind (set, kill, remove, invincible, hallucinate, speed, give,
  locate), counts, reads, scans, moving a location by numbers, synced keys, clicks, mouse
  position and selection through MSQC, camera follow, music, air collision, the unit limit.

The server removes the constraint the catalogue was built under. A Tier A entry has to be
one address the game lets a trigger touch; a build row can be anything eudplib can compute
per frame over the unit table. So the question is no longer "which addresses" but "which
sentences", and the answer should come from what map makers reach for: movement and
commands from keys and chat, effects on the units that match a description, questions about
what a unit is doing, and tuning the game's tables.

## The candidates

Each row names the sentence a map maker would see, how it would be made, how sure it is
before a play-through, and the probe that tests it. Confidence: **sure** means eudplib's own
helpers or an address the game writes itself; **likely** means published maps do it but the
detail is untested here; **open** means the probe is the first look.

### Input

| Sentence | How | Confidence | Probe |
| --- | --- | --- | --- |
| *While the W key is held* | MSQC `KeyDown` events refreshing a countdown state (`msqc.held`); Remastered has no key-up to read, auto-repeat stands in | **failed**, dropped: Remastered delivers one down event per physical press and nothing while the key is held (7f counted them), and the key byte gives no held state either; presses are what there is | 7, hold W |
| *The chat said `-set N`* with N in a counter | chatEvent's pattern match (`^-set .*.*$`, two `.*` always) plus its `__ptrAddr__` / `__lenAddr__`; the hook parses the number after the first space (`chat.args`) | **passed** in multiplayer (7e: "the number in the message is 250") | 7, type `-set 250` |
| *The mouse is over a location* | MSQC mouse location; the slot is 1-based | **passed** (7d) | 7, hover the beacon |
| *Double click*, *F-keys*, *Escape*, hotkey groups | the same MSQC channel, more key names | likely | later |

### Per-unit verbs, over a filter

All of these are `foreach` verbs on the units matching a type, owner and location.

| Sentence | How | Confidence | Probe |
| --- | --- | --- | --- |
| *Order every matching unit to move / patrol / attack to a location* | a small scratch box centred on each unit, then the game's own Order action | **passed** | 6, Q |
| the same by writing the order id and target into the unit | `orderID`, `orderTargetPos` | **passed**, the fallback | 6, W |
| *Stim / ensnare / plague / lockdown / stasis / maelstrom / irradiate every matching unit for N seconds* | the CUnit timers; one tick ≈ 8 frames, so the sentence converts | **passed** (stim seen; plague, lockdown unconfirmed) | 6, E |
| *Give every matching unit a defensive matrix* | `defensiveMatrixHp` + timer; no bubble, the overlay comes from the cast | open | 6, E |
| *Matching units cannot attack* | ground, air and spell cooldowns held at 250 each cycle | **passed** | 6, R |
| *Set the resources of every mineral field / geyser at a location* | `resourceAmount` | **passed** | 6, T |
| *Set the remaining build time*, *the rank* | `remainingBuildTime`, `rankIncrease` | sure | later |
| *Set the speed of every matching unit* | the unit's own `topSpeed` / `acceleration` | **failed**, dropped: only the unit type's table counts | 6, J K |
| *Cloak / uncloak every matching unit* | status flags 0x100 + 0x200 | **failed**, no visible cloak; dropped | 6, Y H |
| *Matching units walk through anything* | eudplib `set_noclip` | **passed** | 6, U |
| *Move every matching unit by (dx, dy) pixels* | the position written directly | **failed**: Remastered ends the game ("EUD not supported"); out | 6, I |
| *Kill / heal / anything vanilla on the weakest, strongest or nearest matching unit* | a `pick` hook centres a small box on the one unit; the next cycle's vanilla action uses it, or the pick's own `do` acts at once | **passed** | 6, O, P, L |

### Reads that become conditions

New `field`s for read, scan and pick.

| Sentence | Field | Confidence | Probe |
| --- | --- | --- | --- |
| *A matching unit is attacking / idle / moving / gathering* | `order` (orders.dat id); idle is a set: 156 ComputerAI for a computer's units, 3 PlayerGuard / 23 Nothing for a human's | **read passed** (156 seen); the sentence's id sets still to settle | 6, the 2 s read-out |
| *A matching unit is under attack* | `underAttack` (attack-notify timer) | **passed** | 6, scan |
| *A matching unit has a target* | `hasTarget` | **passed** | 6, scan |
| *A matching unit is burrowed / in a transport* | status flags 0x10 / 0x40 | sure | 6, scan (burrow your zergling) |
| *A matching unit is moving* | `speed` > 0 | **passed** | 6, scan |
| *The remaining build time / resources / cooldown of a matching unit* | `buildTime`, `resources`, `cooldown` | sure | 6, the 2 s read-out |
| *The game has run N frames* | the frame counter 0x57F23C, a plain Tier A read | sure | 5, at 10 s |
| *N game seconds have passed* | 0x58D6F8 (the entry dropped in September read 0x58D6F4, one dword short) | likely | 5, at 15 s |
| *Player N is human / a computer / not there*, *has left*, *is Zerg* | slot type 0x57F1B4, left 0x581D62, race 0x57F1C0 bytes | likely | 5, at start |

### Tables, one address each (Tier A)

Catalogue entries, no build needed, if the probe shows the write takes.

| Sentence | Address | Confidence | Probe |
| --- | --- | --- | --- |
| *Set the speed of a unit type* | four records: flingy.dat movement control 0x6C9858 → 0 (most ground units are iscript-controlled, their top speed field holds 1), top speed 0x6C9EF8, acceleration 0x6C9C78, halt distance 0x6C9930, by the unit's flingy id | **passed** for units created afterwards; existing units keep their speed | 5, keys 1 and K |
| *Set the cost / time / maximum level of an upgrade* | upgrades.dat 0x655740, 0x655840, 0x655B80, 0x655700 | likely | 5, key 2 |
| *Set the cost / time / energy of a technology* | techdata.dat 0x656248, 0x6561F0, 0x6563D8, 0x656380 | likely | 5, key 2 |
| *Make a unit type a detector / permanently cloaked / mechanical …* | units.dat advanced flags 0x664080, one bit each | likely for units created afterwards | 5, keys 3 and 4 |
| *Name a unit type from the map's strings* | units.dat map string 0x660260 (Remastered) | likely | 5, key 5 |
| *Set the size class of a unit type* | 0x662180 | likely | 5, key 5 |
| *Set a player's colour* | the colour byte 0x581D76 and minimap byte 0x581DD6 (the mapping 0x57F21C does nothing) | **passed** | 5, key 6 |
| *Set a player's supply cap / available* | 0x582234 / 0x5821D4 per race (Terran probed) | likely | 5, key 8 |
| *Set the game speed* | 0x6CDFD4, "Backed By Code" | **failed**, dropped | 5, key 9 |
| *Change what a unit type looks like* | units.dat graphics 0x6644F8, for units made afterwards | **passed** | 5, key 0 |

### Presentation

| Sentence | How | Confidence | Probe |
| --- | --- | --- | --- |
| *Change the terrain at a location* | writing the tile buffer (0x5993C4 points at it); walkability does not follow | **failed**, dropped: the writes changed nothing on screen (probe 10, keys 1–3, with a scroll away and back) — Remastered's EUD layer does not reach the buffer the renderer draws from | 10, keys 1–3 |
| *Tint / flash / fade a matching unit* | sprite image flags and colouring | **failed**, dropped: the first draw-function write ended the game with "EUD not supported" (probe 10, key 4), as the position write did | 10, key 4 |

### Not planned

Saving anything between games (no bank on Remastered); drawing new UI; anything for 1.16.1;
a general language over eudplib (TrigScript is the language, and a Tier B payload is still out
of `plan.md`'s scope).

## The maps

`scripts/make-probe-maps.mts` writes three maps into `maps/`, one key per candidate; each
says on screen what to press and what to look for. Map 5 plays as written; maps 6 and 7 are
built through the server, and their `-eud.scx` copies are the ones to play:

```sh
# the build container with the spec-3 plugin, from a scm-js/eud-server checkout
docker build -t eud-server-local .
docker run -d --name eud-local -p 8085:8080 -v $PWD/plugins/magenta.py:/ed/plugins/magenta.py:ro eud-server-local
# the maps, from this repository (a sibling scm-js checkout with extracted data)
npx tsx scripts/make-probe-maps.mts --build http://localhost:8085 --log
```

Play each as Use Map Settings in StarCraft: Remastered, alone (Player 2 is a computer). Every
map runs its triggers every frame.

**Probe 5 — tables** (`magenta-probe-5-tables.scx`, no build)

| Key | Writes | Pass looks like |
| --- | --- | --- |
| 1 | Zergling flingy top speed and acceleration ×4 | order your zerglings across the map: about four times as fast |
| 2 | Infantry Armor (upgrade 0): max level 10, 1/1, 1 s; Stim Packs: 1/1, 1 s | the Engineering Bay and Academy offer that |
| 3 | Ghost permanent-cloak flag, then an enemy Ghost appears in the Pen | it is cloaked; marines cannot shoot it |
| 4 | Marine detector flag | the Ghost shows and can be shot |
| 5 | Marine map string "Gunner", size class Large | a selected marine is called Gunner |
| 6 | Player 1 colour byte and minimap byte = yellow | your units turn yellow |
| 7 | Player 1 colour mapping = 3 | purple, if this is the table that counts |
| 8 | Terran supply max and available = 200 | 200 cap in the top bar |
| 9 | game speed = 3 | the game slows |
| 0 | Marine graphics = the Zealot's flingy, then a marine at the Beacon | it looks like a zealot, or nothing changes |
| — | reads at start | frame counter at 10 s, game seconds at 15 s, your slot type and race bytes, Player 3's slot type |

**Probe 6 — units** (`magenta-probe-6-units-eud.scx`)

Marines start at 10, 20, 30, 40 HP; your zergling can burrow; the enemy has four zerglings,
two hydralisks and a tank in the Pen.

| Key | Hook | Pass looks like |
| --- | --- | --- |
| Q | enemy zerglings: the game's Order to the Beacon | they walk there |
| W | enemy hydralisks: order 6 written in, target the Beacon | they walk there, or ignore it (then the raw route is dropped) |
| E | stim marines, ensnare zerglings, plague hydralisks, lockdown the tank, matrix your zergling | the effects show |
| R | toggle: marines' cooldowns held at 250 | they cannot shoot while it is on |
| T | mineral fields at the Mine 5000, the geyser 1 | click them |
| Y / H | marines cloak flags on / off | they shimmer, then not |
| U | marines no-clip | they walk through each other |
| I | marines +96 px | a jump, a glitch, or nothing |
| O | pick the weakest marine, kill it, say its HP | the 10 HP marine dies, "it had 10 HP" |
| P | pick the marine nearest the Beacon, heal and ping it | the right one |
| — | scans | one line each: a zergling attacking (order 10), a marine under attack, a marine with a target, your zergling burrowed, a marine moving |
| — | every 2 s | "first zergling's order id = N, first mineral field = M" |

**Probe 7 — input** (`magenta-probe-7-input-eud.scx`)

| Do | Pass looks like |
| --- | --- |
| hold W | "W down" once, minerals climb while held, "W up" on release |
| press D | "D pressed" |
| left-click | "Left click" |
| mouse over the beacon | "Mouse over the beacon", then "off" |
| type `-give` | +100 minerals |
| type `-set 250` | "the number in the message is 250" |

What to write down: for each key, pass / fail / what happened instead. Two routes are probed
for orders (Q, W) and colours (6, 7); the one that works is the one that ships.

**Probe 8 — the catalogue** (`magenta-probe-8-catalogue.scx`, no build; written 2026-09-14
with slice 3, not yet played)

Every row here is lowered by the catalogue's own entries — the speed as four records through
units.dat's flingy column, the colour as two, the name from a map string, the looks through
units.dat — so a pass verifies the entry as shipped, not just the address. Your marines start
at 10 HP; lockdown and personnel cloaking are researched; two enemy tanks sit in the Pen.

| Key | Writes | Pass looks like |
| --- | --- | --- |
| 1 | Zergling speed 0.5 px/frame, a new zergling at the Beacon, all ordered to the Pen | the new one crawls; "Read back: … top speed is 128" |
| K | Zergling speed 13, a new zergling, all ordered home | the new one sprints |
| 2 | Infantry Armor 1/1, 1 s, max level 10; Stim 1/1, 1 s; Lockdown 10 energy | the Engineering Bay and Academy offer that; the ghost (50 energy) locks down both tanks |
| 3 | Marine named "Gunner", size class large | a selected marine is called Gunner; "Read back: the Marine's size byte is 3" |
| 4 | Marine regenerates HP; Zergling invincible flag, then an enemy zergling at Home | marine HP climbs from 10; the enemy zergling cannot be killed |
| 5 | Player 1 colour yellow (unit byte + minimap byte) | your units and minimap dots turn yellow |
| 6 | Terran supply provided 200 and cap 200 for P1 | n/200 in the top bar; "Read back: … supply used is at least 1" |
| 7 | Marine looks like a Zealot, then a new marine at the Beacon | it draws as a zealot |
| 8 | Marine max HP 100, sight 11, build time 1 s; Gauss Rifle range 8 tiles, cooldown 1 | a new marine at 100 HP sees and shoots far and fast; the Barracks trains one in a second |
| 9 | +500 gas, Infantry Weapons level 3, P1 allied to P2 | +500 gas; marines show +3; your units stop shooting the tanks |
| 0 | ghost (slot 0) energy 250, zealot (slot 1699) shields 0 | select them |
| — | reads at start | the frame counter at 10 s, the clock at 15 s, your slot type (2 = human) and race, Player 3's slot (0 = empty) |
| — | reads on your doing | cloak the ghost (C): "your ghost is cloaked"; walk it east then south past the middle: x ≥ 1024, y ≥ 1024; scroll the screen right and below the middle |

Player 2's "has left" line cannot fire alone (a computer never sets it); a second human who
leaves would.

**Probe 9 — the rest** (`magenta-probe-9-rest.scx`, no build; written 2026-09-14 after probe 8's
reports, not yet played). What probe 8 left unverified, each with an effect to watch or a
read-back line. Press 6 and 7 before 5 (5 swaps the marines' weapon away from the Gauss
Rifle). Your marines start at 10 HP and your vulture at 20; personnel cloaking is researched.

| Key | Writes | Pass looks like |
| --- | --- | --- |
| 1 | Marine size class large, an enemy vulture at Home | its shots take 5 off a marine, not 20; "Read back: … size byte is 3" |
| 2 | Vulture organic, Marine mechanical, cloakable, burrowable, hero, robotic | the medic heals the vulture; an SCV can repair a marine; four read-back lines |
| 3 | Marine 1 mineral, 1 gas, 4 supply; Supply Depot provides 30, then a new depot at Home | the Barracks shows 1/1 and 4 supply; provided supply rises by 30 |
| 4 | Marine sight 1, acquisition 1, a new marine at the Beacon | it reveals only a tiny circle; a read-back line |
| 5 | Marine ground weapon Arclite Shock Cannon, air weapon none; two zerglings and an overlord at Home | zerglings die in one splash shot; the overlord is ignored |
| 6 | Gauss Rifle cooldown 1, factor 2, +10 a level, Infantry Weapons 3; two zerglings at Home | marines fire without pause, a volley takes about 72 |
| 7 | Gauss Rifle minimum range 3 tiles; a zergling at Home | marines cannot shoot it up close, only after backing off |
| 8 / 9 | vision: P1's row bit P2, then P2's row bit P1 | the Pen shows under one of them — that settles the direction |
| 0 / Q | alliance: P2 allied to you, then you to P2 | the tanks hold fire on a marine sent to the Pen; your marines stop attacking on their own |
| W | the zealot's hallucination flag | tinted, double damage, dies after a while |
| — | reads at start | your slot type (2), Player 3's (0), your race (1), supply used ≥ 1 |
| — | reads on your doing | cloak the ghost; walk it east and south past the middle; scroll the screen right and down |

**Probe 10 — presentation** (`magenta-probe-10-presentation-eud.scx`, built through the
spec-4 server; written 2026-09-14, not yet played). Slice 4's two candidates as hooks in
`plugins/magenta.py`: `terrain` rewrites every tile under a location in the MTXM array the
game draws from (walkability does not follow), and the `tint` verb rewrites the draw
function of every image of a unit's sprite — the look of a cloaked unit, of a hallucination,
of the warp flash — without the state behind it.

| Key | Does | Pass looks like |
| --- | --- | --- |
| 1 | the ground under Home becomes another terrain's tile | the tiles change (scroll away and back if not at once) |
| 2 | the ground under the Pen becomes a third terrain's tile | the tiles change |
| 3 | the Beacon's tiles become tile 0 | black, or the tileset's tile 0 |
| 4 | marines drawn with the cloaked look (draw function 6) | see-through marines |
| 5 | marines with the hallucination look (16) | blue marines |
| 6 | marines with the warp flash (17) | a white flash, then whatever the game does next |
| 7 | marines back to normal (0) | plain marines |
| 8 | the enemy zerglings with the hallucination look | blue zerglings |

For each: does the look show, and does it stay (an animation frame may reset it).

**Probe 10, played 2026-09-15.** Keys 1, 2 and 3 changed nothing on screen; key 4 ended the game with
"EUD not supported", so 5 to 8 were never reached. Slice 4 is dropped: neither the tile array the
game draws from nor a sprite's images can be written through Remastered's EUD layer. The server keeps
the two hooks unoffered, like `nudge`.

**Probe 9, played 2026-09-14.** Passes: size class (1: a vulture took 5 off a marine, the
read-back showed), the organic and mechanical flags (2: the medic healed, the SCV repaired),
unit costs and supply (3), the ground weapon swap (5: marines fired the tank's cannon), the
Gauss Rifle's cooldown, factor and bonus (6), its minimum range (7), vision (9 showed the Pen:
Player 2's row with Player 1's bit is Player 1 seeing Player 2's sight; 8 did not), alliance
both ways (0, Q), the hallucination flag (W: the unit reads "Hallucination" in game, but no
tint and no timed death — those come from a real cast), and the cloak and position reads on
the ghost. Fail: the acquisition-range read-back after a write of 1 (4). Unreported: the
tiny sight circle (4), the overlord ignored (5), the four flag read-back lines (2), the
start lines and the screen reads. Second report: the start lines showed (slot type, race, supply used), the marine with sight 1 revealed only a tiny circle once off the beacon, the overlord was ignored (the ghost, whose air weapon was not touched, still shot it), and the four flag read-back lines showed. Only the screen reads went unmentioned.

**Probe 8, played 2026-09-14** (first report). Passes: the speed entry (1 crawls, K sprints —
the four-record group as the catalogue writes it), the upgrade and technology costs and the
lockdown energy cost (2), the name from a map string (3, with a question: the report says
"everyone" was named Gunner, being checked), regeneration on marines already on the map and
the invincible flag on a zergling made afterwards (4), the colour group (5), supply provided
and cap (6: 7/200), the looks entry (a marine drawn as a zealot, and marines trained later
keep the look), the build time (8: trained in a second), gas and the upgrade level (9), a
placed zealot's shields (0). Second report, same day: the "Read" lines did show (the frame
counter at 10 s, the clock at 15 s, the speed read-back), only the marines were named Gunner
(the name write is per type), the key 7 marine drew as a zealot and marines trained after it
kept the look, the key 8 marine had 100 HP and shot from farther, and the ghost's energy
flashed to 250 and settled at 200/200 — the write takes and the game clamps to the maximum.
Fail: the armor level cap (Infantry Armor still stopped at 3 with max level 10 written), so
`upgrade.maxLevel` is a read only. Likely: the alliance write (the marines seemed to stop
shooting the tanks). Unreported: the slot type and race lines, the supply-used read-back, the
size read-back, sight, cooldown, the cloak, position and screen reads.

## After the play-through

The server side is done: `plugins/magenta.py` takes spec version 3 with every hook above,
and still takes 2. What is left is the plugin, in slices, each shipping only what passed:

1. **Input rows.** *While the W key is held* as a condition row (a `held` triple in the
   sidecar's `msqc`, composed as `KeyDown(W); NotTyping` + `KeyUp(W)`), and a number chip on
   the chat row (*The chat said `-set N`* puts N in a named counter: `chat.args` cells
   allocated with the first pattern). `builds.ts` types, `composePlugins`, `buildRows.ts`, the
   sentences, `MAGENTA_SPEC_VERSION` 3, tests.
2. **Per-unit verbs and picks.** The `foreach` "what" chip gains the verbs that passed; a
   `pick` row (*the weakest / strongest / nearest matching unit*) with a location chip and an
   optional counter; the `field` chip gains the new reads. Recipes: "when a unit is below 30%
   send it home", "stun everything in the arena".
3. **Table entries.** Catalogue JSON for the flingy, upgrade, tech, flag, name, size, colour,
   supply rows that passed, with sentences and `verified` set from the run; the frame counter
   and the corrected seconds address; slot type, left and race as conditions. The unit-name
   entry needs a string chip (the map's strings) — the first entry whose value is a string.
4. **Presentation**, only if a later probe map shows terrain or tint working.

Each slice: `npm test`, `npm run typecheck`, `npm run build`, a headless run of the panel, the
README's catalogue table, a tag.

## Results

**Probe 5, played 2026-09-14.** Passes: the Ghost permanent-cloak flag (the spawned ghost was
cloaked), the Marine detector flag, the unit name from the map's strings ("Gunner"), the
colour byte 0x581D76 + minimap byte, Terran supply (6/200), the graphics swap 0x6644F8 (new
marines drew as zealots), and upgrades.dat / techdata.dat costs — with the correction that
upgrade 0 is Terran Infantry Armor, which is what the probe wrote. Fails, dropped: the colour
mapping 0x57F21C and the game speed write 0x6CDFD4. The flingy speed write took three cuts to read right. The zergling, like most ground
units, is *iscript-controlled* (flingy.dat movement control 2, top speed 1), so the speed
field is not in play until the flingy is switched to flingy control; and the table is copied
into a unit when it is made. The crawl cut settled it: a zergling spawned after the write
crawled, while the ones already on the map kept their speed through both the crawl and the
sprint writes. So *set the speed of a unit type* passes for units created afterwards — the
same note as the flags and the graphics — and nothing reaches an existing unit (the per-unit
fields in probe 6 changed nothing). The size-class write and the reads at start were not reported on.

**Probe 6, played 2026-09-14** (cuts c to e; the first cuts had my bugs: five hooks on one
flag, of which only the first ran, and a key code missing from the script). Passes: the game's
Order through a moved location (Q), the raw order write (W), resources of mineral fields and
the geyser (T), no-clip (U), the weakest-unit pick killing inside the pick (L) and through a
vanilla kill at the picked location (O), the nearest-unit pick with a vanilla heal (P). The
timers write (E: stim took, and read as "permanent" at 240 — the game counts these timers
down about once per eight frames, so the sentence must say seconds and convert); the
defensive matrix showed no bubble (the overlay comes from the cast, the absorption should
still be there); plague and lockdown were hidden by the fog, unconfirmed. Fails: the position
write (I: Remastered ended the game with an "EUD not supported" message — out), per-unit
speed (J, K: the unit's own top speed and movement type change nothing, while the table write
moved every zergling in probe 5 — speed is a unit-type sentence only), the cloak status flags
(Y, H: no visible cloak — out as a verb). Two rules came out of it: a location the hook centres
on a unit must be a small box, not a point (Order and a counted Kill ignore a zero-size
location; a heal did not), and a flag several hooks watch is cleared after the last of them
(`afterTriggerExec`). The cooldown lock (R) passed: marines could not kill their own or the enemy's units
while it was on. The read-out passed and taught one thing: an idle *computer* zergling reads
order 156 (ComputerAI), not 23 (Nothing) or 3 (PlayerGuard), so "is idle" is a set of ids
that depends on the owner. The scans passed: the moving, has-a-target and under-attack lines came up in the fight.

**Probe 7, played 2026-09-14.** Passes: the held key (W down read as state 1), a synced key
press (D), a synced click. The mouse-over-a-location read did nothing: MSQC's `Mouse : base`
setting is a 1-based location number (its own print says `P1:50` for base 50) and the hook
read the slot after it; fixed in `msqc_follow`, and the plugin's `mouseBase` should be
described as the number MSQC gets, not a 0-based slot. Chat commands pass in a multiplayer game (`-give` gave the minerals); in single player the
typed line never showed, so they are best assumed multiplayer-only until a run says otherwise. `-set 250` did nothing because the chat plugin takes a key as a
pattern only in the form `^start.*middle.*end$` — exactly two `.*` — and `^-set .*$` was
registered as a literal message; the probe now sends `^-set .*.*$`, and Magenta's chat row must
write that form (its hint and `tests/builds.test.ts` use the one-`.*` form today). "W up" never came: MSQC's KeyUp waits
for the key byte to read 0 after a down it tracked, and in Remastered the byte pulses to 1 for
one frame on a press and is 0 otherwise, so there is no held state to fall out of; what a held
key does produce is Windows' auto-repeat. The held state is now a countdown (24 cycles, a second
at fastest and longer than the repeat delay) refreshed by every down; a condition reads ≥ 1, and
a release shows about a second late. Cuts 7d–7f settled it the other way: the down count
rose by one per physical press and never while holding, so there is nothing to build "held"
on; the sentence is dropped and `msqc.held` stays in the server as a countdown nobody should
rely on. The "W up" line that never showed was the probe's own doing: an All Players trigger with a
Current Player condition and a shared switch — the computer's run, whose state was always 0,
printed "W up" to nobody and cleared the switch. The same triggers on a death-counter latch
worked. Magenta now warns on that shape.

## Status (2026-09-14, end of the play-through)

- All three probe maps were played (5 in single player, 6 and 7 in single and multiplayer);
  the Results section above holds every outcome. Unreported: the size-class write, the reads
  at start (frame counter, seconds, slot type and race bytes), lockdown and plague under the
  fog, and chat in single player.
- What ships from it, by slice: (1) chat commands with a number, the Order verb, the pick
  row, the timer verbs in seconds, the cooldown lock, resources, no-clip, the new fields and
  scans; (2) the table entries — speed of a unit type (four records, new units only), upgrade
  and tech costs, the flags, the unit name from the map's strings, the colour byte, supply,
  the graphics swap, the frame counter, the corrected seconds address, slot type / race /
  left. Dropped: per-unit speed, the cloak flags, the position write, the colour mapping, the
  game speed write, held keys.
- Server: `plugins/magenta.py` spec 3 as built and fixed today (shared flags, box locations,
  the 1-based mouse slot, Order by constants); `server.py` lets a setting value run to the
  request cap instead of 4000 characters. Deployed to Cloud Run the same day (revision
  eud-server-00002); maps 6 and 7 built through https://eud.scmjs.dev afterwards.
- Plugin, slice 1 (0.2.0, same day): `MAGENTA_SPEC_VERSION` 3; the chat row's *exactly /
  followed by a number* chip with the args cells and the *Chat number* counter, and every
  pattern written in the chat plugin's two-`.*` form; the pass verbs order / spell effect
  (seconds) / hold fire / resources, build time, rank / no-clip; the pick row; the new
  fields, with yes-or-no ones as *is / is not* in a check; `mouseBase` as the 1-based number
  MSQC gets; a check that warns when a trigger every player runs guards Current Player
  conditions with a shared switch. The "switch cleared by the build" reading was wrong: the
  probe's All Players trigger ran for the computer too, whose Current Player state was 0, so
  *its* run printed the invisible "W up" and cleared the switch. No plugin was involved.
- Plugin, slice 3 (0.3.0, 2026-09-14, the table entries — list item 3 above; item 2's verbs
  and picks went out with slice 1): 31 catalogue entries — the speed of a unit type as a
  *grouped* entry (four records, the row takes the top speed and derives acceleration and
  halt distance the way the game's tables relate them), the name from a map string (the first
  string-valued entry, with the text chip), size class, the looks through units.dat's flingy
  column (a *via* lookup the game data supplies at run time; the speed and looks rows are
  offered once it is loaded), ten flags, upgrade cost/time/max level, tech cost/time/energy,
  the colour as a grouped entry (unit byte + minimap byte), supply provided/used/cap by race
  (a `race` argument), slot type, race and left as conditions, the frame counter and the game
  clock. `verified` is set from the play-through on 15 of them; the rest wear a dashed EUD tag
  until probe 8 says. The game speed became a read (its write failed). Found on the way: the
  alliance entry sat at 0x58D6F8, which is the game clock — moved to eud-book's 0x58D634 and
  put in probe 8. The trigger list's summary now reads a build condition, a build row and a
  grouped row as their sentences instead of raw deaths.
- Owed: probe 8 played (the six unreported reads, the ten unverified entries of this slice,
  the never-probed older ones it carries); slice 4 only if a probe shows terrain or tint
  working.
- Slice 4 (2026-09-15): probe 10 failed both candidates — terrain writes through the MTXM pointer
  changed nothing on screen, and a draw-function write on a sprite's images ended the game with
  "EUD not supported". Presentation is dropped; the plugin gets no terrain or tint row. The
  catalogue and build rows as of 0.3.5 are the full set.
