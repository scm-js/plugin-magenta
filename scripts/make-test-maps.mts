/**
 * The four maps that check Magenta's EUD work in StarCraft: Remastered, written with the
 * editor's own map writer (a sibling scm-js checkout) and Magenta's lowering:
 *
 *   1  units.dat writes: whole dwords, words, and a byte at an odd address (masked).
 *   2  bits and placed units: one bit of a dword, the unit table by slot, a tech byte.
 *   3  reads: local player, mouse, keyboard, game speed and clock, with triggers every frame.
 *   4  counters: a copy between counters and a comparison, Tier A+ runs included.
 *
 * Each map says on screen what to look for. Play them as Use Map Settings in Remastered;
 * a map with EUD triggers is marked as such in the lobby.
 *
 *   npx tsx scripts/make-test-maps.mts [../scm-js]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { SetModifier, Comparison, ActionType, ConditionType, PlayerGroup, ActionFlag, SwitchAction, SwitchState, type TriggerRecord, type ActionRecord, type ConditionRecord } from "../vendor/triggers";
import { entry } from "../src/catalogue";
import { DEATHS_TABLE, addressOf, lowerAction, lowerCondition, recognizeAction, recognizeCondition } from "../src/model/eud";
import { flagAction } from "../src/model/expansions";
import { sync, type ExpansionRecord } from "../src/model/sync";
import { setOwners } from "../src/model/records";
import { encodeSidecar, MEMBER, type Sidecar } from "../src/model/sidecar";

const EDITOR = resolve(process.argv[2] ?? join(import.meta.dirname, "..", "..", "scm-js"));
const ed = (p: string) => import(join(EDITOR, "src", p));
const { createScenario } = await ed("formats/chk/create.ts");
const { serializeScenario, parseScenario } = await ed("formats/chk/scenario.ts");
const { saveMap, loadMap } = await ed("formats/mpq/scm.ts");
const { applyTriggers, newTrigger, newAction, newCondition } = await ed("editor/triggers.ts");
const { internString } = await ed("editor/settings.ts");
const { makeUnit } = await ed("editor/units.ts");
const { markDirty } = await ed("formats/chk/scenario.ts");
const { flatTerrain, baseTerrain } = await ed("formats/tileset/terrain.ts");
const { loadTileset } = await ed("formats/tileset/decode.ts");

const OUT = join(import.meta.dirname, "..", "maps");
mkdirSync(OUT, { recursive: true });

/* ── The jungle tileset, when the editor has it extracted ── */
const TILESET_DIR = join(EDITOR, "public", "tileset");
const jungle = existsSync(join(TILESET_DIR, "jungle.cv5"))
  ? loadTileset(Object.fromEntries(["cv5", "vf4", "vr4", "vx4", "wpe"].map((ext) => [ext, new Uint8Array(readFileSync(join(TILESET_DIR, `jungle.${ext}`)))])))
  : null;
if (!jungle) console.warn("no extracted jungle tileset in the editor: the maps get dirt ids without graphics-checked tiles");
const ERA_JUNGLE = 4;
const SIZE = 64;
const T = 32;

/* ── Records ── */
const MARINE = 0, GHOST = 1, FIREBAT = 32, ZEALOT = 65, START = 214, BEACON = 195;
const P1 = PlayerGroup.Player1, P2 = PlayerGroup.Player2;
const eud = (id: string, args: Record<string, number>, value: number, op = SetModifier.SetTo): ActionRecord => lowerAction({ entry: entry(id)!, args, value, op });
const eudIs = (id: string, args: Record<string, number>, value: number, op = Comparison.Exactly): ConditionRecord => lowerCondition({ entry: entry(id)!, args, value, op });
const always = (): ConditionRecord => newCondition(ConditionType.Always);
const preserve = (): ActionRecord => newAction(ActionType.PreserveTrigger);
const switchIs = (n: number, set: boolean): ConditionRecord => ({ ...newCondition(ConditionType.Switch), resource: n, comparison: set ? SwitchState.Set : SwitchState.Cleared });
const setSwitch = (n: number, set: boolean): ActionRecord => ({ ...newAction(ActionType.SetSwitch), target: n, modifier: set ? SwitchAction.Set : SwitchAction.Clear });

interface Map { name: string; file: string; build(scn: any, h: Helpers): Partial<Sidecar> | void }
interface Helpers {
  text(s: string): ActionRecord;
  comment(s: string): ActionRecord;
  trigger(owners: number[], conditions: ConditionRecord[], actions: ActionRecord[]): TriggerRecord;
  beacon: number;
  bringToBeacon(): ConditionRecord;
  intern(s: string): number;
}

