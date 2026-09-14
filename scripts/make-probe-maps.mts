/**
 * The probe maps: one press of a key per candidate condition or action, so a play-through
 * in StarCraft: Remastered says which of the candidates in docs/candidates.md work. Each
 * map says on screen what to press and what to look for.
 *
 *   5  tables: fixed-address writes and reads that need no build — flingy speed, upgrade
 *      and tech costs, units.dat flags, the unit's name, player colour, supply, game speed,
 *      the frame counter, slot types.
 *   6  units: the per-unit verbs and reads of the build server's Magenta plugin (spec 3) —
 *      orders, spell timers, cooldown lock, resource amounts, cloak, no-clip, position,
 *      weakest / nearest, and the order / under-attack / target / burrowed / moving scans.
 *   7  input: held keys and the mouse through MSQC, chat commands with a number in them.
 *   8  the catalogue: every slice 3 entry lowered by the catalogue itself (speed as four
 *      records, colour as two, the name from a string, the looks through units.dat), the
 *      reads probe 5 left unreported (frame counter, clock, slot type and race), and the
 *      entries the first four maps never touched (sight and weapon range, cooldown, build
 *      time, gas, upgrade level, alliance, a placed unit's energy, shields, position and
 *      cloak, the screen).
 *   9  the rest: what 8 left unverified — size class by a vulture's shots, the flags with
 *      an effect (organic, mechanical) and the others read back, unit costs and supply,
 *      sight, weapon swaps, cooldown / factor / bonus / minimum range, vision both ways,
 *      alliance both ways, the hallucination flag, and the slot, race, supply-used, cloak,
 *      position and screen reads again.
 *
 *  10  presentation (slice 4): the terrain under a location rewritten in the MTXM array the
 *      game draws from, and a unit's look through its images' draw functions — the
 *      see-through of a cloaked unit, the blue of a hallucination, the warp flash.
 *
 * Maps 6, 7 and 10 need the build server (`--build http://localhost:8085`, the eud-server
 * container with the spec-4 plugin); their built copies end in `-eud.scx`, and those are
 * the ones to play. Maps 5, 8 and 9 play as written.
 *
 *   npx tsx scripts/make-probe-maps.mts [--build URL] [../scm-js]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { SetModifier, Comparison, ActionType, ConditionType, PlayerGroup, ActionFlag, SwitchAction, SwitchState, type TriggerRecord, type ActionRecord, type ConditionRecord } from "../vendor/triggers";
import { entry } from "../src/catalogue";
import type { Entry } from "../src/catalogue/types";
import { lookupOver, lowerAction, lowerActions, lowerCondition, setGameLookup } from "../src/model/eud";
import { setOwners } from "../src/model/records";
import { encodeSidecar, MEMBER, type Sidecar } from "../src/model/sidecar";
import type { BuildPlugins } from "../src/model/builds";

const argv = process.argv.slice(2);
const buildAt = argv.includes("--build") ? argv[argv.indexOf("--build") + 1] : null;
const EDITOR = resolve(argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--build") ?? join(import.meta.dirname, "..", "..", "scm-js"));
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
const { decodeUnitsDat } = await ed("formats/dat/dat.ts");

const OUT = join(import.meta.dirname, "..", "maps");
mkdirSync(OUT, { recursive: true });

const TILESET_DIR = join(EDITOR, "public", "tileset");
const jungle = existsSync(join(TILESET_DIR, "jungle.cv5"))
  ? loadTileset(Object.fromEntries(["cv5", "vf4", "vr4", "vx4", "wpe"].map((ext) => [ext, new Uint8Array(readFileSync(join(TILESET_DIR, `jungle.${ext}`)))])))
  : null;
if (!jungle) console.warn("no extracted jungle tileset in the editor: the maps get dirt ids without graphics-checked tiles");
const unitsDat = existsSync(join(EDITOR, "public", "arr", "units.dat")) ? decodeUnitsDat(new Uint8Array(readFileSync(join(EDITOR, "public", "arr", "units.dat")))) : null;
if (!unitsDat) console.warn("no extracted units.dat in the editor: the flingy probes use DatEdit's ids, and map 8 is skipped");
if (unitsDat) setGameLookup(lookupOver(unitsDat.flingy));
// flingy.dat raw: sprite u16×209, top speed u32×209 at 418, acceleration u16×209 at 1254, halt distance u32×209 at 1672, turn radius u8 at 2508, unused, movement control u8 at 2926.
const flingyBytes = existsSync(join(EDITOR, "public", "arr", "flingy.dat")) ? new Uint8Array(readFileSync(join(EDITOR, "public", "arr", "flingy.dat"))) : null;
const flingyView = flingyBytes ? new DataView(flingyBytes.buffer, flingyBytes.byteOffset, flingyBytes.byteLength) : null;
const fl = {
  topSpeed: (id: number) => (flingyView ? flingyView.getUint32(418 + id * 4, true) : 1),
  accel: (id: number) => (flingyView ? flingyView.getUint16(1254 + id * 2, true) : 1),
  halt: (id: number) => (flingyView ? flingyView.getUint32(1672 + id * 4, true) : 1),
  control: (id: number) => (flingyBytes ? flingyBytes[2926 + id] : 2),
};
const ERA_JUNGLE = 4;
const SIZE = 64;
const T = 32;

/* ── Ids ── */
const MARINE = 0, GHOST = 1, VULTURE = 2, SIEGE_TANK = 5, SCV = 7, MEDIC = 34, ZERGLING = 37, HYDRALISK = 38, OVERLORD = 42, ZEALOT = 65, COMMAND_CENTER = 106, SUPPLY_DEPOT = 109, BARRACKS = 111, ACADEMY = 112, ENGINEERING_BAY = 122, MINERAL_FIELD = 176, GEYSER = 188, BEACON_UNIT = 195, START = 214;
const P1 = PlayerGroup.Player1, P2 = PlayerGroup.Player2, ALL = PlayerGroup.AllPlayers, CP = PlayerGroup.CurrentPlayer;
const flingyOf = (unit: number, fallback: number) => (unitsDat ? unitsDat.flingy[unit] : fallback);
const KEY: Record<string, number> = { "0": 0x30, "1": 0x31, "2": 0x32, "3": 0x33, "4": 0x34, "5": 0x35, "6": 0x36, "7": 0x37, "8": 0x38, "9": 0x39, Q: 0x51, W: 0x57, E: 0x45, R: 0x52, T: 0x54, Y: 0x59, U: 0x55, I: 0x49, O: 0x4f, P: 0x50, H: 0x48, J: 0x4a, K: 0x4b, L: 0x4c, M: 0x4d, N: 0x4e };

/* ── Records ── */
/** A one-off entry for an address the catalogue does not have yet: the probe is the test of it. */
function probeEntry(id: string, base: number, width: 1 | 2 | 4 | "bit", bit?: number): Entry {
  return { id, kind: "both", group: "Probe", name: id, sentence: {}, args: [], address: { base }, width, bit, remastered: { read: true, write: true }, source: "eud-book offset table, probed" };
}
const write = (id: string, base: number, width: 1 | 2 | 4, value: number, op = SetModifier.SetTo): ActionRecord => lowerAction({ entry: probeEntry(id, base, width), args: {}, value, op });
const writeBit = (id: string, base: number, bit: number, on: boolean): ActionRecord => lowerAction({ entry: probeEntry(id, base, "bit", bit), args: {}, value: on ? 1 : 0, op: SetModifier.SetTo });
const readIs = (id: string, base: number, width: 1 | 2 | 4, value: number, op = Comparison.Exactly): ConditionRecord => lowerCondition({ entry: probeEntry(id, base, width), args: {}, value, op });
const eud = (id: string, args: Record<string, number>, value: number, op = SetModifier.SetTo): ActionRecord => lowerAction({ entry: entry(id)!, args, value, op });
/** Every record the entry writes: the parts of a grouped one (speed, colour) in order. */
const eudAll = (id: string, args: Record<string, number>, value: number): ActionRecord[] => lowerActions({ entry: entry(id)!, args, value, op: SetModifier.SetTo });
const eudIs = (id: string, args: Record<string, number>, value: number, op = Comparison.Exactly): ConditionRecord => lowerCondition({ entry: entry(id)!, args, value, op });
const keyPressed = (k: string): ConditionRecord => eudIs("game.key", { key: KEY[k] }, 1);
const always = (): ConditionRecord => newCondition(ConditionType.Always);
const preserve = (): ActionRecord => newAction(ActionType.PreserveTrigger);
const switchIs = (n: number, set: boolean): ConditionRecord => ({ ...newCondition(ConditionType.Switch), resource: n, comparison: set ? SwitchState.Set : SwitchState.Cleared });
const setSwitch = (n: number, set: boolean): ActionRecord => ({ ...newAction(ActionType.SetSwitch), target: n, modifier: set ? SwitchAction.Set : SwitchAction.Clear });
const deathsIs = (cell: [number, number], value: number, op = Comparison.Exactly): ConditionRecord => ({ ...newCondition(ConditionType.Deaths), player: cell[0], unitId: cell[1], comparison: op, amount: value });
const setDeaths = (cell: [number, number], value: number, op = SetModifier.SetTo): ActionRecord => ({ ...newAction(ActionType.SetDeaths), player: cell[0], unitId: cell[1], modifier: op, target: value });
const everyFrame = (): ActionRecord => eud("game.triggerTimer", {}, 0);
const createUnit = (unit: number, owner: number, location: number, count = 1): ActionRecord => ({ ...newAction(ActionType.CreateUnit), unitId: unit, player: owner, location, modifier: count });
const killAt = (unit: number, owner: number, location: number, count = 1): ActionRecord => ({ ...newAction(ActionType.KillUnitAt), unitId: unit, player: owner, location, modifier: count });
const healAt = (unit: number, owner: number, location: number): ActionRecord => ({ ...newAction(ActionType.ModifyHitPoints), unitId: unit, player: owner, location, modifier: 0, target: 100 });
const ping = (location: number): ActionRecord => ({ ...newAction(ActionType.MinimapPing), location });
const ANYWHERE = 64;
const orderAll = (unit: number, owner: number, to: number): ActionRecord => ({ ...newAction(ActionType.Order), unitId: unit, player: owner, location: ANYWHERE, target: to, modifier: 0 });
const addMinerals = (owner: number, amount: number): ActionRecord => ({ ...newAction(ActionType.SetResources), player: owner, unitId: 0, modifier: SetModifier.Add, target: amount });

