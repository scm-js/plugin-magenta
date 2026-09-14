# Magenta

A plugin for [scmJS](https://github.com/jeany55/scm-js), the browser-based StarCraft 1 /
Brood War map editor. Magenta is a **trigger editor for map makers**: every trigger reads as a
sentence with its parameters as chips, one search box adds any condition or action, and the map
is the picker. It carries a catalogue of StarCraft: Remastered **EUD** conditions and actions
that read and edit like the game's own, and a few things the game has no record for — copying
one death counter into another, comparing two — done as runs of ordinary triggers it generates
and keeps up to date.

Magenta writes only the map's triggers (TRIG) and one member of its own in the archive, so the
Classic trigger editor, TrigEdit, TrigScript, the AI and Import / Export Triggers all keep
working on the same records.

## Install

In scmJS: **Plugins ▸ Manage Plugins…**, paste

```
https://github.com/scm-js/plugin-magenta
```

and press **Add**. To pin a version, add a ref: `github:scm-js/plugin-magenta@v0.1.0`.

## Use

**Triggers ▸ Magenta…**, or `Ctrl+Shift+M`, with a map open. The panel floats beside the map
and can be resized from its corner; the map stays in reach while it is open.

### The list

The left pane is the map's triggers in the order the game runs them. A trigger's title is its
Comment action, the convention SCMDraft uses, so a title given here shows in every editor. A
trigger without one shows its sentences. Badges say what is special about a row: **EUD** for a
trigger that reads or writes memory, **+34** for one that Magenta generated triggers for, a
lock for a run another plugin owns, **!** for a problem.

- **Search** filters by anything in the sentences; the ⋯ menu narrows the list to triggers
  with a problem, or to EUD ones.
- **New** adds a trigger after the selected one, in its folder. Type its name and press Enter.
- **Folders** are for you; the game does not see them. ⋯ ▸ New folder… puts the selected
  trigger in a new one; drag triggers between folders and to reorder; double-click a folder to
  rename or remove it. The order in the game is the list from top to bottom, folders included.
- Drag a trigger to move it. `Alt+↑` / `Alt+↓` do the same from the keyboard, `Ctrl+D`
  duplicates, `Delete` deletes, `Ctrl+/` disables or enables every row of it.
- `Ctrl+C` copies the selected trigger as text in TrigEdit's syntax; `Ctrl+V` pastes text
  from SCMDraft or TrigEdit after the selection.
- `Ctrl+Z` / `Ctrl+Y` undo and redo inside the panel. Triggers sit outside the editor's own
  undo, so this history is Magenta's; it is dropped when the panel closes.

### A trigger

The right pane is the open trigger: its name, who it runs for, its conditions and its actions,
each a sentence. Click a chip to change it; every chip opens a small picker with a filter field,
and arrow keys and Enter work in it.

- A **location** chip flashes the location on the map as you hover its rows, and has **Pick on
  map**: click a location on the map to choose it. **Show** glides the view there.
- A **unit** chip has **Pick on map** too: click any unit to take its type.
- A **player** chip shows each slot's colour and whether it is human, computer or inactive.
  For Deaths and Set Deaths it also takes a memory address, for EUD by hand.
- A **text** chip is a small text box with the colour and effect codes as buttons.
- A **switch** chip renames the switch from its picker.
- A **death counter** is "deaths of *unit* for *player*" until you name it: press **name…**
  on the row, and the cell reads by that name in every trigger, as a chip that picks among the
  named counters or makes a **new** one on a cell nothing else uses.

**Add a condition…** and **Add an action…** are search boxes: type a few letters of what you
want ("give", "hp", "wait", "key") and press Enter; the list shows the native conditions and
actions, the EUD catalogue and the counter steps together. Click the empty box to browse all
of them by category.

The box also takes the arguments. "give 3 zealots to player 2 at beacon" inserts a Give Units
row with the count, the unit, the player and the location already set; "marine max hp 80"
the max-HP action for the Marine at 80; "player 1 brings at least 2 marines to beacon" the
Bring condition filled in. Unit names, the map's location and switch names, weapons, "player
2" or "p2", the player groups, "at least / at most / exactly", "up by / down by" and numbers
are all recognised, and what the box recognised shows next to each hit before you press Enter.

**Recipes…** next to New inserts a whole trigger, or a few, to start from: give units at a
beacon, a countdown that ends the game, respawn a unit, minerals per kill, reinforcements
every minute, win by holding a location, defeat when nothing is left, a message at the start,
a key that gives minerals, a unit type's stats. Each comes titled, with its chips on sensible
defaults (the map's first location, Current Player, a Marine) and a note saying what to change.

Rows have tools on hover: disable (⊘), move up and down, remove. With a row focused, `Delete`
removes it, `Alt+↑` / `Alt+↓` move it, `Ctrl+/` disables it, Enter opens its first chip.

Problems appear under the row they belong to: a trigger that never fires, two conditions that
contradict each other, a Wait inside a preserved trigger, a location or string the map no
longer has, a sound that is not in the archive, a memory write Remastered does not allow.

### EUD

The catalogue (`src/catalogue/eud.json`) offers conditions and actions the game has no record
for, each a fixed address in the game's memory that a Deaths condition or Set Deaths action
reaches through the deaths table. In the panel they look like any other row, with an **EUD**
tag; hover the tag for the address, the field's width, whether Remastered lets a trigger read
and write it, and the entry's notes. What is there today:

| Group | Entries |
| --- | --- |
| Units | max hit points, max shields, armor, build time, mineral and gas cost, supply used and provided, sight range, target acquisition range, ground and air weapon — per unit type |
| Weapons | damage, damage bonus per upgrade, cooldown, damage factor, range, minimum range |
| Players | minerals, gas, an upgrade's level, whether a technology is researched, the stance toward another player, shared vision |
| Game | game speed, the trigger timer, the local player, the mouse's position on screen, the screen's position on the map, a keyboard key's state |
| Placed units | hit points, shields, energy, owner, type, position, invincibility, the hallucination flag, cloak — for the unit in a given slot of the game's unit table. The chip lists the map's units with their slots: the first placed unit takes slot 0 and every later one counts down from 1699, as seen in the game. Start locations take no slot, and a unit of a human player who is not in the game takes none either, so later slots shift when a player is missing |

A few things to know:

- Any of these makes the map an **EUD map**: only StarCraft: Remastered plays it, and the lobby
  marks it. The narrow fields (a byte, a word, one bit) use Remastered's masked records, which
  1.16.1 ignores.
- Remastered allows a trigger to write only some of the game's memory. An entry it will not
  let you write is offered as a condition only, and a hand-made write to such an address
  shows as a problem.
- The mouse, the keyboard, the screen and the local player are **local to each computer**:
  a trigger that reads them runs differently on each player's machine, so keep what follows to
  text, sounds and the view, or it desyncs the game.
- **Run triggers every frame** (⋯ menu) adds a trigger at the end of the list that sets the
  trigger timer to 0 each cycle, so the whole list runs every frame instead of every two
  seconds — what a key or mouse read needs to catch anything. Every Wait and every preserved
  trigger in the map then runs on that clock.
- Each entry records where its address came from, and `verified` turns on once a map has shown
  it working in Remastered; the first runs (2026-09-12) verified the units.dat writes, a weapon's
  damage, a player's minerals and the placed-unit fields. Each address is from Armoha's eud-book
  (see `ATTRIBUTION.md`).

A record whose address the catalogue does not know still reads: "memory at 0x…", with the
numbers as chips. Maps made with other tools open with their EUD triggers translated where the
catalogue can, and untouched where it cannot.

### Counters

Death counters are the map maker's variables, and the game can only set them, add to them and
compare them with numbers. Magenta adds three steps and one comparison that work between
counters, as runs of ordinary triggers it generates:

- **Copy a counter into another**, **Add a counter to another**, **Subtract a counter from
  another** — actions. The trigger that carries one gets a private flag action, and a run of
  generated triggers follows it in the list, one per bit of the counter (a 16-bit run is half
  the size, for a counter that stays under 65,536). The run fires in the same cycle, right after
  the trigger, whatever else the trigger does.
- **Compare two counters** — a condition: "A is greater than / at least / equal to / less than
  / at most B". A run before the trigger works out the two differences every cycle, and the
  trigger's conditions read the answer. One comparison per trigger.
- **Run this trigger for each player…** (⋯ menu) makes one copy of the trigger per player you
  tick, each owned by that player, with a group of your choice (Current Player by default)
  replaced by the player in every condition and action. The trigger itself becomes the template
  and stops running.

Played in Remastered on 2026-09-12: the copy and both comparisons landed in the cycle they were asked for.

The generated runs are hidden in Magenta's list — the trigger they belong to shows **+N** — and
in the Classic editor and TrigEdit they are locked and fenced as Magenta's, with an **Open
Magenta** button that comes back here. Edit the step's chips and the run is rebuilt; remove the
row and the run goes with it. The runs use Remastered's masked reads, so they are Remastered-only
like the catalogue.

### Rows that need a Build

Some rows have no record in the game's own trigger set and only work in a map built by
[euddraft](https://github.com/armoha/euddraft), which the scmjs.dev build server runs for you.
They read like any other row, with a **BUILD** tag, and the trigger that carries one shows
a BUILD badge in the list.

Conditions:

- **The chat said `-heal` exactly**: fires in the cycle a player sends that message, for
  every player at once. **The chat said `-set` followed by a number** matches `-set 250`
  and puts the 250 in a counter named *Chat number*, for the trigger's other rows to use.
  `^…$` writes a pattern of your own, as in `^-give .*$`; the chat plugin wants two `.*` in
  one, and Magenta adds the second.
- **Player 1 pressed A**, **Player 1 clicked the left button**, **Player 1's mouse is over
  Beacon**: input that works in multiplayer. Each player's keys, clicks and mouse go out
  as game commands (the MSQC plugin), so every client agrees on them in the same cycle;
  the plain EUD reads in the catalogue are local to one computer and cannot do that. With
  *Current Player* as the player, one trigger serves everyone. Typing in chat does not
  count as key presses.
- **Any Marine owned by Player 1 at Beacon has hit points below 20**: a check over every
  unit of a kind, every cycle; also shields, energy, kills, x or y, the order id, remaining
  build time, resources and weapon cooldown, below, above or exactly; and **Any Marine owned
  by Player 1 is under attack**, *is targeting something*, *is burrowed*, *is in a
  transport*, *is moving* — or is not.

Actions:

- **Show `Score: {Score} points` to everyone**: text with counters' values in it. Write
  `{Counter name}` where a value goes.
- **Set A to A times B / divided by / modulo / a random number below N**: the counter
  maths the game cannot do, in one row.
- **For each Marine owned by Player 1 at Beacon: set hit points to 100**: a pass over every
  unit of a kind; also set shields, energy or kills, kill, remove, make invincible or
  vulnerable, hallucinate, give or take the speed upgrade, **give to a player** with the
  colour, selection and control groups following (which the owner byte in the catalogue
  does not), and **center a location on it**, so the trigger's other actions can act on
  that unit through the location. Any unit, anyone and anywhere are the wide settings.
  Since 0.2: **order to move / patrol / attack-move to** a location (the game's own order,
  one unit at a time through a location named *Magenta scratch* that Magenta makes and
  moves), **apply a spell effect** — stim, ensnare, plague, lockdown, stasis, maelstrom,
  irradiate or a defensive matrix — for so many seconds (the effect without the spell's
  overlay graphic), **hold fire** (its cooldowns rewritten each cycle, so put it in a
  trigger that runs every frame), **set the resources** of mineral fields and geysers, the
  remaining build time, the rank, and **walk through anything** or collide again.
- **Take the Marine owned by Player 1 with the least hit points: kill it, center Pick on it,
  value into Weakest**: the one unit with the least or greatest of a stat, or the **nearest
  to** a location. It does the pass verb you choose to that unit, centres a location on it
  for the trigger's other actions, and puts the value (the distance, for the nearest) in a
  counter — each of those optional.
- **Set A to the number of Marines owned by Player 1 at Beacon**: a count into a counter.
- **Set A to the hit points of the first Marine owned by Player 1 at Beacon**: a read
  into a counter; also shields, energy, kills, x, y, the order id, remaining build time,
  resources, weapon cooldown, and the yes-or-no fields as 1 or 0.
- **Move Beacon to 640, 320 keeping its size**: a location placed by numbers, in map
  pixels (32 per tile), with a new width and height if you give one.

Text with counters in it also takes `{Player 1}` for a player's name and `{Player 1's
colour}` to switch to that player's colour, and the colour and effect buttons in the text
box insert the game's own codes.

The Build dialog has a few map-wide things too, chosen once per map: **the camera follows
a location** for everyone, gliding with an inertia and a top speed (the cammove plugin).
It follows while a switch named `cammove` is set, so triggers turn it on and off with Set
Switch; Magenta names a free switch, makes the helper location `cammoveLoc` the plugin needs,
and adds a trigger that sets the switch at the start unless you untick that;
**a sound looped as background music** (the bgmplayer plugin; a plain WAV's length is read
from the file, otherwise type the seconds); **air units pass through one another**
(noAirCollision); and **lifting the sprite and image limits** (unlimiter).

In the map these are one private counter cell each: the trigger sets it (an action) or reads
it (a condition), so it stays an ordinary trigger everywhere. **⋯ ▸ Build EUD map…** sends
the map as it stands to the server, which adds the code behind the rows and hands back a
built map to save beside the source, `name-eud.scx`. Nothing about the map is kept on the
server. Only StarCraft: Remastered plays a built map. Keep the source map: the built one is
what players get, the way a compiled program is, and while the editor opens it, the rows
behind its triggers are gone into eudplib's code. The server address is the **Build
server** field of that dialog and of **Plugins ▸ Magenta Settings…** (the scmjs.dev one by default; a server of your own is the
[eud-server](https://github.com/scm-js/eud-server) container).

An action row does its work right after the map's triggers in the cycle its trigger fired;
a chat command or an input fires once per message, press or click, and a check is fresh
every cycle. Synced input needs a few things of its own in the map, which Magenta takes:
one location slot for MSQC, eight in a row for the players' mice, a player slot nobody
uses (Player 11) and a unit type that must not appear in the map (the Valkyrie by default).
A key press arrives once per press, the way Remastered reports it; there is no "while the
key is held", so a map that moves a unit while a key is down works from repeated presses. The code behind them is the Magenta plugin of the
build server, `plugins/magenta.py` in the eud-server repository, which turns the rows into
eudplib code; nothing you write in a row is code.

### What Magenta keeps with the map

Folders, counter names, the record of each generated run and of each build row live in one
member of the map archive, `magenta\magenta.json`. The map is a whole map without it: every trigger is in TRIG
as the game reads it, and only the names, folders and the ability to rebuild the runs are
lost. Save leaves the member in unless you tick the plugin members out in the Save dialog.

## Test maps

`maps/` holds four small maps that check the EUD and counter work in StarCraft: Remastered;
`npm run maps` (which needs a sibling `scm-js` checkout, and its extracted jungle tileset for
proper terrain) writes them again. Play each as **Use Map Settings**; the lobby marks them as
EUD maps. Each says on screen what to look for. All four were played on 2026-09-12; the catalogue's `verified` flags and notes carry what they showed.

| Map | What it checks |
| --- | --- |
| `magenta-eud-1-units-dat.scx` | Whole-dword writes (Marine max HP, Player 1's minerals), word writes (Zealot shields), a masked byte at an odd address (Ghost armor), and on the beacon a weapon's damage and cooldown. |
| `magenta-eud-2-bits-placed-units.scx` | The unit table by slot (the first placed marine gets 5 HP and invincibility, then Player 2 on the beacon), one bit of a dword (vision), a tech byte (Stim Packs), and a read of the slot's unit type. |
| `magenta-eud-3-reads.scx` | Triggers every frame; reads of the local player, the game speed, the mouse crossing the middle of the screen, and the A key's states. |
| `magenta-aplus-counters.scx` | A comparison (A > B) at start, a copy of A into B on the beacon, then B = 1234 and A = B: the generated runs, 153 triggers in all. |

Three more, the **probe maps**, test the candidates in `docs/candidates.md` — one key per
candidate, and each map says on screen what to press and what to look for. `npx tsx
scripts/make-probe-maps.mts --build URL` writes them; 6 and 7 need the build server (a local
eud-server container with the spec-3 plugin), and their `-eud.scx` copies are the ones to play.

| Map | What it probes |
| --- | --- |
| `magenta-probe-5-tables.scx` | Fixed-address writes and reads, no build: flingy speed, upgrade and tech costs, units.dat flags, the unit's name from the map's strings, player colour (two routes), supply, game speed, the frame counter, slot types. |
| `magenta-probe-6-units-eud.scx` | The per-unit verbs and reads of the build server's plugin: orders (two routes), spell timers, cooldown lock, resource amounts, cloak, no-clip, position, the weakest and nearest unit, and scans for attacking, under attack, target, burrowed, moving. |
| `magenta-probe-7-input-eud.scx` | Held keys and the mouse through MSQC, chat commands with a number in them. |

What a run of these settles, in the catalogue: the `verified` flag on each entry that worked,
which way round the vision bit goes (map 2 with two players), and what the key states 1 and 2
mean (map 3; settled: 1 on the press, 0 otherwise). The slot rule is settled: the first created unit is slot 0, later ones count down from 1699,
and start locations and removed units take no slot (map 2 is the probe that showed it).

## For other plugins

- `magenta.open` (`{ index?: number }`) opens the panel on a trigger; the Classic editor's
  **Open Magenta** button on a generated row calls it.
- `magenta.describe` (a `TriggerRecord`) answers its conditions and actions as sentences, the
  catalogue's included.

## Development

```sh
npm install
npm test            # vitest: the sentences, the catalogue, lowering and recognition, the counters, the checks, the expansions in a simulator
npm run typecheck
npm run build       # dist/plugin.js, the bundle the editor loads
```

`src/model/` is the pure half and has the tests: sentences and templates, the EUD arithmetic
and the catalogue, counters, checks, the sidecar, the expansions and a small simulator that
proves them. `src/ui/` is the panel, plain DOM in the editor's own widget classes. `vendor/`
is copied from the editor (the record layout, the definitions table, the unit names) so the
tests run without it; the editor is the source of truth.

To develop against a local editor, serve this folder over http with CORS and add
`http://localhost:3131/` as the plugin's address in Plugins ▸ Manage Plugins…; `npm run dev`
rebuilds the bundle as you edit.

## License

MIT. The catalogue's addresses are from eud-book, MIT; see `ATTRIBUTION.md`.