function scaffold(name: string, description: string) {
  const terrain = baseTerrain(jungle, 2);
  const { tiles, isom } = flatTerrain(SIZE, SIZE, terrain, jungle, () => 0.5, ERA_JUNGLE);
  const scn = createScenario({ width: SIZE, height: SIZE, era: ERA_JUNGLE, name, description, tiles, isom });
  let serial = 1;
  const place = (unitId: number, owner: number, tx: number, ty: number) => { scn.units.push(makeUnit(null, unitId, owner, tx * T + 16, ty * T + 16, serial++)); };
  // The slot-order probe (map 2): four different units placed first, in this order, at one spot each.
  place(FIREBAT, 0, 14, 16);
  place(MARINE, 0, 14, 14);
  place(GHOST, 0, 15, 12);
  place(ZEALOT, 0, 15, 15);
  place(MARINE, 0, 12, 12); place(MARINE, 0, 13, 12); place(MARINE, 0, 12, 13);
  place(BEACON, 11, 20, 10); // neutral: units of an absent human player are removed at load
  place(START, 0, 10, 10);
  place(START, 1, 52, 52);
  markDirty(scn, "UNIT");
  // Player 2 is a computer, so a single-player custom game (which insists on a computer opponent) can start.
  scn.playerTypes[1] = 5;
  if (scn.editorPlayerTypes) scn.editorPlayerTypes[1] = 5;
  // Both players Terran. A "user selectable" race makes the game hand out melee starting
  // units in Use Map Settings, and the placed units are gone with it.
  scn.playerRaces[0] = 1;
  scn.playerRaces[1] = 1;
  markDirty(scn, "OWNR", "IOWN", "SIDE");
  // Location 1 (slot 0): the beacon's square. Written directly; the editor's addLocation only plans a change.
  scn.locations[0] = { left: 18 * T, top: 8 * T, right: 22 * T, bottom: 12 * T, nameIndex: internString(scn, "Beacon"), elevationFlags: 0 };
  markDirty(scn, "MRGN");
  const beacon = 1;
  const h: Helpers = {
    intern: (s) => internString(scn, s),
    text: (s) => ({ ...newAction(ActionType.DisplayText), text: internString(scn, s), flags: ActionFlag.AlwaysDisplay }),
    comment: (s) => ({ ...newAction(ActionType.Comment), text: internString(scn, s) }),
    trigger: (owners, conditions, actions) => setOwners({ ...newTrigger(), conditions, actions }, owners),
    beacon,
    bringToBeacon: () => ({ ...newCondition(ConditionType.Bring), player: PlayerGroup.CurrentPlayer, unitId: 228, location: beacon, comparison: Comparison.AtLeast, amount: 1 }),
  };
  return { scn, h };
}