/* ── Addresses probed (eud-book's offset table; the comments are its rows) ── */
const A = {
  flingyTopSpeed: 0x6c9ef8,    // dword × 209, "Speed × 320/3"
  flingyAccel: 0x6c9c78,       // word × 209
  flingyHalt: 0x6c9930,        // dword × 209, px × 256
  flingyControl: 0x6c9858,     // byte × 209: 0 flingy.dat control, 1 partially mobile, 2 iscript control
  upgMaxLevel: 0x655700,       // byte × 61
  upgMineralBase: 0x655740,    // word × 61
  upgGasBase: 0x655840,        // word × 61
  upgTimeBase: 0x655b80,       // word × 61, frames
  techMineral: 0x656248,       // word × 44
  techGas: 0x6561f0,           // word × 44
  techTime: 0x6563d8,          // word × 44, frames
  unitAdvancedFlags: 0x664080, // dword × 228
  unitMapString: 0x660260,     // word × 228, the map's string index names the unit
  unitSizeClass: 0x662180,     // byte × 228: 1 small 2 medium 3 large
  unitGraphics: 0x6644f8,      // byte × 228, flingy id ("Backed By Code")
  unitColor: 0x581d76,         // byte × 12 (the table says 8 × 12)
  minimapColor: 0x581dd6,      // byte × 12
  colorMapping: 0x57f21c,      // dword × 8
  terranSupplyAvail: 0x5821d4, // dword × 12, doubled
  terranSupplyMax: 0x582234,   // dword × 12, doubled
  gameSpeed: 0x6cdfd4,         // dword, 6 = fastest
  frames: 0x57f23c,            // dword, game ticks
  seconds: 0x58d6f8,           // dword, game seconds (the catalogue's dropped entry read 0x58D6F4)
  slotTypes: 0x57f1b4,         // byte × 12
  slotRaces: 0x57f1c0,         // byte × 12
  playerLeft: 0x581d62,        // byte × 8
};
const PERMANENT_CLOAK_BIT = 22, DETECTOR_BIT = 15;
const YELLOW = 135, PURPLE = 164;

interface Helpers {
  text(s: string): ActionRecord;
  comment(s: string): ActionRecord;
  trigger(owners: number[], conditions: ConditionRecord[], actions: ActionRecord[]): TriggerRecord;
  intern(s: string): number;
  /** Two-line text: the first one-shot on a switch, so a read that stays true does not flood the screen. */
  once(sw: number, conditions: ConditionRecord[], text: string, extra?: ActionRecord[]): TriggerRecord;
}

interface ProbeMap { name: string; file: string; place(place: (unit: number, owner: number, x: number, y: number) => void, scn: any): void; build(scn: any, h: Helpers): { sidecar?: Partial<Sidecar>; plugins?: BuildPlugins } | void }

function scaffold(m: ProbeMap, description: string) {
  const terrain = baseTerrain(jungle, 2);
  const { tiles, isom } = flatTerrain(SIZE, SIZE, terrain, jungle, () => 0.5, ERA_JUNGLE);
  const scn = createScenario({ width: SIZE, height: SIZE, era: ERA_JUNGLE, name: m.name, description, tiles, isom });
  let serial = 1;
  const place = (unitId: number, owner: number, x: number, y: number) => { scn.units.push(makeUnit(unitsDat, unitId, owner, Math.round(x * T), Math.round(y * T), serial++)); };
  m.place(place, scn);
  place(START, 0, 10.5, 10.5);
  place(START, 1, 52.5, 52.5);
  markDirty(scn, "UNIT");
  scn.playerTypes[1] = 5;
  if (scn.editorPlayerTypes) scn.editorPlayerTypes[1] = 5;
  scn.playerRaces[0] = 1;
  scn.playerRaces[1] = 1;
  markDirty(scn, "OWNR", "IOWN", "SIDE");
  const loc = (i: number, name: string, left: number, top: number, right: number, bottom: number) => { scn.locations[i] = { left: left * T, top: top * T, right: right * T, bottom: bottom * T, nameIndex: internString(scn, name), elevationFlags: 0 }; };
  // 1 Beacon, 2 Pen (the enemy's yard), 3 Mine (the resources), 4 Scratch (a point), 5 Pick (a point), 6 Home (the player's yard)
  loc(0, "Beacon", 18, 8, 22, 12);
  loc(1, "Pen", 34, 10, 44, 20);
  loc(2, "Mine", 6, 24, 16, 32);
  loc(3, "Scratch", 1, 1, 1.03125, 1.03125);
  loc(4, "Pick", 2, 1, 2.03125, 2.03125);
  loc(5, "Home", 8, 8, 20, 20);
  markDirty(scn, "MRGN");
  const h: Helpers = {
    intern: (s) => internString(scn, s),
    text: (s) => ({ ...newAction(ActionType.DisplayText), text: internString(scn, s), flags: ActionFlag.AlwaysDisplay }),
    comment: (s) => ({ ...newAction(ActionType.Comment), text: internString(scn, s) }),
    trigger: (owners, conditions, actions) => setOwners({ ...newTrigger(), conditions, actions }, owners),
    once: (sw, conditions, text, extra = []) => setOwners({ ...newTrigger(), conditions: [...conditions, switchIs(sw, false)], actions: [h.comment(text), h.text(text), setSwitch(sw, true), ...extra, preserve()] }, [P1]),
  };
  return { scn, h, loc };
}
const BEACON = 1, PEN = 2, MINE = 3, SCRATCH = 4, PICK = 5, HOME = 6;

/**
 * A key probe: pressing the key applies the actions once and says so; a second press applies them again.
 * The key read stayed 1 over several cycles in the first play-through (a fresh zergling per cycle), so an
 * edge switch guards it: set on the press, cleared when the key reads 0 again.
 */
let keySwitch = 40;
const resetKeySwitches = () => { keySwitch = 40; };
function onKey(h: Helpers, k: string, what: string, actions: ActionRecord[]): TriggerRecord[] {
  const sw = keySwitch++;
  return [
    h.trigger([P1], [keyPressed(k), switchIs(sw, false)], [h.comment(`${k}: ${what}`), setSwitch(sw, true), ...actions, h.text(`[${k}] ${what}`), preserve()]),
    h.trigger([P1], [eudIs("game.key", { key: KEY[k] }, 0), switchIs(sw, true)], [h.comment(`${k}: released`), setSwitch(sw, false), preserve()]),
  ];
}

