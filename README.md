# Magenta

Magenta is a trigger editor plugin for [scmJS](https://scmjs.dev/editor/), the StarCraft and
Brood War map editor that runs in the browser. Each trigger reads as a sentence. Its
parameters are chips that you click to change, and you can pick units and locations straight
from the map. One search box adds any condition or action.

Magenta also has a catalogue of EUD conditions and actions for StarCraft: Remastered. And it
has a few steps the game has no trigger for, such as copying one death counter into another.
Magenta builds those from ordinary triggers that it generates and keeps up to date.

Magenta writes only the map's triggers and one file of its own in the map archive. The
editor's Trigger Editor, the Text Trigger Editor, TrigScript and Import / Export Triggers all
keep working on the same triggers.

## Install

In scmJS, open **Plugins ▸ Browse Plugins…** and press **Install** next to Magenta. You can
also open **Plugins ▸ Manage Plugins…**, paste

```
https://github.com/scm-js/plugin-magenta
```

and press **Add**. To pin a version, add a tag: `github:scm-js/plugin-magenta@v0.12.0`.

Magenta needs the [TrigScript plugin](https://github.com/scm-js/plugin-trigscript). It comes
with the editor, and the editor installs it with Magenta if it is missing.

## Use

Open a map and choose **Triggers ▸ Magenta…** (Ctrl+Shift+G). The panel floats beside the
map. Drag its corner to resize it.

### The trigger list

The left pane lists the map's triggers in the order the game runs them.

A trigger's title is its first Comment action. SCMDraft uses the same convention, so a title
you give here shows in other editors too. Any further Comment shows as a note among the
actions. A trigger with no Comment shows its sentences instead.

Badges on a row:

- EUD: the trigger reads or writes game memory.
- +34: Magenta generated 34 helper triggers for it.
- A lock: another plugin owns these triggers.
- !: the trigger has a problem.

In the list:

- **Search** filters by any word in the sentences. The ⋯ menu can narrow the list to
  triggers with a problem, or to EUD triggers.
- **New** (Ctrl+N) adds a trigger after the selected one, in the same folder. Type its name
  and press Enter.
- Folders are only for you; the game does not see them. **⋯ ▸ New folder…** puts the
  selected trigger in a new folder. Drag triggers between folders or to reorder them.
  Double-click a folder to rename or remove it. The game runs the list from top to bottom,
  folders included.
- Alt+↑ and Alt+↓ move a trigger. Ctrl+D duplicates it, with its own copies of any generated
  triggers. Delete removes it. Ctrl+/ disables or enables all its rows.
- Ctrl+C copies the selected trigger as TrigEdit text. Ctrl+V pastes TrigEdit or SCMDraft
  text after the selection.
- Ctrl+Z and Ctrl+Y undo and redo inside the panel. This history belongs to Magenta and is
  separate from the editor's undo. It is cleared when the panel closes, or when another
  editor or plugin changes the triggers.

**⋯ ▸ Dock on the right** moves the panel into the right dock, where the list sits above the
trigger. The same choice is on Magenta's page in **Edit ▸ Preferences…**, under Plugins. Drag
the divider between the list and the trigger to resize them. Double-click the divider, or
press **☰**, to hide the list. Magenta remembers the size, the dock and the list width.

### Editing a trigger

The right pane shows the open trigger: its name, the players it runs for, its conditions and
its actions. Click a chip to change it. Each chip opens a small picker with a filter field,
and the arrow keys and Enter work in it.

- Location: hovering its rows flashes the location on the map. **Pick on map** lets you click
  a location. **Show** moves the view to it.
- Unit: **Pick on map** takes the type of the unit you click.
- Player: shows each slot's colour and whether it is human, computer or inactive. In Deaths
  and Set Deaths it also takes a memory address, for writing EUD by hand.
- Text: a small text box with buttons for the colour and effect codes.
- Switch: you can rename the switch from the picker.
- Death counter: reads "deaths of *unit* for *player*" until you name it. Press **name…** on
  the row, and the counter shows by that name in every trigger. **New counter…** makes a
  named counter on a cell nothing else uses. **⋯ ▸ Counters…** lists the named counters.

Rows show tools on hover: disable (⊘), move up, move down and remove. With a row focused,
Delete removes it, Alt+↑ and Alt+↓ move it, Ctrl+/ disables it, and Enter opens its first
chip.

### Adding conditions and actions

**Add a condition…** and **Add an action…** are search boxes. Type a few letters ("give",
"hp", "wait", "key") and press Enter. The results include the game's own conditions and
actions, the EUD catalogue and the counter steps. Click the empty box to browse everything by
category.

You can type the arguments too:

- "give 3 zealots to player 2 at beacon" adds Give Units with all four values set.
- "marine max hp 80" adds the max hit points action for the Marine, set to 80.
- "player 1 brings at least 2 marines to beacon" adds a filled-in Bring condition.

The box knows unit names, the map's location and switch names, weapons, players ("player 2"
or "p2"), player groups, "at least / at most / exactly", "up by / down by" and numbers. Each
result shows what was recognised before you press Enter.

**Recipes…**, next to **New**, inserts one or more ready-made triggers:

- Give units at a beacon
- Countdown that ends the game
- Respawn a unit when it dies
- Minerals for each kill
- Reinforcements every minute
- Win by holding a location
- Defeat when nothing is left
- Message at the start
- A key gives minerals
- Change a unit type's stats

Each recipe has a title, default values (the map's first location, Current Player, a Marine)
and a note saying what to change.

You can also start from the map. Right-click a placed unit and choose **New trigger about
this Marine…**, or right-click inside a location and choose **New trigger at Beacon…** (with
the name of the unit or location you clicked). Magenta then offers a few starting points:

- For a unit: when it dies, when it is at its location, give it to the player who arrives,
  or set its hit points (EUD).
- For a location: when a unit arrives, create units there, or kill everything there.

The new trigger goes after the selection, with the unit, its owner and the location filled
in.

### Problems

Problems show under the row they belong to. For example:

- a trigger that can never fire
- two conditions that contradict each other
- a Wait inside a preserved trigger
- a location or string the map no longer has
- a sound that is not in the archive
- a memory write that Remastered does not allow

EUD rows, counter steps and build rows only work in StarCraft: Remastered. If the map's
revision is older (**Scenario ▸ Map Revision…**), each of these rows gets a dim note. The
**Set revision to Remastered** button above the rows marks the map as a Remastered map. Older
versions of the game then refuse it. Without that, they would play it with those rows doing
nothing.

### In plain words

**In plain words**, under the rows, opens a short description of the trigger. It says who
runs it, when it fires and what it does. It also says whether it repeats, how often it runs,
and how long its Waits hold up the owner's other triggers.

Below that, each switch, counter and location the trigger uses is listed with the other
triggers that set or read it. Click a name to go to that trigger.

### Dry run

**⋯ ▸ Dry run…** opens a second panel that runs the triggers without the game. It starts from
the map as it is, with its placed units, locations, player slots and forces. It runs the
triggers as the game does: each player in turn, each player's triggers in list order, and a
trigger only once unless it is preserved.

**Step** runs one cycle and **Run 10** runs ten. **Run on** runs until someone wins or loses,
or nothing has happened for 50 cycles. **Reset** starts over from the map as it is now; editing
a trigger stops the run until you reset.

The panel shows:

- The selected trigger, with a verdict on each condition and the value the run saw ("has
  0"), for the player chosen at the top. Use this to find out why a trigger did not fire.
- Cannot tell: conditions the run cannot decide, such as a key press, a chat command, a
  build row's answer or a read of the game's memory. Tick one to pretend it holds.
- State: the switches that are set, counters and memory cells, the countdown timer, and each
  player's minerals, gas and unit counts. Click a value to change it. **Put units** adds
  units of a type for a player at a location. That is how you bring a unit to a beacon in a
  dry run.
- Log: what fired, the text shown, who won or lost, and anything the run had to skip.

The dry run tracks switches, counters, timers, resources, units at locations, alliances,
victory and defeat, and Waits. It does not fight, move units on its own or count kills, and it
skips Modify Unit, orders, sounds, the leaderboard and the view. A cycle is two seconds, or one
frame when the map runs triggers every frame. Resources start at 0, as in a Use Map Settings game.

### EUD conditions and actions

The catalogue (`src/catalogue/eud.json`) has conditions and actions the game has no trigger
for. Each one is a fixed address in the game's memory, which a Deaths condition or a Set
Deaths action reaches through the deaths table. In the panel they look like other rows, with
an EUD tag. Hover the tag to see the address, the field's width, whether Remastered allows
reading and writing it, and any notes.

| Group | Entries |
| --- | --- |
| Units | Per unit type: max hit points, max shields, armor, build time, mineral and gas cost, supply used and provided, sight range, target acquisition range, ground and air weapon, speed, size, name (from the map's strings), graphics (another type's look), and flags (detector, permanently cloaked, can cloak, can burrow, regenerates, invincible, hero, organic, mechanical, robotic) |
| Weapons | Damage, damage bonus per upgrade, cooldown, damage factor, range, minimum range |
| Upgrades | Mineral and gas cost, research time, maximum level |
| Technologies | Mineral and gas cost, research time, energy cost |
| Players | Minerals, gas, an upgrade's level, whether a technology is researched, stance toward another player, shared vision, colour, supply provided, used and capped (by race). As conditions: what the player's slot holds, their race, whether they have left |
| Game | Game speed (read only), the trigger timer, the local player, the mouse position on screen, the screen's position on the map, a key's state, frames run, seconds on the game clock |
| Placed units | Hit points, shields, energy, owner, type, position, invincibility, the hallucination flag, cloak |

Placed-unit entries work on a slot in the game's unit table. The chip lists the map's units
with their slots. The first placed unit takes slot 0, and each later one counts down from
1699. Start locations take no slot. Neither does a unit owned by a human player who is not in
the game, so later slots shift when a player is missing.

Things to know:

- Any EUD row makes the map an EUD map. Only StarCraft: Remastered plays it, and the lobby
  marks it. Narrow fields (a byte, a word, one bit) use Remastered's masked records, which
  1.16.1 ignores. Magenta does not change the map's revision for you. A Brood War 1.04 map
  with EUD rows still opens in 1.16.1, where the rows do nothing.
- Remastered lets triggers write only some of the game's memory. Entries it will not let you
  write are offered as conditions only. A hand-made write to such an address shows as a
  problem.
- The mouse, the keyboard, the screen position and the local player are different on each
  player's computer. A trigger that reads them should only show text, play sounds or move
  the view. Anything else desyncs the game. For input that works in multiplayer, use the
  [build rows](#rows-that-need-a-build).
- **⋯ ▸ Run triggers every frame** adds a trigger at the end of the list that resets the
  trigger timer every cycle. The whole list then runs every frame instead of every two
  seconds, which key and mouse reads need. Every Wait and preserved trigger in the map also
  runs on that faster clock.
- Some entries write several records from one row, such as a unit type's speed (four fields)
  or a player's colour (two bytes). Other editors show the separate records. Speed and
  graphics appear once the editor's game data has loaded.
- An entry is marked `verified` once a test map has shown it working in Remastered. An
  unverified entry has a dashed EUD tag. The addresses come from Armoha's eud-book (see
  `ATTRIBUTION.md`).

A memory record the catalogue does not know still shows, as "memory at 0x…" with its numbers
as chips. Maps made with other tools open with their EUD triggers translated where the
catalogue knows them and left alone where it does not.

### Counters

Death counters are the map maker's variables. The game can only set them, add to them and
compare them with fixed numbers. Magenta adds steps that work between two counters. Each is
made of ordinary triggers that Magenta generates.

- Copy a counter into another, add a counter to another, or subtract a counter from another
  (actions). The trigger gets a private flag action, and a run of generated triggers follows
  it in the list, one per bit of the counter. A 16-bit run is half the size, for a counter
  that stays below 65,536. The run fires in the same cycle, right after the trigger. Triggers
  after the run see the result.
- Compare two counters (a condition): A is greater than, at least, equal to, less than or at
  most B. A run before the trigger works out the answer every cycle. A trigger can have one
  comparison.
- **⋯ ▸ Run this trigger for each player…** makes one copy of the trigger for each player you
  tick. In each copy, a player group you choose (Current Player by default) is replaced by
  that player. The original becomes a template and stops running.

The generated triggers are hidden in Magenta's list. The trigger they belong to shows +N
instead. In the Trigger Editor they are locked, with an **Open Magenta** button that brings
you back here. In the Text Trigger Editor they are fenced off as Magenta's. Change the step's
chips and Magenta rebuilds the run. Remove the row and the run goes with it. The runs use
Remastered's masked reads, so they only work in Remastered.

The copy and both comparisons were tested in Remastered on 2026-09-12.

### Rows that need a build

Some rows have no record in the game's trigger set. They need code built into the map, which
the TrigScript plugin does when you save. These rows have a BUILD tag, and their trigger shows
a BUILD badge in the list. In the map, each such row is one private counter cell that the
trigger sets or reads, so it stays an ordinary trigger in every editor.

Conditions:

- Chat. "The chat said `-heal`" fires in the cycle after a player sends exactly that
  message, for every player at once. "The chat said `-set` followed by a number" matches
  `-set 250` and puts 250 in a counter named *Chat number*. Patterns of your own (`^…$`)
  are not supported yet; the Build dialog reports them.
- Input. A player pressed a key, clicked the left, right or middle mouse button, or has the
  mouse over a location. The build sends every player's input to every computer, so this
  works in multiplayer, unlike the EUD reads. With Current Player as the player, one trigger
  serves everyone. Typing in chat does not count as key presses. The game reports no presses
  of F2 to F6.
- Unit checks. "Any Marine owned by Player 1 at Beacon has hit points below 20", checked
  every cycle. The check can also use:
  - shields, energy, kills, x, y, order, resources or weapon cooldown
  - hit points, shields or energy as a percentage of the maximum
  - unit type or owner
  - under attack, burrowed, targeting something, in a transport or moving (or not)
  - the remaining build time of a building

Actions:

- Text with values. "Show `Score: {Score} points` to everyone". Write `{Counter name}` for a
  counter's value, `{Player 1}` for a player's name, and `{Player 1's colour}` to switch to
  that player's colour.
- Counter maths. Set A to A times B, A divided by B, A modulo B, or a random number below N.
- For each unit. "For each Marine owned by Player 1 at Beacon: set hit points to 100". Any
  unit, any player and anywhere are allowed too. The verbs:
  - set hit points, shields, energy or kills
  - take or give hit points, shields or energy (a unit at 0 hit points dies)
  - kill, remove, make invincible or vulnerable, give to a player
  - center a location on it, for the trigger's other actions to use
  - order it to move, patrol or attack-move to a location
  - a spell effect for some seconds: stim, ensnare, plague, lockdown, stasis, maelstrom,
    irradiate or defensive matrix
  - hold fire (put it in a trigger that runs every frame)
  - hallucinate, or make real again; give the speed upgrade without research
  - set the resources of mineral fields and geysers, a building's remaining build time, or
    the rank shown on the unit's panel
- Pick one unit. "Take the Marine owned by Player 1 with the least hit points". The pick can
  be the least or greatest of a stat, the nearest to a location, a random unit, or the unit
  nearest a player's mouse within some pixels. You can then do any of the verbs above to it,
  center a location on it, and put the value (or the distance) in a counter. Each part is
  optional.
- Count. "Set A to the number of Marines owned by Player 1 at Beacon".
- Read. "Set A to the hit points of the first Marine owned by Player 1 at Beacon". Also
  shields, energy, kills, x, y, order, resources, weapon cooldown, and yes-or-no fields as 1
  or 0.
- Move a location. "Move Beacon to 640, 320 keeping its size" places it in map pixels (32 per
  tile), with an optional new width and height. "Move Beacon by 64, 0" shifts it from where it
  is. Rows that read a location use it where it is at that moment.

The Build dialog also has two map-wide options: a camera that glides after a location (with
an inertia and a max speed, like euddraft's cammove), and a sound looped as background music.
Rows and options that were euddraft code patches (walking through units, air units passing
through each other, lifting the sprite and image limits) cannot be built. The Build dialog
reports them.

#### Building

**Save** builds the code into the saved file, along with the map's own TrigScript script if
it has one. It takes under a second and downloads nothing. Test Map and exports build the
same way.

The **Build** button at the top of the panel shows how many triggers have build rows. It, and
**⋯ ▸ Build…**, open a dialog that lists anything that would fail, each with a **Show** link to
the trigger. It checks that:

- the row's locations still exist
- chat messages and rows are ones TrigScript supports
- the TrigScript plugin is installed and on

When TrigScript is on, it also compiles the rows against the map right away.

If the build fails during a save, the map is still saved without the code, and a notice says
why. Only StarCraft: Remastered plays a built map. Keep your source map, because the built
one is for players. If you open a built map in the editor, the rows behind its triggers are
gone into the code.

Magenta writes the code in the TrigScript language (`src/model/trigscript.ts`). Nothing you
type into a row runs as code.

#### Timing

- An action row takes effect after every trigger has had its turn in that cycle. A row below
  it in the same trigger still sees the map as it was. If a native row uses a location that a
  build row above it moved, Magenta warns you.
- Chat, input and unit checks are recorded at the end of a cycle. A message, key press or
  click fires once, in the next cycle. A check sees the units as they were at the end of the
  cycle before.
- A trigger that reads local input (the catalogue's keyboard and mouse reads) and changes the
  game for everyone gets a warning, because the game can go out of sync.
- A map with any build row runs its triggers every frame.

### With a mod

When **Help ▸ Game Data…** draws from a mod's data set, Magenta shows the mod's names in
sentences, pickers and the search box.

These follow the data set:

- The unit pickers list every unit type the mod has. Ids 228 to 232 are always None and the
  trigger classes (Any unit, Men, Buildings, Factories), so a mod's own types start at 233.
- A build row keeps a mod's unit as that unit: in its chip, in Magenta's file and in the code
  it hands to TrigScript. TrigScript 4.2.0 builds unit types up to 232 only, so such a row
  is not built yet; the Build dialog and the save's notice say so.
- The dry run counts a mod's units as units.

These are tied to the game's own memory layout, and stay as they are:

- The EUD catalogue's addresses are where StarCraft 1.16.1 and Remastered keep their tables,
  at the game's sizes: 228 unit types, 130 weapons, 61 upgrades and 44 technologies. Its
  pickers stop there. Build rows read units and players at the game's addresses too.
- A mod with plugins (GPTP, for example) can move or widen those tables. While a mod's data
  set is in use, a trigger with EUD or build rows says once that they read the game's own
  memory layout and are for the game's own data. The Build dialog says the same.
- Counters stay in the game's death table of 228 unit types for 12 players. **New counter…**
  takes cells of unit types the game never builds, such as the unused buildings and the
  beacons. A mod may make one of those a real unit, and its deaths then count into that
  cell. If yours does, name a counter on a cell you know the mod leaves alone.
- A Deaths or Set Deaths row with a mod's type past 232 is kept and shown, with a note that
  whether the game keeps that count is up to the mod. Magenta does not offer to name it as a
  counter, and never puts one there.

### What Magenta keeps with the map

Magenta stores folders, counter names, generated runs and build rows in one file in the map
archive, `magenta\magenta.json`. Every trigger is also in the map's trigger section (TRIG),
so the map plays without that file.

A build row's sentence is only in Magenta's file, though. Without the file, the trigger keeps
a bare counter action and the build has nothing to add for it. Names, folders and rebuilding
the runs are lost too.

Save keeps the file unless you untick it under Other files in the archive in the Save
dialog. If Magenta cannot read the file (it was written by a newer Magenta, or it is
damaged), it does not overwrite it. The panel says so, keeps the triggers read-only and
offers to drop the data and start over.

## Test maps

`maps/` has four small maps that test the EUD rows and counter steps in StarCraft: Remastered.
Play each as Use Map Settings. Each says on screen what to look for. All four were played on
2026-09-12. `npm run maps` writes them again; it needs a sibling `scm-js` checkout with its
jungle tileset extracted.

| Map | What it checks |
| --- | --- |
| `magenta-eud-1-units-dat.scx` | Whole-dword, word and masked-byte writes to unit and weapon data, and a player's minerals |
| `magenta-eud-2-bits-placed-units.scx` | Placed units by slot, one bit of a dword (vision), a technology byte, a read of a slot's unit type |
| `magenta-eud-3-reads.scx` | Triggers every frame; reads of the local player, the game speed, the mouse and a key |
| `magenta-aplus-counters.scx` | A counter comparison and copies: the generated runs, 153 triggers in all |

Seven probe maps (`magenta-probe-*.scx`) test the candidates in `docs/candidates.md`, one
key per candidate; each says on screen what to press and what to look for. `npx tsx
scripts/make-probe-maps.mts` writes them. Maps 6, 7, 11 and 12 have build rows, so opening one
in the editor and saving builds it. `--build` builds them here instead, through a
`plugin-trigscript` checkout beside this repository (or `TRIGSCRIPT_DIR`), and `--copy
<folder>` copies the built maps to where you play.

## For other plugins

- `magenta.open` (`{ index?: number }`) opens the panel on a trigger. The Trigger Editor's
  **Open Magenta** button on a generated row calls it.
- `magenta.describe` (a `TriggerRecord`) returns its conditions and actions as sentences,
  including the catalogue's.

## Development

```sh
npm install
npm test            # vitest: sentences, catalogue, lowering and recognition, counters, checks, the simulator
npm run typecheck
npm run build       # dist/plugin.js, the bundle the editor loads
```

`src/model/` holds the logic and the tests cover it: sentences and templates, the EUD
arithmetic and catalogue, counters, checks, the stored data, the generated runs and a small
simulator that tests them. `src/ui/` is the panel, plain DOM using the editor's widget
classes. `vendor/` is copied from the editor (the record layout, the definitions table, the
unit names) so the tests run without it. The editor is the source of truth.

To develop against a local editor, run `node scripts/serve.mjs . 3131` to serve this folder
with CORS. Then add `http://localhost:3131/` in **Plugins ▸ Manage Plugins…**. `npm run dev`
rebuilds the bundle as you edit.

## License

MIT. The catalogue's addresses are from eud-book, MIT; see `ATTRIBUTION.md`.