const MAPS: Map[] = [
  {
    name: "Magenta EUD 1 — units.dat", file: "magenta-eud-1-units-dat.scx",
    build(scn, h) {
      applyTriggers(scn, [
        h.trigger([P1], [always()], [
          h.comment("units.dat writes at start"),
          eud("unit.maxHp", { unit: MARINE }, 500),
          eud("unit.maxShields", { unit: ZEALOT }, 250),
          eud("unit.armor", { unit: GHOST }, 7),
          eud("unit.mineralCost", { unit: GHOST }, 1),
          eud("player.minerals", { player: 0 }, 12345),
          h.text("EUD 1. Check: Marine max HP 500 (new marines; placed ones keep their HP). Zealot shields 250. Ghost armor 7. Ghost costs 1 mineral. You have 12345 minerals."),
          h.text("Move any unit onto the beacon to set the Gauss Rifle's damage to 99."),
        ]),
        h.trigger([P1], [h.bringToBeacon()], [
          h.comment("beacon: weapon damage"),
          eud("weapon.damage", { weapon: 0 }, 99),
          eud("weapon.cooldown", { weapon: 0 }, 4),
          h.text("Gauss Rifle: damage 99, cooldown 4 frames. Attack something with a marine."),
        ]),
      ]);
    },
  },
  {
    name: "Magenta EUD 2 — bits and placed units", file: "magenta-eud-2-bits-placed-units.scx",
    build(scn, h) {
      applyTriggers(scn, [
        h.trigger([P1], [always()], [
          h.comment("slot probe: slots 0-3 get 5, 10, 15, 20 HP; slot 0 invincible"),
          eud("cunit.hp", { index: 0 }, 5),
          eud("cunit.hp", { index: 1 }, 10),
          eud("cunit.hp", { index: 2 }, 15),
          eud("cunit.hp", { index: 3 }, 20),
          eud("cunit.invincible", { index: 0 }, 1),
          eud("player.techResearched", { player: 0, tech: 0 }, 1),
          eud("player.vision", { player: 0, other: 1 }, 1),
          h.text("EUD 2, slot probe. Placed in this order: Firebat, Marine (the lone one), Ghost, Zealot, then three Marines. Slots 0-3 got 5, 10, 15, 20 HP; slot 0 is invincible. Which unit has which HP?"),
          h.text("Stim Packs should be researched. Move any unit onto the beacon to write slot 0's owner byte to Player 2."),
        ]),
        h.trigger([P1], [h.bringToBeacon()], [
          h.comment("beacon: owner byte"),
          eud("cunit.owner", { index: 0 }, 1),
          h.text("Slot 0 now belongs to Player 2: it turns hostile but keeps its colour."),
        ]),
        h.trigger([P1], [eudIs("cunit.type", { index: 0 }, FIREBAT)], [h.comment("read: type of slot 0"), h.text("Read: slot 0 holds the Firebat.")]),
        h.trigger([P1], [eudIs("cunit.type", { index: 0 }, MARINE)], [h.comment("read: type of slot 0"), h.text("Read: slot 0 holds a Marine.")]),
        h.trigger([P1], [eudIs("cunit.type", { index: 0 }, GHOST)], [h.comment("read: type of slot 0"), h.text("Read: slot 0 holds the Ghost.")]),
        h.trigger([P1], [eudIs("cunit.type", { index: 0 }, ZEALOT)], [h.comment("read: type of slot 0"), h.text("Read: slot 0 holds the Zealot.")]),
      ]);
    },
  },
  {
    name: "Magenta EUD 3 — reads", file: "magenta-eud-3-reads.scx",
    build(scn, h) {
      const ALL = [PlayerGroup.AllPlayers];
      applyTriggers(scn, [
        h.trigger(ALL, [always()], [h.comment("start"), h.text("EUD 3. Triggers run every frame. Watch for: who you are, the mouse crossing the middle of the screen, the A key, the game speed, the clock at 10 s.")]),
        h.trigger(ALL, [eudIs("game.localPlayer", {}, 0)], [h.comment("read: local player"), h.text("Local player read: you are Player 1.")]),
        h.trigger(ALL, [eudIs("game.localPlayer", {}, 1)], [h.comment("read: local player"), h.text("Local player read: you are Player 2.")]),
        h.trigger(ALL, [eudIs("game.speed", {}, 6)], [h.comment("read: game speed"), h.text("Game speed reads Fastest.")]),
        h.trigger(ALL, [eudIs("game.speed", {}, 3)], [h.comment("read: game speed"), h.text("Game speed reads Normal.")]),
        h.trigger(ALL, [eudIs("game.elapsed", {}, 10, Comparison.AtLeast)], [h.comment("read: clock"), h.text("The game clock read 10 seconds.")]),
        h.trigger(ALL, [eudIs("game.mouseX", {}, 400, Comparison.AtLeast), switchIs(0, false)], [h.comment("read: mouse"), h.text("Mouse: right half of the screen."), setSwitch(0, true), preserve()]),
        h.trigger(ALL, [eudIs("game.mouseX", {}, 399, Comparison.AtMost), switchIs(0, true)], [h.comment("read: mouse"), h.text("Mouse: left half of the screen."), setSwitch(0, false), preserve()]),
        h.trigger(ALL, [eudIs("game.key", { key: 0x41 }, 1), switchIs(1, false)], [h.comment("read: key A"), h.text("The A key was pressed (state 1)."), setSwitch(1, true), preserve()]),
        h.trigger(ALL, [eudIs("game.key", { key: 0x41 }, 2), switchIs(1, false)], [h.comment("read: key A"), h.text("The A key is held (state 2)."), setSwitch(1, true), preserve()]),
        h.trigger(ALL, [eudIs("game.key", { key: 0x41 }, 0), switchIs(1, true)], [h.comment("read: key A"), h.text("The A key is up."), setSwitch(1, false), preserve()]),
        h.trigger(ALL, [always()], [h.comment("Magenta: run triggers every frame"), eud("game.triggerTimer", {}, 0), preserve()]),
      ]);
    },
  },
  {
    name: "Magenta A+ — counters", file: "magenta-aplus-counters.scx",
    build(scn, h) {
      const A: [number, number] = [0, 181], B: [number, number] = [1, 181], FLAG: [number, number] = [2, 181];
      const cmp: ExpansionRecord = { id: "cmp", kind: "compare", a: A, b: B, scratch: [[3, 181], [4, 181]], bits: 16, anchor: { i: 2, h: "" } };
      const cmp2: ExpansionRecord = { id: "cmp2", kind: "compare", a: A, b: B, scratch: [[5, 181], [6, 181]], bits: 16, anchor: { i: 4, h: "" } };
      const copy: ExpansionRecord = { id: "copy", kind: "copy", from: A, to: B, bits: 16, flag: FLAG };
      const deathsIs = (cell: [number, number], value: number): ConditionRecord => ({ ...newCondition(ConditionType.Deaths), player: cell[0], unitId: cell[1], comparison: Comparison.Exactly, amount: value });
      const setDeaths = (cell: [number, number], value: number): ActionRecord => ({ ...newAction(ActionType.SetDeaths), player: cell[0], unitId: cell[1], modifier: SetModifier.SetTo, target: value });
      const base: TriggerRecord[] = [
        h.trigger([P1], [always()], [h.comment("start: A := 1234"), setDeaths(A, 1234), h.text("A+ counters. A = 1234, B = 0. Expect 'A > B' first. Then move a unit onto the beacon to copy A into B; expect 'B = 1234' and 'A = B'.")]),
        h.trigger([P1], [h.bringToBeacon()], [h.comment("beacon: copy A into B"), flagAction({ cell: FLAG }), h.text("Copying A into B…")]),
        h.trigger([P1], [deathsIs([3, 181], 0)], [h.comment("placeholder for the comparison")]),
        h.trigger([P1], [deathsIs(B, 1234)], [h.comment("check: B = 1234"), h.text("Copy OK: B = 1234.")]),
        h.trigger([P1], [deathsIs([5, 181], 0)], [h.comment("placeholder for the second comparison")]),
      ];
      // The comparison anchors read the scratch cells: A > B is d >= 1; A == B is d == 0 and e == 0.
      base[2] = h.trigger([P1], [{ ...deathsIs(cmp.scratch[0], 1), comparison: Comparison.AtLeast }], [h.comment("check: A > B"), h.text("Compare OK: A > B (before the copy).")]);
      base[4] = h.trigger([P1], [deathsIs(cmp2.scratch[0], 0), deathsIs(cmp2.scratch[1], 0), deathsIs(B, 1234)], [h.comment("check: A = B"), h.text("Compare OK: A = B (after the copy).")]);
      const synced = sync(base, [cmp, cmp2, copy], (i) => scn.strings.strings[i] ?? null, (s) => h.intern(s));
      applyTriggers(scn, synced.list);
      console.log(`   counters: ${synced.list.length} triggers (${synced.runs.map((r) => `${r.id} ${r.count}`).join(", ")})`);
      // Magenta's member, so the map opens in the panel with its counters named and its runs claimed.
      return { counters: [{ player: A[0], unit: A[1], name: "A" }, { player: B[0], unit: B[1], name: "B" }], expansions: synced.expansions };
    },
  },
];