const MAPS: ProbeMap[] = [
  /* ────────────────────────────────────────────────────────────────────────────── */
  {
    name: "Magenta probe 5 — tables", file: "magenta-probe-5-tables.scx",
    place(place) {
      for (let i = 0; i < 3; i++) place(MARINE, 0, 12.5 + i, 12.5);
      place(GHOST, 0, 12.5, 14.5);
      place(ZERGLING, 0, 15.5, 14.5); place(ZERGLING, 0, 16.5, 14.5);
      place(SCV, 0, 9.5, 27.5); place(SCV, 0, 10.5, 27.5);
      place(COMMAND_CENTER, 0, 12, 26.5);
      place(ENGINEERING_BAY, 0, 18, 26.5);
      place(ACADEMY, 0, 24, 26);
      place(BARRACKS, 0, 18, 31.5);
      place(SUPPLY_DEPOT, 0, 24, 31);
      place(MINERAL_FIELD, 11, 7, 25); place(MINERAL_FIELD, 11, 7, 26); place(MINERAL_FIELD, 11, 7, 27);
      place(GEYSER, 11, 8, 30.5);
      place(BEACON_UNIT, 11, 20, 10);
    },
    build(scn, h) {
      const zerglingFlingy = flingyOf(ZERGLING, 15), zealotFlingy = flingyOf(ZEALOT, 49), vultureFlingy = flingyOf(VULTURE, 38);
      const gunner = h.intern("Gunner");
      applyTriggers(scn, [
        h.trigger([P1], [always()], [
          h.comment("start"),
          h.text("Probe 5, tables. Keys: 1 zerglings crawl, K zerglings sprint, 2 upgrade + tech costs, 3 ghost permanent cloak, 4 marine detector, 5 marine renamed + large, 6 P1 colour byte, 7 P1 colour mapping, 8 supply 200, 9 game speed normal, 0 marine looks like a zealot."),
          h.text("Reads at start: the frame counter at 10 s, game seconds at 15 s, your slot's type and race, Player 3's slot type."),
        ]),
        // The zergling (like most ground units) is iscript-controlled: its walking speed comes from the animation,
        // and its flingy top speed is 1. So the probe switches the flingy to flingy.dat control and gives it a
        // vulture's numbers, doubled. Units copy the table when they are made, hence the new zergling.
        // The zergling (like most ground units) is iscript-controlled: its walking speed comes from the animation,
        // and its flingy top speed is 1. So the probe switches the flingy to flingy.dat control. A crawl is
        // unmistakable where "faster" was hard to judge, so key 1 crawls and key K sprints; both order the
        // zerglings across the map so there is something to watch.
        ...onKey(h, "1", `Zergling flingy: movement control 0 (was ${fl.control(zerglingFlingy)}), top speed 96 (a crawl), then a new zergling at the Beacon and every zergling ordered to the Pen. Expect: they crawl.`, [
          write("flingy.control", A.flingyControl + zerglingFlingy, 1, 0),
          write("flingy.topSpeed", A.flingyTopSpeed + zerglingFlingy * 4, 4, 96),
          write("flingy.acceleration", A.flingyAccel + zerglingFlingy * 2, 2, 8),
          write("flingy.halt", A.flingyHalt + zerglingFlingy * 4, 4, 300),
          setSwitch(30, true),
          createUnit(ZERGLING, P1, BEACON),
          orderAll(ZERGLING, P1, PEN),
        ]),
        ...onKey(h, "K", `Zergling flingy: top speed ${fl.topSpeed(vultureFlingy) * 2} (twice a vulture's), then every zergling ordered home. Expect: they sprint.`, [
          write("flingy.control", A.flingyControl + zerglingFlingy, 1, 0),
          write("flingy.topSpeed", A.flingyTopSpeed + zerglingFlingy * 4, 4, fl.topSpeed(vultureFlingy) * 2),
          write("flingy.acceleration", A.flingyAccel + zerglingFlingy * 2, 2, fl.accel(vultureFlingy)),
          write("flingy.halt", A.flingyHalt + zerglingFlingy * 4, 4, fl.halt(vultureFlingy)),
          orderAll(ZERGLING, P1, HOME),
        ]),
        h.once(16, [switchIs(30, true), readIs("flingy.topSpeed", A.flingyTopSpeed + zerglingFlingy * 4, 4, 96)], "Read back: the zergling flingy's top speed is 96 — the write took."),
        h.once(17, [switchIs(30, true), readIs("flingy.topSpeed", A.flingyTopSpeed + zerglingFlingy * 4, 4, fl.topSpeed(zerglingFlingy))], `Read back: the zergling flingy's top speed is still ${fl.topSpeed(zerglingFlingy)} — the write did not take.`),
        ...onKey(h, "2", "Infantry Armor (upgrade 0): max level 10, 1/1, 1 s. Stim Packs: 1/1, 1 s. Expect that at the Engineering Bay and Academy.", [
          write("upgrade.maxLevel", A.upgMaxLevel + 0, 1, 10),
          write("upgrade.mineralBase", A.upgMineralBase + 0 * 2, 2, 1),
          write("upgrade.gasBase", A.upgGasBase + 0 * 2, 2, 1),
          write("upgrade.timeBase", A.upgTimeBase + 0 * 2, 2, 24),
          write("tech.mineral", A.techMineral + 0 * 2, 2, 1),
          write("tech.gas", A.techGas + 0 * 2, 2, 1),
          write("tech.time", A.techTime + 0 * 2, 2, 24),
        ]),
        ...onKey(h, "3", "Ghost: permanent cloak flag, then an enemy Ghost appears in the Pen. Expect: it is cloaked and your marines cannot shoot it.", [
          writeBit("unit.permanentCloak", A.unitAdvancedFlags + GHOST * 4, PERMANENT_CLOAK_BIT, true),
          createUnit(GHOST, P2, PEN),
        ]),
        ...onKey(h, "4", "Marine: detector flag. Expect: the cloaked Ghost shows and can be shot.", [
          writeBit("unit.detector", A.unitAdvancedFlags + MARINE * 4, DETECTOR_BIT, true),
        ]),
        ...onKey(h, "5", "Marine: named 'Gunner' from the map's strings, size class Large. Expect: select a marine.", [
          write("unit.mapString", A.unitMapString + MARINE * 2, 2, gunner),
          write("unit.sizeClass", A.unitSizeClass + MARINE, 1, 3),
        ]),
        ...onKey(h, "6", "P1 colour byte (0x581D76) and minimap byte (0x581DD6) = yellow. Expect: your units turn yellow.", [
          write("player.colorByte", A.unitColor + 0, 1, YELLOW),
          write("player.minimapColor", A.minimapColor + 0, 1, YELLOW),
        ]),
        ...onKey(h, "7", "P1 colour mapping (0x57F21C) = 3. Expect: purple, if this table is the one that counts.", [
          write("player.colorMapping", A.colorMapping + 0 * 4, 4, 3),
        ]),
        ...onKey(h, "8", "P1 Terran supply: max and available 200. Expect: 200 cap in the top bar.", [
          write("player.supplyMax", A.terranSupplyMax + 0 * 4, 4, 400),
          write("player.supplyAvailable", A.terranSupplyAvail + 0 * 4, 4, 400),
        ]),
        ...onKey(h, "9", "Game speed = 3 (Normal). Expect: the game slows; the menu may show Normal.", [
          write("game.speedWrite", A.gameSpeed, 4, 3),
        ]),
        ...onKey(h, "0", "Marine graphics = the Zealot's flingy, then a new marine at the Beacon. Expect: it looks like a zealot, or nothing changes (Backed By Code).", [
          write("unit.graphics", A.unitGraphics + MARINE, 1, zealotFlingy),
          createUnit(MARINE, P1, BEACON),
        ]),
        h.once(10, [readIs("game.frames", A.frames, 4, 240, Comparison.AtLeast)], "Read: the frame counter (0x57F23C) passed 240 — 10 s at fastest."),
        h.once(11, [readIs("game.seconds", A.seconds, 4, 15, Comparison.AtLeast)], "Read: game seconds (0x58D6F8) passed 15."),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((v) => h.once(12, [readIs("player.slotType", A.slotTypes + 0, 1, v)], `Read: your slot's type byte (0x57F1B4) is ${v}.`)),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((v) => h.once(13, [readIs("player.slotType", A.slotTypes + 2, 1, v)], `Read: Player 3's slot type byte is ${v} (nobody is in that slot).`)),
        ...[0, 1, 2].map((v) => h.once(14, [readIs("player.slotRace", A.slotRaces + 0, 1, v)], `Read: your race byte (0x57F1C0) is ${v} (0 zerg, 1 terran, 2 protoss).`)),
        h.once(15, [readIs("player.left", A.playerLeft + 1, 1, 1, Comparison.AtLeast)], "Read: Player 2's left byte (0x581D62) is set."),
        h.trigger([P1], [always()], [h.comment("Magenta: run triggers every frame"), everyFrame(), preserve()]),
      ]);
    },
  },
  /* ────────────────────────────────────────────────────────────────────────────── */
  {
    name: "Magenta probe 6 — units", file: "magenta-probe-6-units.scx",
    place(place) {
      // The four marines first: slots 0, 1699, 1698, 1697, so the start trigger can give them 10, 20, 30, 40 HP.
      for (let i = 0; i < 4; i++) place(MARINE, 0, 12.5 + i, 12.5);
      place(ZERGLING, 0, 14.5, 16.5);
      for (let i = 0; i < 4; i++) place(ZERGLING, 1, 36.5 + i, 12.5);
      for (let i = 0; i < 2; i++) place(HYDRALISK, 1, 36.5 + i, 16.5);
      place(SIEGE_TANK, 1, 41.5, 16.5);
      place(MINERAL_FIELD, 11, 8, 26); place(MINERAL_FIELD, 11, 8, 27);
      place(GEYSER, 11, 12, 28.5);
      place(BEACON_UNIT, 11, 20, 10);
    },
    build(scn, h) {
      const cell = (u: number): [number, number] => [11, u];
      const F = { orderQ: cell(181), orderW: cell(182), timers: cell(183), cooldown: cell(184), resources: cell(185), cloakOn: cell(186), cloakOff: cell(187), noclip: cell(188), nudge: cell(189), pickWeak: cell(190), pickNear: cell(191), readOrder: cell(192), readRes: cell(193), tell: cell(194), tellWeak: cell(195), speed: cell(196), sprint: cell(197), readStim: cell(198), tellStim: cell(199), pickKill: cell(210), tellKill: cell(211) };
      const V = { weakest: cell(200), stim: cell(209), killed: cell(212), order: cell(201), resources: cell(202), attacking: cell(203), underAttack: cell(204), hasTarget: cell(205), burrowed: cell(206), moving: cell(207), cycle: cell(208) };
      const flag = (c: [number, number]) => setDeaths(c, 1);
      const P2ZERGLING = { unit: ZERGLING, owner: 1, location: null }, P2HYDRA = { unit: HYDRALISK, owner: 1, location: null }, P2TANK = { unit: SIEGE_TANK, owner: 1, location: null }, P1MARINE = { unit: MARINE, owner: 0, location: null };
      const hooks = [
        { id: "q", kind: "foreach", flag: F.orderQ, ...P2ZERGLING, do: { order: "move", location: BEACON, scratch: SCRATCH } },
        { id: "w", kind: "foreach", flag: F.orderW, ...P2HYDRA, do: { orderRaw: 6, location: BEACON } },
        { id: "e1", kind: "foreach", flag: F.timers, ...P1MARINE, do: { timer: "stim", value: 240 } },
        { id: "e2", kind: "foreach", flag: F.timers, ...P2ZERGLING, do: { timer: "plague", value: 250 } },
        { id: "e3", kind: "foreach", flag: F.timers, ...P2HYDRA, do: { timer: "ensnare", value: 250 } },
        { id: "e4", kind: "foreach", flag: F.timers, ...P2TANK, do: { timer: "lockdown", value: 400 } },
        { id: "e5", kind: "foreach", flag: F.timers, unit: ZERGLING, owner: 0, location: null, do: { timer: "matrix", value: 250 } },
        { id: "e6", kind: "read", flag: F.readStim, ...P1MARINE, field: "stim", to: V.stim },
        { id: "e7", kind: "text", flag: F.tellStim, parts: [{ text: "Read back: the first marine's stim timer is " }, { counter: V.stim }, { text: " (0 means the timer write did not take)." }], to: "all" },
        { id: "r", kind: "foreach", flag: F.cooldown, ...P1MARINE, do: { cooldown: 250 } },
        { id: "j0", kind: "foreach", flag: F.speed, ...P1MARINE, do: { set: "movementType", value: 0 } },
        { id: "j1", kind: "foreach", flag: F.speed, ...P1MARINE, do: { set: "topSpeed", value: 96 } },
        { id: "j2", kind: "foreach", flag: F.speed, ...P1MARINE, do: { set: "acceleration", value: 8 } },
        { id: "k0", kind: "foreach", flag: F.sprint, ...P1MARINE, do: { set: "movementType", value: 0 } },
        { id: "k1", kind: "foreach", flag: F.sprint, ...P1MARINE, do: { set: "topSpeed", value: fl.topSpeed(flingyOf(VULTURE, 38)) * 2 } },
        { id: "k2", kind: "foreach", flag: F.sprint, ...P1MARINE, do: { set: "acceleration", value: fl.accel(flingyOf(VULTURE, 38)) } },
        { id: "t1", kind: "foreach", flag: F.resources, unit: MINERAL_FIELD, owner: null, location: MINE, do: { set: "resources", value: 5000 } },
        { id: "t2", kind: "foreach", flag: F.resources, unit: GEYSER, owner: null, location: MINE, do: { set: "resources", value: 1 } },
        { id: "y", kind: "foreach", flag: F.cloakOn, ...P1MARINE, do: { status: "cloak", on: true } },
        { id: "h", kind: "foreach", flag: F.cloakOff, ...P1MARINE, do: { status: "cloak", on: false } },
        { id: "u", kind: "foreach", flag: F.noclip, ...P1MARINE, do: { status: "noclip", on: true } },
        { id: "l", kind: "pick", flag: F.pickKill, ...P1MARINE, by: "min", field: "hp", near: null, locate: null, to: V.killed, do: { kill: true } },
        { id: "tellKill", kind: "text", flag: F.tellKill, parts: [{ text: "[L] The pick killed the weakest marine itself; it had " }, { counter: V.killed }, { text: " HP." }], to: "all" },
        { id: "o", kind: "pick", flag: F.pickWeak, ...P1MARINE, by: "min", field: "hp", near: null, locate: PICK, to: V.weakest },
        { id: "p", kind: "pick", flag: F.pickNear, ...P1MARINE, by: "nearest", field: "hp", near: BEACON, locate: PICK, to: null },
        { id: "ro", kind: "read", flag: F.readOrder, ...P2ZERGLING, field: "order", to: V.order },
        { id: "rr", kind: "read", flag: F.readRes, unit: MINERAL_FIELD, owner: null, location: MINE, field: "resources", to: V.resources },
        { id: "tell", kind: "text", flag: F.tell, parts: [{ text: "Read: first zergling's order id = " }, { counter: V.order }, { text: ", first mineral field = " }, { counter: V.resources }], to: "all" },
        { id: "tellWeak", kind: "text", flag: F.tellWeak, parts: [{ text: "[O] Killed the weakest marine; it had " }, { counter: V.weakest }, { text: " HP." }], to: "all" },
      ];
      const scans = [
        { id: "s1", kind: "scan", cell: V.attacking, ...P2ZERGLING, field: "order", cmp: "=", value: 10 },
        { id: "s2", kind: "scan", cell: V.underAttack, ...P1MARINE, field: "underAttack", cmp: ">", value: 0 },
        { id: "s3", kind: "scan", cell: V.hasTarget, ...P1MARINE, field: "hasTarget", cmp: "=", value: 1 },
        { id: "s4", kind: "scan", cell: V.burrowed, unit: ZERGLING, owner: 0, location: null, field: "burrowed", cmp: "=", value: 1 },
        { id: "s5", kind: "scan", cell: V.moving, ...P1MARINE, field: "speed", cmp: ">", value: 0 },
      ];
      applyTriggers(scn, [
        h.trigger([P1], [always()], [
          h.comment("start: marines 10/20/30/40 HP, burrow researched"),
          eud("cunit.hp", { index: 0 }, 10), eud("cunit.hp", { index: 1699 }, 20), eud("cunit.hp", { index: 1698 }, 30), eud("cunit.hp", { index: 1697 }, 40),
          eud("player.techResearched", { player: 0, tech: 11 }, 1),
          h.text("Probe 6, units. Q order zerglings to the beacon (game order), W hydralisks (raw order), E spell timers, R toggle cooldown lock, T resources 5000 / 1 at the Mine, J marines crawl, K marines sprint, Y cloak flags, H off, U no-clip, O kill the weakest marine by location, L kill it inside the pick, P heal the marine nearest the beacon."),
          h.text("Marines have 10, 20, 30, 40 HP. Your zergling can burrow. Scans announce: a zergling attacking, a marine under attack, a marine with a target, your zergling burrowed, a marine moving. Every 2 s a line reads the first zergling's order id and the first mineral field."),
        ]),
        ...onKey(h, "Q", "every enemy zergling: the game's Order to the Beacon. Expect: they walk there.", [flag(F.orderQ)]),
        ...onKey(h, "W", "every enemy hydralisk: order id 6 (Move) written in, target the Beacon. Expect: they walk there, or ignore it.", [flag(F.orderW)]),
        ...onKey(h, "E", "timers: marines stim 240, enemy zerglings plague 250 (watch their HP fall), hydralisks ensnare, the tank lockdown 400 while it is ordered to the Beacon (it should not move), your zergling a defensive matrix. A read-back line follows.", [flag(F.timers), orderAll(SIEGE_TANK, P2, BEACON), setSwitch(4, true)]),
        h.trigger([P1], [switchIs(4, true)], [h.comment("next cycle: read the stim timer back"), setSwitch(4, false), flag(F.readStim), flag(F.tellStim), preserve()]),
        h.trigger([P1], [keyPressed("R"), switchIs(39, false), switchIs(1, false)], [h.comment("R: cooldown lock on"), setSwitch(39, true), setSwitch(1, true), h.text("[R] cooldown lock ON: marines' cooldowns are held at 250 every cycle. Expect: they cannot shoot."), preserve()]),
        h.trigger([P1], [keyPressed("R"), switchIs(39, false), switchIs(1, true)], [h.comment("R: cooldown lock off"), setSwitch(39, true), setSwitch(1, false), h.text("[R] cooldown lock OFF."), preserve()]),
        h.trigger([P1], [eudIs("game.key", { key: KEY.R }, 0), switchIs(39, true)], [h.comment("R: released"), setSwitch(39, false), preserve()]),
        h.trigger([P1], [switchIs(1, true)], [h.comment("while locked: flag every cycle"), flag(F.cooldown), preserve()]),
        ...onKey(h, "T", "mineral fields at the Mine (pinged, south-west) 5000, the geyser 1. Expect: click them.", [flag(F.resources), ping(MINE)]),
        ...onKey(h, "J", "marines: their own movement control 0 and top speed 96 (the unit's copy of the flingy table), then ordered to the Mine. Expect: these marines crawl.", [flag(F.speed), orderAll(MARINE, P1, MINE)]),
        ...onKey(h, "K", "marines: top speed twice a vulture's, then ordered home. Expect: they sprint.", [flag(F.sprint), orderAll(MARINE, P1, HOME)]),
        ...onKey(h, "Y", "marines: cloak flags on (0x300). Expect: they shimmer.", [flag(F.cloakOn)]),
        ...onKey(h, "H", "marines: cloak flags off.", [flag(F.cloakOff)]),
        ...onKey(h, "U", "marines: no-clip. Expect: they walk through each other.", [flag(F.noclip)]),
        ...onKey(h, "L", "pick the weakest marine and kill it inside the pick (no location, no vanilla action). Expect: the weakest marine dies and its HP is printed.", [flag(F.pickKill), setSwitch(5, true)]),
        h.trigger([P1], [switchIs(5, true)], [h.comment("next cycle: say what L killed"), setSwitch(5, false), flag(F.tellKill), preserve()]),
        h.trigger([P1], [keyPressed("O")], [h.comment("O: pick the weakest marine"), flag(F.pickWeak), setSwitch(2, true), preserve()]),
        h.trigger([P1], [switchIs(2, true)], [h.comment("next cycle: kill at Pick, say the HP"), setSwitch(2, false), killAt(MARINE, P1, PICK), flag(F.tellWeak), preserve()]),
        h.trigger([P1], [keyPressed("P")], [h.comment("P: pick the marine nearest the Beacon"), flag(F.pickNear), setSwitch(3, true), preserve()]),
        h.trigger([P1], [switchIs(3, true)], [h.comment("next cycle: heal at Pick, ping it"), setSwitch(3, false), healAt(MARINE, P1, PICK), ping(PICK), h.text("[P] The marine nearest the Beacon is healed and pinged."), preserve()]),
        h.once(10, [deathsIs(V.attacking, 1)], "Scan: an enemy zergling's order is 10 (attacking a unit)."),
        h.once(11, [deathsIs(V.underAttack, 1, Comparison.AtLeast)], "Scan: a marine is under attack."),
        h.once(12, [deathsIs(V.hasTarget, 1)], "Scan: a marine has an order target."),
        h.once(13, [deathsIs(V.burrowed, 1)], "Scan: your zergling is burrowed."),
        h.once(14, [deathsIs(V.moving, 1)], "Scan: a marine is moving (speed > 0)."),
        h.trigger([P1], [always()], [h.comment("cycle counter"), setDeaths(V.cycle, 1, SetModifier.Add), preserve()]),
        h.trigger([P1], [deathsIs(V.cycle, 48, Comparison.AtLeast)], [h.comment("every 2 s: read and tell"), setDeaths(V.cycle, 0), flag(F.readOrder), flag(F.readRes), flag(F.tell), preserve()]),
        h.trigger([P1], [always()], [h.comment("Magenta: run triggers every frame"), everyFrame(), preserve()]),
      ]);
      const spec = { version: 3, everyFrame: true, chat: null, hooks, scans, msqc: null };
      return { plugins: { magenta: { spec: JSON.stringify(spec) }, eudTurbo: {} } };
    },
  },
  /* ────────────────────────────────────────────────────────────────────────────── */
  {
    name: "Magenta probe 7 — input", file: "magenta-probe-7-input.scx",
    place(place) {
      place(MARINE, 0, 12.5, 12.5);
      place(BEACON_UNIT, 11, 20, 10);
    },
    build(scn, h) {
      const CHAT: [number, number] = [11, 181], PATTERN: [number, number] = [11, 183], PTR: [number, number] = [11, 184], LEN: [number, number] = [11, 185], NUMBER: [number, number] = [11, 186], TELL: [number, number] = [11, 187], TELL_HELD: [number, number] = [11, 188], CYCLE: [number, number] = [11, 189], LATCH: [number, number] = [11, 196], DOWNS: [number, number] = [11, 197], TICK: [number, number] = [11, 198];
      const addr = (c: [number, number]) => `0x${(0x58a364 + c[0] * 4 + c[1] * 48).toString(16).toUpperCase()}`;
      const W_DOWN = 190, W_UP = 191, W_HELD = 192, D_PRESS = 193, CLICK = 194, OVER_BEACON = 195;
      applyTriggers(scn, [
        h.trigger([ALL], [always()], [
          h.comment("start"),
          h.text("Probe 7, input (play as Player 1). Hold W: 'W down' once, minerals climb while held, 'W up' on release; a status line every second counts the down events. Press D: 'D pressed'. Left-click: 'click'. Mouse over the beacon: 'over the beacon'. Chat: -give (100 minerals), -set 250 (the number is read back)."),
        ]),
        h.trigger([P1], [deathsIs([0, W_HELD], 1, Comparison.AtLeast), deathsIs(LATCH, 0)], [h.comment("W down (latched in a counter, not a switch)"), h.text("W down: the held state is on."), setDeaths(LATCH, 1), preserve()]),
        h.trigger([P1], [deathsIs([0, W_HELD], 0), deathsIs(LATCH, 1)], [h.comment("W up"), h.text("W up: the held state is off."), setDeaths(LATCH, 0), preserve()]),
        h.trigger([P1], [deathsIs([0, W_DOWN], 1, Comparison.AtLeast)], [h.comment("count every down event that arrives"), setDeaths(DOWNS, 1, SetModifier.Add), preserve()]),
        h.trigger([P1], [always()], [h.comment("status line every second"), setDeaths(TICK, 1, SetModifier.Add), preserve()]),
        h.trigger([P1], [deathsIs(TICK, 24, Comparison.AtLeast)], [h.comment("status"), setDeaths(TICK, 0), setDeaths(TELL_HELD, 1), preserve()]),
        h.trigger([ALL], [deathsIs([CP, W_HELD], 1, Comparison.AtLeast)], [h.comment("while W is held: +1 mineral a cycle"), addMinerals(CP, 1), preserve()]),
        h.trigger([ALL], [deathsIs([CP, D_PRESS], 1, Comparison.AtLeast)], [h.comment("D pressed"), h.text("D pressed (synced through MSQC)."), preserve()]),
        h.trigger([ALL], [deathsIs([CP, CLICK], 1, Comparison.AtLeast)], [h.comment("left click"), h.text("Left click."), preserve()]),
        h.trigger([ALL], [deathsIs([CP, OVER_BEACON], 1), switchIs(2, false)], [h.comment("mouse over the beacon"), h.text("Mouse over the beacon."), setSwitch(2, true), preserve()]),
        h.trigger([ALL], [deathsIs([CP, OVER_BEACON], 0), switchIs(2, true)], [h.comment("mouse off the beacon"), h.text("Mouse off the beacon."), setSwitch(2, false), preserve()]),
        h.trigger([ALL], [deathsIs(CHAT, 2)], [h.comment("chat -give"), addMinerals(CP, 100), h.text("-give: 100 minerals."), preserve()]),
        h.trigger([ALL], [deathsIs(PATTERN, 3)], [h.comment("chat -set N: read the number back"), setDeaths(TELL, 1), preserve()]),

        h.trigger([ALL], [always()], [h.comment("Magenta: run triggers every frame"), everyFrame(), preserve()]),
      ]);
      const spec = {
        version: 3, everyFrame: true,
        chat: { cell: CHAT, args: { ptr: PTR, len: LEN, pattern: PATTERN, number: NUMBER } },
        hooks: [
          { id: "tell", kind: "text", flag: TELL, parts: [{ text: "-set: the number in the message is " }, { counter: NUMBER }], to: "all" },
          { id: "tellHeld", kind: "text", flag: TELL_HELD, parts: [{ text: "Status: W downs so far = " }, { counter: DOWNS }, { text: ", held state = " }, { counter: [0, W_HELD] }, { text: ", latch = " }, { counter: LATCH }], to: "all" },
        ],
        scans: [],
        msqc: { clear: [W_DOWN, W_UP, D_PRESS, CLICK], held: [{ down: W_DOWN, up: W_UP, state: W_HELD }], mouseBase: 50, mouseIn: [{ location: BEACON, unit: OVER_BEACON }], select: null },
      };
      const plugins: BuildPlugins = {
        chatEvent: { __addr__: addr(CHAT), __patternAddr__: addr(PATTERN), __ptrAddr__: addr(PTR), __lenAddr__: addr(LEN), "-give": 2, "^-set .*.*$": 3 },
        MSQC: { QCUnit: 58, QCLoc: 62, QCPlayer: 11, QCDebug: "false", "KeyDown(W); NotTyping": `${W_DOWN}, 1`, "KeyUp(W)": `${W_UP}, 1`, "KeyPress(D); NotTyping": `${D_PRESS}, 1`, "MouseDown(L)": `${CLICK}, 1`, Mouse: 50 },
        magenta: { spec: JSON.stringify(spec) },
        eudTurbo: {},
      };
      return { plugins };
    },
  },
  /* ────────────────────────────────────────────────────────────────────────────── */
  {
    name: "Magenta probe 8 — catalogue", file: "magenta-probe-8-catalogue.scx",
    place(place) {
      // Slots: the first placed unit is 0, later ones count down from 1699 — the Ghost is slot 0, the Zealot 1699, the marines 1698 to 1695.
      place(GHOST, 0, 12.5, 14.5);
      place(ZEALOT, 0, 14.5, 16.5);
      for (let i = 0; i < 4; i++) place(MARINE, 0, 12.5 + i, 12.5);
      place(ZERGLING, 0, 15.5, 14.5); place(ZERGLING, 0, 16.5, 14.5);
      place(SCV, 0, 9.5, 27.5); place(SCV, 0, 10.5, 27.5);
      place(COMMAND_CENTER, 0, 12, 26.5);
      place(ENGINEERING_BAY, 0, 18, 26.5);
      place(ACADEMY, 0, 24, 26);
      place(BARRACKS, 0, 18, 31.5);
      place(SUPPLY_DEPOT, 0, 24, 31);
      place(SIEGE_TANK, 1, 38.5, 14.5); place(SIEGE_TANK, 1, 41.5, 14.5);
      place(MINERAL_FIELD, 11, 7, 25); place(MINERAL_FIELD, 11, 7, 26); place(MINERAL_FIELD, 11, 7, 27);
      place(GEYSER, 11, 8, 30.5);
      place(BEACON_UNIT, 11, 20, 10);
    },
    build(scn, h) {
      if (!unitsDat) { console.warn("map 8 needs units.dat for the speed and looks entries; skipped"); return; }
      const GHOST_SLOT = 0, ZEALOT_SLOT = 1699, MARINE_SLOTS = [1698, 1697, 1696, 1695];
      const INFANTRY_ARMOR = 0, INFANTRY_WEAPONS = 7, STIM_PACKS = 0, LOCKDOWN = 1, PERSONNEL_CLOAKING = 10, GAUSS_RIFLE = 0;
      const gunner = h.intern("Gunner");
      const TERRAN = 1, YELLOW_CHOICE = 135, LARGE = 3;
      const zerglingFlingy = flingyOf(ZERGLING, 15);
      applyTriggers(scn, [
        h.trigger([P1], [always()], [
          h.comment("start: marines at 10 HP, lockdown and personnel cloaking researched"),
          ...MARINE_SLOTS.map((s) => eud("cunit.hp", { index: s }, 10)),
          eud("player.techResearched", { player: 0, tech: LOCKDOWN }, 1),
          eud("player.techResearched", { player: 0, tech: PERSONNEL_CLOAKING }, 1),
          h.text("Probe 8, the catalogue. Keys: 1 zerglings crawl, K zerglings sprint, 2 upgrade + tech costs (lockdown 10 energy), 3 marine named Gunner + large, 4 marines regenerate + an invincible enemy zergling, 5 your colour yellow, 6 supply 200, 7 marines look like zealots, 8 marine stats, 9 gas + weapons 3 + ally, 0 ghost energy + zealot shields."),
          h.text("Reads: the frame counter at 10 s, the clock at 15 s, your slot and race, Player 3's slot. Cloak your ghost (C), walk it east and south past the middle, scroll the screen right and down, and a line says what was read."),
        ]),
        // 1 / K: the speed entry, four records through units.dat's flingy column.
        ...onKey(h, "1", "Zergling speed 0.5 px/frame (the catalogue's speed entry: control 0, top speed, acceleration and halt distance derived), then a new zergling at the Beacon and every zergling ordered to the Pen. Expect: the new one crawls.", [
          ...eudAll("unit.speed", { unit: ZERGLING }, 0.5),
          setSwitch(30, true),
          createUnit(ZERGLING, P1, BEACON),
          orderAll(ZERGLING, P1, PEN),
        ]),
        ...onKey(h, "K", "Zergling speed 13 px/frame (twice a vulture's), then a new zergling at the Beacon and every zergling ordered home. Expect: the new one sprints.", [
          ...eudAll("unit.speed", { unit: ZERGLING }, 13),
          createUnit(ZERGLING, P1, BEACON),
          orderAll(ZERGLING, P1, HOME),
        ]),
        h.once(16, [switchIs(30, true), readIs("flingy.topSpeed", A.flingyTopSpeed + zerglingFlingy * 4, 4, 128)], "Read back: the zergling flingy's top speed is 128 (0.5 × 256) — the speed entry wrote it."),
        // 2: upgrade and tech entries.
        ...onKey(h, "2", "Infantry Armor: 1/1, 1 s, up to level 10. Stim Packs: 1/1, 1 s. Lockdown: 10 energy. Expect that at the Engineering Bay and Academy; your ghost (50 energy) can lock down both tanks in the Pen.", [
          eud("upgrade.mineralCost", { upgrade: INFANTRY_ARMOR }, 1), eud("upgrade.gasCost", { upgrade: INFANTRY_ARMOR }, 1), eud("upgrade.time", { upgrade: INFANTRY_ARMOR }, 1), eud("upgrade.maxLevel", { upgrade: INFANTRY_ARMOR }, 10),
          eud("tech.mineralCost", { tech: STIM_PACKS }, 1), eud("tech.gasCost", { tech: STIM_PACKS }, 1), eud("tech.time", { tech: STIM_PACKS }, 1),
          eud("tech.energy", { tech: LOCKDOWN }, 10),
          ping(PEN),
        ]),
        // 3: the name from a string, the size class.
        ...onKey(h, "3", "Marine named 'Gunner' (the name entry, a map string) and size class large; a read-back line follows. Expect: a selected marine is called Gunner.", [
          eud("unit.name", { unit: MARINE }, gunner),
          eud("unit.sizeClass", { unit: MARINE }, LARGE),
          setSwitch(31, true),
        ]),
        h.once(17, [switchIs(31, true), eudIs("unit.sizeClass", { unit: MARINE }, LARGE)], "Read back: the Marine's size byte is 3 (large) — the write took. A Vulture's shots now do a quarter to marines."),
        // 4: two flags nobody has seen yet.
        ...onKey(h, "4", "Marine: regenerating hit points (your marines are at 10 HP). Zergling: invincible flag, then an enemy zergling at Home. Expect: marine HP climbs; the enemy zergling cannot be killed.", [
          eud("unit.regeneratesHp", { unit: MARINE }, 1),
          eud("unit.invincible", { unit: ZERGLING }, 1),
          createUnit(ZERGLING, P2, HOME),
        ]),
        // 5: the colour entry, two records.
        ...onKey(h, "5", "Player 1 colour = yellow (the colour entry: unit byte and minimap byte). Expect: your units and minimap dots turn yellow.", [
          ...eudAll("player.color", { player: 0 }, YELLOW_CHOICE),
        ]),
        // 6: the supply entries by race.
        ...onKey(h, "6", "Terran supply provided to P1 = 200 and cap = 200 (the supply entries, race Terran). Expect: n/200 in the top bar. A line reads your used supply back.", [
          eud("player.supplyProvided", { race: TERRAN, player: 0 }, 200),
          eud("player.supplyMax", { race: TERRAN, player: 0 }, 200),
          setSwitch(32, true),
        ]),
        h.once(18, [switchIs(32, true), eudIs("player.supplyUsed", { race: TERRAN, player: 0 }, 1, Comparison.AtLeast)], "Read back: your Terran supply used is at least 1 — the used table reads."),
        // 7: the looks entry through units.dat.
        ...onKey(h, "7", "Marine looks like a Zealot (the looks entry: units.dat graphics = the Zealot's flingy), then a new marine at the Beacon. Expect: it draws as a zealot.", [
          eud("unit.graphics", { unit: MARINE }, ZEALOT),
          createUnit(MARINE, P1, BEACON),
        ]),
        // 8: units.dat and weapons.dat entries never probed.
        ...onKey(h, "8", "Marine: max HP 100, sight 11, build time 1 s; Gauss Rifle: range 8 tiles, cooldown 1 frame. Then a new marine at the Beacon. Expect: 100 HP, sees and shoots far and fast; the Barracks trains a marine in a second.", [
          eud("unit.maxHp", { unit: MARINE }, 100),
          eud("unit.sightRange", { unit: MARINE }, 11),
          eud("unit.buildTime", { unit: MARINE }, 1),
          eud("weapon.range", { weapon: GAUSS_RIFLE }, 8 * 32),
          eud("weapon.cooldown", { weapon: GAUSS_RIFLE }, 1),
          createUnit(MARINE, P1, BEACON),
        ]),
        // 9: player entries never probed.
        ...onKey(h, "9", "P1: +500 gas, Infantry Weapons level 3, allied to Player 2. Expect: +500 gas, marines show +3 on their weapon, your units stop shooting the enemy tanks.", [
          eud("player.gas", { player: 0 }, 500, SetModifier.Add),
          eud("player.upgradeLevel", { player: 0, upgrade: INFANTRY_WEAPONS }, 3),
          eud("player.alliance", { player: 0, other: 1 }, 1),
        ]),
        // 0: placed-unit fields never probed.
        ...onKey(h, "0", "Your ghost (slot 0): energy 250. Your zealot (slot 1699): shields 0. Expect: select them.", [
          eud("cunit.energy", { index: GHOST_SLOT }, 250),
          eud("cunit.shields", { index: ZEALOT_SLOT }, 0),
        ]),
        // Reads: the ones probe 5 left unreported, and the placed-unit and screen reads never probed.
        h.once(10, [eudIs("game.frames", {}, 240, Comparison.AtLeast)], "Read: the game has run 240 frames — 10 s at Fastest."),
        h.once(11, [eudIs("game.seconds", {}, 15, Comparison.AtLeast)], "Read: the game clock passed 15 s (0x58D6F8)."),
        ...[2, 1, 0, 3, 4, 5, 6, 7, 8].map((v) => h.once(12, [eudIs("player.slotType", { player: 0 }, v)], `Read: your slot's type byte is ${v} (2 = a human).`)),
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((v) => h.once(13, [eudIs("player.slotType", { player: 2 }, v)], `Read: Player 3's slot type byte is ${v} (nobody is in that slot; 0 = empty).`)),
        ...[0, 1, 2].map((v) => h.once(14, [eudIs("player.race", { player: 0 }, v)], `Read: your race byte is ${v} (0 zerg, 1 terran, 2 protoss).`)),
        h.once(15, [eudIs("player.left", { player: 1 }, 1)], "Read: Player 2 has left (only a human who leaves sets this; a computer never does)."),
        h.once(19, [eudIs("cunit.cloaked", { index: GHOST_SLOT }, 1)], "Read: your ghost is cloaked (slot 0's cloak bit)."),
        h.once(20, [eudIs("cunit.x", { index: GHOST_SLOT }, 1024, Comparison.AtLeast)], "Read: your ghost is east of the middle (x ≥ 1024)."),
        h.once(21, [eudIs("cunit.y", { index: GHOST_SLOT }, 1024, Comparison.AtLeast)], "Read: your ghost is south of the middle (y ≥ 1024)."),
        h.once(22, [eudIs("game.screenX", {}, 1024, Comparison.AtLeast)], "Read: the screen scrolled right of the middle (screen x ≥ 1024)."),
        h.once(23, [eudIs("game.screenY", {}, 1024, Comparison.AtLeast)], "Read: the screen scrolled below the middle (screen y ≥ 1024)."),
        h.trigger([P1], [always()], [h.comment("Magenta: run triggers every frame"), everyFrame(), preserve()]),
      ]);
    },
  },
  /* ────────────────────────────────────────────────────────────────────────────── */
  {
    name: "Magenta probe 9 — the rest", file: "magenta-probe-9-rest.scx",
    place(place) {
      // Slots: Ghost 0, Zealot 1699, Vulture 1698, marines 1697–1694.
      place(GHOST, 0, 12.5, 14.5);
      place(ZEALOT, 0, 14.5, 16.5);
      place(VULTURE, 0, 16.5, 16.5);
      for (let i = 0; i < 4; i++) place(MARINE, 0, 12.5 + i, 12.5);
      place(MEDIC, 0, 17.5, 14.5);
      place(SCV, 0, 9.5, 27.5); place(SCV, 0, 10.5, 27.5); place(SCV, 0, 18.5, 14.5);
      place(COMMAND_CENTER, 0, 12, 26.5);
      place(ENGINEERING_BAY, 0, 18, 26.5);
      place(BARRACKS, 0, 18, 31.5);
      place(SUPPLY_DEPOT, 0, 24, 31);
      place(SIEGE_TANK, 1, 38.5, 14.5); place(SIEGE_TANK, 1, 41.5, 14.5);
      place(MINERAL_FIELD, 11, 7, 25); place(MINERAL_FIELD, 11, 7, 26); place(MINERAL_FIELD, 11, 7, 27);
      place(GEYSER, 11, 8, 30.5);
      place(BEACON_UNIT, 11, 20, 10);
    },
    build(scn, h) {
      const GHOST_SLOT = 0, ZEALOT_SLOT = 1699, VULTURE_SLOT = 1698, MARINE_SLOTS = [1697, 1696, 1695, 1694];
      const INFANTRY_WEAPONS = 7, PERSONNEL_CLOAKING = 10, GAUSS_RIFLE = 0, ARCLITE_SHOCK_CANNON = 27, NO_WEAPON = 130;
      const TERRAN = 1, LARGE = 3;
      applyTriggers(scn, [
        h.trigger([P1], [always()], [
          h.comment("start: marines at 10 HP, the vulture at 20, personnel cloaking researched"),
          ...MARINE_SLOTS.map((s) => eud("cunit.hp", { index: s }, 10)),
          eud("cunit.hp", { index: VULTURE_SLOT }, 20),
          eud("player.techResearched", { player: 0, tech: PERSONNEL_CLOAKING }, 1),
          h.text("Probe 9, the rest. Press 6 and 7 before 5. Keys: 1 marines large + an enemy vulture, 2 flags (medic heals the vulture, SCV repairs a marine), 3 marine costs + depot supply, 4 marine sight 1, 5 marine weapons swapped, 6 gauss rifle fast + strong, 7 gauss rifle minimum range, 8 / 9 vision (one shows the Pen), 0 / Q alliance, W the zealot a hallucination."),
          h.text("At start, lines read your slot type (2 = human), Player 3's (0 = empty), your race (1 = terran) and your supply used. Cloak the ghost (C), walk it east and south past the middle, and scroll the screen right and down: a line each."),
        ]),
        ...onKey(h, "1", "Marine size class large, then an enemy vulture at Home. Expect: its shots take 5 off a marine, not 20; a read-back line.", [
          eud("unit.sizeClass", { unit: MARINE }, LARGE),
          createUnit(VULTURE, P2, HOME),
          setSwitch(30, true),
        ]),
        h.once(16, [switchIs(30, true), eudIs("unit.sizeClass", { unit: MARINE }, LARGE)], "Read back: the Marine's size byte is 3 (large)."),
        ...onKey(h, "2", "Vulture: organic flag (your vulture is at 20 HP: the medic should heal it). Marine: mechanical flag (an SCV should be able to repair one). Marine: cloakable, burrowable, hero, robotic flags, read back in four lines.", [
          eud("unit.organic", { unit: VULTURE }, 1),
          eud("unit.mechanical", { unit: MARINE }, 1),
          eud("unit.cloakable", { unit: MARINE }, 1),
          eud("unit.burrowable", { unit: MARINE }, 1),
          eud("unit.hero", { unit: MARINE }, 1),
          eud("unit.robotic", { unit: MARINE }, 1),
          setSwitch(31, true),
        ]),
        h.once(17, [switchIs(31, true), eudIs("unit.cloakable", { unit: MARINE }, 1)], "Read back: Marine cloakable flag set (bit 9)."),
        h.once(18, [switchIs(31, true), eudIs("unit.burrowable", { unit: MARINE }, 1)], "Read back: Marine burrowable flag set (bit 20)."),
        h.once(19, [switchIs(31, true), eudIs("unit.hero", { unit: MARINE }, 1)], "Read back: Marine hero flag set (bit 6)."),
        h.once(20, [switchIs(31, true), eudIs("unit.robotic", { unit: MARINE }, 1)], "Read back: Marine robotic flag set (bit 14)."),
        ...onKey(h, "3", "Marine: 1 mineral, 1 gas, 4 supply. Supply Depot: provides 30, then a new depot at Home. Expect: the Barracks shows 1/1 and 4 supply; the top bar's provided supply rises by 30.", [
          eud("unit.mineralCost", { unit: MARINE }, 1),
          eud("unit.gasCost", { unit: MARINE }, 1),
          eud("unit.supplyRequired", { unit: MARINE }, 4),
          eud("unit.supplyProvided", { unit: SUPPLY_DEPOT }, 30),
          createUnit(SUPPLY_DEPOT, P1, HOME),
        ]),
        ...onKey(h, "4", "Marine: sight 1 tile, target acquisition 1, then a new marine at the Beacon. Expect: it reveals only a tiny circle; a read-back line for the acquisition range.", [
          eud("unit.sightRange", { unit: MARINE }, 1),
          eud("unit.seekRange", { unit: MARINE }, 1),
          createUnit(MARINE, P1, BEACON),
          setSwitch(32, true),
        ]),
        h.once(21, [switchIs(32, true), eudIs("unit.seekRange", { unit: MARINE }, 1)], "Read back: the Marine's target acquisition range byte is 1."),
        ...onKey(h, "5", "Marine: ground weapon = Arclite Shock Cannon, air weapon = none; two enemy zerglings and an overlord at Home. Expect: zerglings die in one splash shot; the overlord is ignored.", [
          eud("unit.groundWeapon", { unit: MARINE }, ARCLITE_SHOCK_CANNON),
          eud("unit.airWeapon", { unit: MARINE }, NO_WEAPON),
          createUnit(ZERGLING, P2, HOME, 2),
          createUnit(OVERLORD, P2, HOME),
        ]),
        ...onKey(h, "6", "Gauss Rifle: cooldown 1, damage factor 2, +10 per upgrade, and Infantry Weapons level 3; two enemy zerglings at Home. Expect: marines fire without pause and each volley takes about 72.", [
          eud("weapon.cooldown", { weapon: GAUSS_RIFLE }, 1),
          eud("weapon.factor", { weapon: GAUSS_RIFLE }, 2),
          eud("weapon.bonus", { weapon: GAUSS_RIFLE }, 10),
          eud("player.upgradeLevel", { player: 0, upgrade: INFANTRY_WEAPONS }, 3),
          createUnit(ZERGLING, P2, HOME, 2),
        ]),
        ...onKey(h, "7", "Gauss Rifle: minimum range 3 tiles; an enemy zergling at Home. Expect: marines cannot shoot it while it is close, only after backing off.", [
          eud("weapon.minRange", { weapon: GAUSS_RIFLE }, 3 * 32),
          createUnit(ZERGLING, P2, HOME),
        ]),
        ...onKey(h, "8", "Vision: Player 1's row, Player 2's bit on. Expect: the Pen (enemy tanks) shows, or nothing.", [eud("player.vision", { player: 0, other: 1 }, 1)]),
        ...onKey(h, "9", "Vision: Player 2's row, Player 1's bit on. Expect: the Pen shows, or nothing. Whichever of 8 and 9 shows it settles the direction.", [eud("player.vision", { player: 1, other: 0 }, 1)]),
        ...onKey(h, "0", "Alliance: Player 2 allied to you. Expect: walk a marine to the Pen — the tanks hold fire.", [eud("player.alliance", { player: 1, other: 0 }, 1)]),
        ...onKey(h, "Q", "Alliance: you allied to Player 2. Expect: your marines stop attacking enemy units on their own.", [eud("player.alliance", { player: 0, other: 1 }, 1)]),
        ...onKey(h, "W", "Your zealot (slot 1699): hallucination flag. Expect: it turns hallucination (tinted, double damage) and dies after a while.", [eud("cunit.hallucination", { index: ZEALOT_SLOT }, 1)]),
        // Reads at start and on your doing.
        ...[2, 1, 0, 3, 4, 5, 6, 7, 8].map((v) => h.once(12, [eudIs("player.slotType", { player: 0 }, v)], `Read: your slot's type byte is ${v} (2 = a human).`)),
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((v) => h.once(13, [eudIs("player.slotType", { player: 2 }, v)], `Read: Player 3's slot type byte is ${v} (nobody is in that slot; 0 = empty).`)),
        ...[0, 1, 2].map((v) => h.once(14, [eudIs("player.race", { player: 0 }, v)], `Read: your race byte is ${v} (0 zerg, 1 terran, 2 protoss).`)),
        h.once(15, [eudIs("player.left", { player: 1 }, 1)], "Read: Player 2 has left (only a human who leaves sets this)."),
        h.once(22, [eudIs("player.supplyUsed", { race: TERRAN, player: 0 }, 1, Comparison.AtLeast)], "Read: your Terran supply used is at least 1."),
        h.once(23, [eudIs("cunit.cloaked", { index: GHOST_SLOT }, 1)], "Read: your ghost is cloaked (slot 0's cloak bit)."),
        h.once(24, [eudIs("cunit.x", { index: GHOST_SLOT }, 1024, Comparison.AtLeast)], "Read: your ghost is east of the middle (x ≥ 1024)."),
        h.once(25, [eudIs("cunit.y", { index: GHOST_SLOT }, 1024, Comparison.AtLeast)], "Read: your ghost is south of the middle (y ≥ 1024)."),
        h.once(26, [eudIs("game.screenX", {}, 1024, Comparison.AtLeast)], "Read: the screen scrolled right of the middle (screen x ≥ 1024)."),
        h.once(27, [eudIs("game.screenY", {}, 1024, Comparison.AtLeast)], "Read: the screen scrolled below the middle (screen y ≥ 1024)."),
        h.trigger([P1], [always()], [h.comment("Magenta: run triggers every frame"), everyFrame(), preserve()]),
      ]);
    },
  },
  /* ────────────────────────────────────────────────────────────────────────────── */
  {
    name: "Magenta probe 10 — presentation", file: "magenta-probe-10-presentation.scx",
    place(place) {
      for (let i = 0; i < 4; i++) place(MARINE, 0, 12.5 + i, 12.5);
      place(ZERGLING, 1, 38.5, 14.5); place(ZERGLING, 1, 40.5, 14.5);
      place(BEACON_UNIT, 11, 20, 10);
    },
    build(scn, h) {
      const cell = (u: number): [number, number] => [11, u];
      const F = { dirt: cell(181), water: cell(182), black: cell(183), cloaked: cell(184), halluc: cell(185), flash: cell(186), normal: cell(187), enemy: cell(188) };
      const flag = (c: [number, number]) => setDeaths(c, 1);
      // Tiles of other terrains of the tileset, for a change that shows: the flat map is terrain 2.
      const tileOf = (isomId: number) => (jungle ? flatTerrain(2, 2, baseTerrain(jungle, isomId), jungle, () => 0.5, ERA_JUNGLE).tiles[0] : isomId * 16);
      const other = tileOf(3), water = tileOf(4);
      const P1MARINE = { unit: MARINE, owner: 0, location: null };
      const hooks = [
        { id: "t1", kind: "terrain", flag: F.dirt, location: HOME, tile: other },
        { id: "t2", kind: "terrain", flag: F.water, location: PEN, tile: water },
        { id: "t3", kind: "terrain", flag: F.black, location: BEACON, tile: 0 },
        { id: "c", kind: "foreach", flag: F.cloaked, ...P1MARINE, do: { tint: "cloaked" } },
        { id: "h", kind: "foreach", flag: F.halluc, ...P1MARINE, do: { tint: "hallucination" } },
        { id: "f", kind: "foreach", flag: F.flash, ...P1MARINE, do: { tint: "flash" } },
        { id: "n", kind: "foreach", flag: F.normal, ...P1MARINE, do: { tint: "normal" } },
        { id: "e", kind: "foreach", flag: F.enemy, unit: ZERGLING, owner: 1, location: null, do: { tint: "hallucination" } },
      ];
      applyTriggers(scn, [
        h.trigger([P1], [always()], [
          h.comment("start"),
          h.text(`Probe 10, presentation. Terrain: 1 rewrites the ground under Home (your yard) to tile ${other}, 2 the Pen (enemy yard, east) to tile ${water}, 3 the Beacon's tiles to 0. Scroll away and back if nothing changes at once.`),
          h.text("Looks: 4 your marines drawn see-through (cloaked look), 5 blue (hallucination look), 6 white flash, 7 back to normal, 8 the enemy zerglings blue. Say for each whether the look shows, and whether it stays."),
        ]),
        ...onKey(h, "1", `terrain under Home = tile ${other}. Expect: the ground there changes.`, [flag(F.dirt)]),
        ...onKey(h, "2", `terrain under the Pen = tile ${water}. Expect: the ground there changes (pinged).`, [flag(F.water), ping(PEN)]),
        ...onKey(h, "3", "terrain under the Beacon = tile 0. Expect: black, or the tileset's tile 0.", [flag(F.black)]),
        ...onKey(h, "4", "marines: cloaked look (draw function 6).", [flag(F.cloaked)]),
        ...onKey(h, "5", "marines: hallucination look (16).", [flag(F.halluc)]),
        ...onKey(h, "6", "marines: warp flash look (17).", [flag(F.flash)]),
        ...onKey(h, "7", "marines: normal look (0).", [flag(F.normal)]),
        ...onKey(h, "8", "enemy zerglings: hallucination look.", [flag(F.enemy)]),
        h.trigger([P1], [always()], [h.comment("Magenta: run triggers every frame"), everyFrame(), preserve()]),
      ]);
      const spec = { version: 4, everyFrame: true, chat: null, hooks, scans: [], msqc: null };
      return { plugins: { magenta: { spec: JSON.stringify(spec) }, eudTurbo: {} } };
    },
  },
];

