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

The generated runs are hidden in Magenta's list — the trigger they belong to shows **+N** — and
in the Classic editor and TrigEdit they are locked and fenced as Magenta's, with an **Open
Magenta** button that comes back here. Edit the step's chips and the run is rebuilt; remove the
row and the run goes with it. The runs use Remastered's masked reads, so they are Remastered-only
like the catalogue.

### What Magenta keeps with the map

Folders, counter names and the record of each generated run live in one member of the map
archive, `magenta\magenta.json`. The map is a whole map without it: every trigger is in TRIG
as the game reads it, and only the names, folders and the ability to rebuild the runs are
lost. Save leaves the member in unless you tick the plugin members out in the Save dialog.

## Test maps

`maps/` holds four small maps that check the EUD and counter work in StarCraft: Remastered;
`npm run maps` (which needs a sibling `scm-js` checkout, and its extracted jungle tileset for
proper terrain) writes them again. Play each as **Use Map Settings**; the lobby marks them as
EUD maps. Each says on screen what to look for.

| Map | What it checks |
| --- | --- |
| `magenta-eud-1-units-dat.scx` | Whole-dword writes (Marine max HP, Player 1's minerals), word writes (Zealot shields), a masked byte at an odd address (Ghost armor), and on the beacon a weapon's damage and cooldown. |
| `magenta-eud-2-bits-placed-units.scx` | The unit table by slot (the first placed marine gets 5 HP and invincibility, then Player 2 on the beacon), one bit of a dword (vision), a tech byte (Stim Packs), and a read of the slot's unit type. |
| `magenta-eud-3-reads.scx` | Triggers every frame; reads of the local player, the game speed, the mouse crossing the middle of the screen, and the A key's states. |
| `magenta-aplus-counters.scx` | A comparison (A > B) at start, a copy of A into B on the beacon, then B = 1234 and A = B: the generated runs, 153 triggers in all. |

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