for (const m of MAPS) {
  const { scn, h } = scaffold(m.name, "A test map for the Magenta plugin's EUD and counter work. Play as Use Map Settings in StarCraft: Remastered.");
  const side = m.build(scn, h);
  const extras = new Map<string, Uint8Array>();
  if (side) extras.set(MEMBER, encodeSidecar({ version: 1, folders: [], counters: [], settings: {}, expansions: [], ...side }));
  // PKWARE is what StarEdit writes, so every StarCraft reads it.
  const bytes = await saveMap(serializeScenario(scn), { listfile: true, compress: "pkware", extras });
  const path = join(OUT, m.file);
  writeFileSync(path, bytes);
  // Self-check: the file loads back, and Magenta recognises what it wrote.
  const back = parseScenario((await loadMap(new Uint8Array(readFileSync(path)))).chk);
  // The counter runs read the deaths table itself through EUD players (bit tests of a cell); those are not catalogue rows.
  const inTable = (player: number) => addressOf(player) < DEATHS_TABLE + 228 * 48;
  let euds = 0;
  for (const t of back.triggers) {
    for (const c of t.conditions) if (c.type === ConditionType.Deaths && c.player >= 27 && !inTable(c.player)) { if (!recognizeCondition(c)) throw new Error(`${m.file}: an EUD condition did not recognise`); euds++; }
    for (const a of t.actions) if (a.type === ActionType.SetDeaths && a.player >= 27 && !inTable(a.player)) { if (!recognizeAction(a)) throw new Error(`${m.file}: an EUD action did not recognise`); euds++; }
  }
  console.log(`${m.file}: ${bytes.length} bytes, ${back.triggers.length} triggers, ${euds} EUD records recognised back`);
}