async function build(url: string, map: Uint8Array, plugins: BuildPlugins): Promise<{ map: Uint8Array; log: string }> {
  const res = await fetch(`${url.replace(/\/$/, "")}/build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ map: Buffer.from(map).toString("base64"), plugins }) });
  const body = (await res.json()) as { map?: string; log?: string; error?: { code: string; message: string; log?: string } };
  if (!res.ok || !body.map) throw new Error(`build failed (${res.status}): ${body.error?.message ?? "?"}\n${body.error?.log ?? body.log ?? ""}`);
  return { map: new Uint8Array(Buffer.from(body.map, "base64")), log: body.log ?? "" };
}

for (const m of MAPS) {
  resetKeySwitches();
  const { scn, h } = scaffold(m, "A probe map for the Magenta plugin's candidate conditions and actions. Play as Use Map Settings in StarCraft: Remastered; press the keys it names.");
  const out = m.build(scn, h) ?? {};
  const extras = new Map<string, Uint8Array>();
  if (out.sidecar) extras.set(MEMBER, encodeSidecar({ version: 1, folders: [], counters: [], settings: {}, expansions: [], builds: [], chat: null, msqc: null, ...out.sidecar }));
  const bytes = await saveMap(serializeScenario(scn), { listfile: true, compress: "pkware", extras });
  const path = join(OUT, m.file);
  writeFileSync(path, bytes);
  const back = parseScenario((await loadMap(new Uint8Array(readFileSync(path)))).chk);
  console.log(`${m.file}: ${bytes.length} bytes, ${back.triggers.length} triggers`);
  if (out.plugins) {
    if (!buildAt) { console.log(`   needs a build (--build URL) to play; the plugins object is in the script`); continue; }
    const built = await build(buildAt, bytes, out.plugins);
    const builtPath = path.replace(/\.scx$/, "-eud.scx");
    writeFileSync(builtPath, built.map);
    const again = parseScenario((await loadMap(built.map)).chk);
    console.log(`   built: ${builtPath.split("/").pop()} ${built.map.length} bytes, opens with ${again.triggers.length} triggers`);
    if (argv.includes("--log")) console.log(built.log.split("\n").filter((l) => /warn|error|MouseLoc|Memory\(|: \d+$|Total/i.test(l)).map((l) => `   | ${l}`).join("\n"));
  }
}
