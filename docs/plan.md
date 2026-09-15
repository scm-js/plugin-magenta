# Magenta — implementation plan

Magenta is a trigger editor plugin for scmJS built for map makers first: every trigger reads as a
sentence, nothing is modal, one search box adds anything, and the map is a picker. It carries a
catalogue of Remastered EUD conditions and actions that look and behave like the game's own,
lowered to plain TRIG records the editor already reads and writes. This plan covers the UX, the
plugin's design, and the steps to *Tier A+*: single-record EUD entries plus the few multi-trigger
expansions (copy, compare, per-player) that need no runtime payload.

Out of scope here: computed addresses (eudplib's self-modifying payload, "the unit at this
location"), a scripting language (TrigScript has one), and a text editor (TrigEdit is one).
Magenta writes only TRIG and one archive member of its own, so the Classic editor, TrigEdit, the
AI and Import / Export all keep working on the same records.

## 1. UX

### 1.1 Principles

1. **A trigger reads as a sentence.** "Give **1** **Beacon** owned by **Player 8** at **Beacon Left** to **Current Player**". Parameters are chips inside the sentence, never fields in a form.
2. **Nothing is modal.** Magenta is a panel beside the map, not a dialog over it, so the map stays clickable while a trigger is open. Chip popovers are small and anchored; Escape closes them.
3. **One box adds anything.** Typing on the "Add" row fuzzy-matches native conditions and actions, the EUD catalogue and templates in one list. Categories are a fallback, not the entry point.
4. **Point at the map.** A location chip has "Pick on map"; a unit chip picks a unit and takes its type; hovering a chip flashes the object and can glide the view to it.
5. **Names over numbers.** Death counters get names ("Score"), switches show their names, locations and strings show their text, addresses show their catalogue entry.
6. **Show problems where they are.** A trigger that never fires, a Wait in a preserved trigger, a read-only address, a missing string: each is a line under the row, as you type, not a report later.
7. **Keyboard equals mouse.** Tab moves between chips, Enter opens one, typing filters it, Delete removes a row, Alt+Up/Down moves it, Ctrl+D duplicates it, Ctrl+/ disables it.
8. **Nothing is trapped.** Selected triggers copy as TrigEdit text and text pastes back. An EUD entry is an ordinary record in the file; other tools see Set Deaths with a strange player, Magenta sees "Set Marine's max hit points to 80".

### 1.2 The screen

One floating, resizable panel (`api.ui.panel` with `resizable`), dockable to the right. Two panes:
the trigger list on the left, the open trigger on the right. The list collapses to a strip when the
panel is narrow.

```
┌ Magenta ──────────────────────────────────────────────────────────── ⋯  × ┐
│ Search triggers…            + New │ Give the beacon                        │
│ ▾ Setup (3)                       │ Players  [Player 1] [Player 2] [+]     │
│    Start resources        P1–P4   │                                        │
│    Run triggers every frame  EUD  │ Conditions                             │
│ ▾ Objectives (7)                  │  [Player 1] brings [at least] [1]      │
│  ▸ Give the beacon        P1, P2  │  [Marine] to [Beacon Left]             │
│    Win when captured      P1      │  [Score] is [at least] [10]            │
│ ▸ Bases (12)                      │  + Add a condition…                    │
│ ▸ TrigScript: main.ts   locked ⓘ  │                                        │
│                                   │ Actions                                │
│                                   │  Give [1] [Beacon] owned by [Player 8] │
│                                   │  at [Beacon Left] to [Current Player]  │
│                                   │  Set [Marine]'s max hit points to [80] │
│                                   │                              EUD  R/W  │
│                                   │  Preserve trigger                      │
│                                   │  + Add an action…                      │
│                                   │ ⚠ Wait inside a preserved trigger      │
└───────────────────────────────────────────────────────────────────────────┘
```

The ⋯ menu holds map-level things: run triggers every frame, import / export text, the
counters table, and the checks list.

### 1.3 The sentence row

Every condition and action type has a sentence template with one slot per argument, in the
argument order the editor's `triggers.defs` table already gives (`ArgDef { kind, field, label }`).
Magenta owns the templates for the 23 conditions, 60 actions and 10 briefing actions; the
catalogue owns its own.

Chip kinds follow `ArgKind`, each with one popover:

| Chip | Popover |
| --- | --- |
| player | The 27 groups, with the map's player names and colours; an "EPD address" field at the bottom for hand EUD work |
| unit | Units grouped by race, searchable, the map's renamed units first; "Pick on map" takes the picked unit's type |
| location | The map's locations by name; "Pick on map"; hover flashes the location (`view.flash`), a click on the name glides to it (`view.reveal`) |
| number | A field with the modifier (Set to / Add / Subtract) where the type has one; arrow keys step; units of measure from the catalogue (HP, seconds, minerals) |
| comparison | At least / At most / Exactly |
| switch | The 256 switches by name, rename inline (SWNM through `tx.switches`) |
| string | Multi-line text with the colour palette; existing strings searchable so the same slot is reused |
| wav | The sound slots with a play button |
| deaths cell | A named counter, or "deaths of [unit] for [player]"; "New counter…" allocates a free cell |
| the rest | Enumerations from `triggers.defs.choices(kind)`: score, resource, alliance, order, unit state, AI script, CUWP slot (with a link to the slot editor) |

### 1.4 Adding a row

The "Add a condition…" row is an input. The index it searches: the native definitions (label,
aliases like "hp", "kill", "give"), every catalogue entry (label, group, aliases), and templates
("countdown timer that ends the game", "give units at a beacon"). Ranking: prefix, then word match,
then recent. Enter inserts the row with StarEdit's defaults (`triggers.newCondition/newAction`) and
focuses the first chip. A "Browse" button shows the same index as a category tree for people who
do not know the name.

### 1.5 The list

- **Folders**, one level, drag to reorder and to move between folders. TRIG order is the folders
  flattened top to bottom, so order in the game is what the list shows.
- **Titles** are the trigger's Comment action, the SCMDraft convention, so titles survive every
  other tool. A trigger without one shows its summary line.
- **Search** over the sentences; filter by player, by folder, by "has EUD", by "has a problem".
- **Multi-select**, duplicate, disable (the record flag bit on every condition and action),
  delete, and "Duplicate for players…" which clones with the player chip substituted.
- **Claimed runs** from other plugins (TrigScript, and Magenta's own expansions) are shown locked
  with their badge and the plugin's "Open" button, as the Classic editor shows them.

### 1.6 EUD in the UX

An EUD entry looks like a native one with a small tag. Hovering the tag shows the address, width,
and whether Remastered allows reading and writing it. A catalogue entry the game will not accept
(write to a read-only region) is offered greyed with the reason, never hidden. The first EUD record
added to a map shows a one-time notice: this makes the map an EUD map, which only Remastered can
play, and the lobby marks it. "Run triggers every frame" is a map switch under ⋯ with the caveat
that every Wait and every preserved trigger in the map now runs on a frame clock.

### 1.7 Checks

Pure functions over a trigger, shown under the row and counted in the list:

- never fires (a Never condition, or a contradiction such as at least 5 and at most 3 of the same thing)
- Wait inside a preserved trigger; a Wait with every-frame triggers on
- no players own the trigger; no actions
- 16 conditions or 64 actions reached
- location Anywhere where the sentence expects a named one; a location that no longer exists
- a missing string, a WAV slot without its file
- an EUD address outside the Remastered allow-list, or a write to a read-only one
- a deaths cell that another plugin's claim reserves

## 2. Plugin design

### 2.1 Repository

Same shape as plugin-trigedit and plugin-trigscript: `plugin.json`, `plugin.ts`, `icon.svg`, an
esbuild bundle committed at `dist/plugin.js`, `@scm-js/plugin-api` as the one dev dependency, the
organisation's shared plugin CI, `main` and `v*` rulesets with a deploy key.

```
plugin.json  plugin.ts  icon.svg  README.md  docs/plan.md
src/
  model/       records → rows and back; selection; the plugin's own undo
  sentences/   the templates for native types
  catalogue/   eud.json (schema below), lookup by address, aliases
  lower/       row → TriggerRecord (Tier A), expansions → runs (Tier A+)
  recognize/   TriggerRecord → row, address → catalogue entry
  counters/    named cells, the allocator (scans what the map and other plugins use)
  checks/
  text/        copy / paste through api.triggers.text
  ui/          panel, list, sentence, chips, popovers, search
tests/         vitest over everything except ui/ (no DOM)
```

Enumerations (`ActionType`, `PlayerGroup`, …) come from `api.consts` at run time; the npm package
is types only, so a value imported from it is undefined.

### 2.2 Data flow

The map's TRIG is the only source of truth. Magenta derives its view model from it and writes back
through one path:

```
api.triggers.list() ──recognize──▶ rows (sentences, chips, folders, names)
        ▲                                        │ edit
        │                                        ▼
api.document.update(tx => tx.triggers.replace(i, record)) ◀──lower──
```

- `recognize` never fails: a record it cannot name renders as the raw type with number chips.
- Every edit lowers the one row it touched and replaces that one record. Expansions (Tier A+)
  replace their whole run.
- Triggers sit outside the editor's undo model, so Magenta keeps its own stack of record
  snapshots, and Ctrl+Z inside the panel walks it.
- The `"triggers"` and `"document"` events re-derive the rows when something else changes TRIG
  (TrigEdit, the Classic editor, the AI). Selection is kept by record hash, so the open trigger
  stays open when the list is edited around it.

### 2.3 The catalogue

One JSON file, one entry per condition or action, transcribed from Armoha's eud-book with the
Remastered read / write columns kept:

```json
{
  "id": "unit.maxHp",
  "kind": "action",
  "group": "Units",
  "sentence": "Set {unit}'s max hit points to {value}",
  "aliases": ["hp", "hit points", "health"],
  "address": { "base": "0x662350", "stride": 4, "index": "unit" },
  "width": 4,
  "scale": { "mul": 256, "label": "HP" },
  "remastered": { "read": true, "write": true },
  "source": "eud-book: units.dat hitpoints"
}
```

Lowering a Tier A entry:

- `address = base + index * stride`
- a whole dword: `player = (address − 0x58A364) / 4`, `unit = 0`, an ordinary Set Deaths / Deaths
- a byte or word: the dword it sits in as above, the bitmask in the record's location field, the
  value shifted into place, and the record's trailing mask word set to 0x4353, which is how the game
  tells a masked record from a plain one (Remastered only)
- the value scaled (`scale.mul`) so the user types 80 HP and the record holds 20480

Recognition is the inverse: a Deaths or Set Deaths record whose player is past the 27 groups is an
address; find the entry whose range contains it; check the mask for narrow fields; divide the
scale. An address no entry covers renders as "memory at 0x…" with number chips, so hand-made EUD
records from other tools still read.

The first catalogue, about forty entries, in this order: units.dat (max HP, shields, armor, build
time, mineral and gas cost, supply, sight, speed), weapons.dat (damage, bonus, cooldown, range),
player state (minerals, gas, upgrade level, tech researched, alliance, vision, colour), game
(speed, elapsed time, the trigger timer for every-frame), reads (mouse position, keyboard state,
screen position, local player, selected unit), and pre-placed units (HP, shields, energy, owner,
kills of unit N, which is a fixed address because pre-placed units are allocated in map order).

### 2.4 The sidecar

Folders, counter names and per-map settings are not in TRIG. They go in one archive member,
`magenta\magenta.json`, through `api.document.extras`, the same mechanism TrigScript uses for
its workspace. Triggers are referenced by index plus a content hash, re-attached by hash when
the index drifts. The map is a valid map without the member; only names and folders are lost,
never a trigger. The Save dialog's "leave plugin members out" option applies to it, and the
README says so.

### 2.5 Claims, counters, and living with other plugins

- Tier A entries are single ordinary records and are not claimed.
- Tier A+ expansions are runs: the first trigger carries a Comment marker with the expansion's
  id and a hash, `locate` finds the run by it, and `api.triggers.claim` locks the rows in the
  Classic editor and fences them in TrigEdit. Editing the expansion in Magenta regenerates the run.
- The counter allocator scans the map the way TrigScript's `reserve` does: every cell any record
  reads or writes, groups expanded to the slots they can mean, plus the cells other plugins'
  claimed runs touch. A new counter is the lowest free cell of an unused unit id.
- Magenta registers `magenta.open` (`{ index?: number }`) so the Classic editor's claim button,
  the AI, and TrigEdit can open a trigger in it.

### 2.6 Host side (scm-js)

Nothing blocks a start. Worth checking as the work reaches each point:

- whether the `"triggers"` event says who changed the list, so Magenta can skip re-deriving its own writes (otherwise the hash comparison handles it)
- a free hotkey for the panel (Ctrl+Shift+T is TrigEdit's)
- `api.i18n` for the plugin's strings, and the Korean catalogue
- the Save dialog's wording for a `magenta\` member (`extraKind`)

## 3. Steps to Tier A+

Each milestone ends with something a map maker can use, and a test that pins it. Sizes are relative
to the TrigEdit move (S) and the TrigScript rewrite (L).

| # | Milestone | Done when | Size |
| --- | --- | --- | --- |
| 0 | **Skeleton.** Repo, manifest, bundle, CI, rulesets; menu item, command, empty panel. | The plugin loads from the repo tag and opens a panel. | S |
| 1 | **Read-only sentences.** Templates for every native type; list with summaries; claimed runs shown locked; the readback line. | Every trigger of the fixture maps renders, and a snapshot test of the sentences passes. | M |
| 2 | **Editing native triggers.** Chips and popovers, the search row, own undo, write-through, event re-sync, disable, reorder, copy / paste as text. | A test edits every argument of every native type and the lowered record equals the expected one; a headless screenshot smoke passes. | L |
| 3 | **Map-aware pickers.** Pick on map for locations and units, hover flash, glide, the string chip with colours, switch names, CUWP link. | Picking a location from the panel fills the chip without closing anything. | M |
| 4 | **Organisation.** Folders, titles, search and filters, duplicate for players, the sidecar, the checks list. | A map saved with folders reopens with them; a check fires for each rule in §1.7 in tests. | M |
| 5 | **Tier A catalogue.** Schema, the first forty entries, lowering, recognition, the EUD tag and notice, the allow-list greying, every-frame switch. | For every entry, `lower(recognize(record))` is the identity; addresses cross-checked against eud-book; three sample maps play in Remastered (a manual step). | M |
| 6 | **Named counters.** The allocator, names in the sidecar, the deaths chip, the counters table under ⋯. | A named counter reads by name in every row that touches its cell, and a new counter never collides with a cell the map or TrigScript uses. | S |
| 7 | **Tier A+ expansions.** Copy counter A to B (binary countoff, one pass, temp restored), compare A with B, add A to B, "for each player"; marker, claim, regenerate on edit. | Each expansion verifies in a deaths-only simulator over random inputs; the runs lock in the Classic editor and fence in TrigEdit. | M |
| 8 | **Ship.** README as the map maker's guide with pictures, registry entry, Korean strings. | Listed in Browse Plugins; the guide's screenshots regenerate from a script. | S |

Milestones 0 to 2 are the product; 3 and 4 are what makes it pleasant; 5 to 7 are the EUD
promise. 5 can start after 2 and run beside 3 and 4, since it is model and tests, not UI.

### Verifying Tier A

The lowering is testable without the game. What the game does with an address is not: milestone 5
needs a Remastered install and three small maps (a units.dat write, a masked byte write, a read of
mouse position), played once by hand. eud-book's read / write columns are the reference until then,
and the catalogue records where each entry came from.

## Status (2026-09-12)

Milestones 0 to 7 are built, in this repository, with 35 tests over the model and a headless
run of the panel against a Blizzard map: the sentence editor with every chip kind, the search
row, folders, the sidecar, the checks, the 43-entry catalogue with lowering and recognition,
named counters, and the copy / add / subtract / compare / per-player expansions with their
claims. What milestone 8 still owes: the registry entry and the first tag, the guide pictures,
Korean strings (no plugin registers a catalogue yet), and the guide pictures. The four Remastered test maps were played on 2026-09-12: the
units.dat and weapon writes, a player's minerals, the placed-unit fields, the mouse, key and
local-player reads and the Tier A+ runs all worked; the game clock read did not (dropped) and
the game speed read is unconfirmed. Two findings shaped the catalogue: a unit's slot is 0 for
the first created unit and counts down from 1699 after it, and a User Selectable race makes the
game hand out melee units and drop the placed ones. The templates of §1.4 were left out; the search row's browse mode
covers the category tree.

**2026-09-15, 0.5.0:** the two readouts the roadmap called "explain / simulate". *In plain words*
(`src/model/explain.ts`) folds out under the open trigger: the shape in prose (owners, when,
then, once or preserved, the clock, the Waits) and the switches, counters, locations and timer
the trigger shares with the rest of the list, a generated run counted as its anchor. *Dry run*
(`src/model/simulate.ts`, `src/ui/simulate.ts`) is a second panel that runs the list from the
map's state — the old deaths-only test interpreter grown into a model of switches, counters
and EUD cells, the timer and clock, resources, scores, units as points in locations, alliances,
Waits and results — with a verdict per condition of the selected trigger, a "cannot tell" list
whose entries can be assumed true, a state that can be poked, and a log. What it cannot know
it reports rather than guesses.

What comes after Tier A+ and the build rows — the candidate conditions and actions the build
server makes possible, and the probe maps that decide which ship — is `candidates.md`
(2026-09-14).

## Tier B, as built (2026-09-12)

Not the payload of §3's Tier B but its shortcut: euddraft runs as its own service on Cloud
Run (scm-js/eud-server, moved out of ai-server on 2026-09-14), and Magenta rows that need it — chat commands,
text with counter values, counter maths, a pass over every unit of a kind — are data in
the sidecar that the box's Magenta plugin turns into eudplib code at build time. In the map
each is one private flag cell, so the trigger stays ordinary. ⋯ ▸ Build EUD map… sends the
map and saves the built one beside it.

## Decisions (2026-09-12)

- The panel opens with Ctrl+Shift+M (Ctrl+Shift+H, I, K, L, S, T, W and Z are taken).
- Magenta is not a default plugin for now; it is installed from the registry.
- The Classic trigger editor is left alone.
- eud-book is MIT, so the catalogue transcribes it with attribution in `ATTRIBUTION.md`.
- Tier B (computed addresses) stays out of this plan. Decide from what milestone 7's users ask for.
