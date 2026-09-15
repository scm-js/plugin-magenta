/**
 * A dry run of the trigger list, without the game. It runs the list the way the game
 * does — one cycle is every player in order, each player's triggers in list order, a
 * trigger firing once and then disabled unless preserved — over a small model of the
 * game's state: switches, death counters and the EUD cells that share their table,
 * the countdown timer and elapsed time, each player's resources and score, the units
 * on the map as points inside the map's locations, alliances, and a Wait that holds a
 * player's triggers still.
 *
 * What it cannot know — a key press, a chat command, a build row's answer, a unit's
 * hit points — it does not guess: the condition is reported as unknown and the map
 * maker says whether to pretend it holds (`assumptions`). Actions it cannot do (an AI
 * script, an order, a sound) are noted in the log and skipped.
 *
 * The expansion tests use the same interpreter to prove a copy lands in one cycle.
 */
import { ActionType, AllianceStatus, Comparison, ConditionType, PlayerGroup, ResourceType, ScoreType, SetModifier, SwitchAction, SwitchState, TriggerFlag, UnitClass, type ActionRecord, type ConditionRecord, type TriggerRecord } from "../../vendor/triggers";
import { MASK_MARKER, isEud } from "./eud";
import { liveActions, liveConditions, isActionDisabled, isConditionDisabled } from "./records";

export interface SimUnit { id: number; owner: number; unitId: number; x: number; y: number }
export interface SimRect { left: number; top: number; right: number; bottom: number }

/** The map as the run needs it. */
export interface SimWorld {
  /** Location rectangles in pixels by 1-based number; `[64]` is Anywhere; a missing one is null. */
  locations: (SimRect | null)[];
  /** Which of the 12 slots run triggers (a human or a computer). */
  active: boolean[];
  /** 0-based force per slot, -1 for none. */
  force: number[];
  /** `allied[a][b]` at the start, from the forces. */
  allied: boolean[][];
  isBuilding(unitId: number): boolean;
  string(index: number): string | null;
  /** Death-counter cells (`flat`) whose value comes from outside the triggers: synced input, chat, a scan. */
  unknownCells: ReadonlySet<number>;
  /** Cells whose write starts a build row's hook in the game. */
  hookCells: ReadonlySet<number>;
  everyFrame: boolean;
}

export interface SimPlayer {
  minerals: number;
  gas: number;
  /** By `ScoreType`, the plain kinds; the combined ones are sums. */
  score: number[];
  result: "victory" | "defeat" | "draw" | null;
  /** A Wait in progress: when it ends and where to go on. */
  wait: { until: number; trigger: number; action: number } | null;
}

export type SimEvent = { cycle: number; player: number; trigger: number } & (
  | { kind: "fired" }
  | { kind: "text"; text: string }
  | { kind: "objectives"; text: string }
  | { kind: "end"; result: "victory" | "defeat" | "draw" }
  | { kind: "wait"; seconds: number }
  | { kind: "note"; text: string }
);

/** A condition the run could not decide, by the key its assumption is kept under. */
export interface Unknown { key: string; trigger: number; condition: number; player: number }

export interface SimState {
  /** Death counts by flat dword index into the table: `player + unit × 12`; EUD cells past the 27 groups land in the same space. */
  deaths: Map<number, number>;
  switches: Set<number>;
  /** Triggers that fired and are not preserved, as `trigger × 16 + player`. */
  spent: Set<number>;
  cycle: number;
  /** Game seconds since the start. */
  seconds: number;
  countdown: number;
  countdownPaused: boolean;
  units: SimUnit[];
  nextUnit: number;
  players: SimPlayer[];
  allied: boolean[][];
  /** Kills by `flat(player, unit)`, for the Kill conditions; nothing in the run increments them. */
  kills: Map<number, number>;
  /** What to take an unknown condition as. */
  assumptions: Map<string, boolean>;
  /** The unknown conditions met so far. */
  unknown: Map<string, Unknown>;
  log: SimEvent[];
  rand: number;
}

const HUMAN_PLAYERS = 8;
const SLOTS = 12;
export const flat = (player: number, unit: number): number => player + unit * 12;
export const secondsPerCycle = (world: SimWorld): number => (world.everyFrame ? 1 / 24 : 2);

export const defaultWorld = (): SimWorld => ({
  locations: [],
  active: Array.from({ length: SLOTS }, (_, i) => i < HUMAN_PLAYERS),
  force: Array.from({ length: SLOTS }, () => -1),
  allied: Array.from({ length: SLOTS }, () => Array.from({ length: SLOTS }, () => false)),
  isBuilding: (id) => id >= 106 && id <= 201,
  string: () => null,
  unknownCells: new Set(),
  hookCells: new Set(),
  everyFrame: false,
});

const DEFAULT_WORLD = defaultWorld();

export function newState(world: SimWorld = DEFAULT_WORLD): SimState {
  return {
    deaths: new Map(), switches: new Set(), spent: new Set(),
    cycle: 0, seconds: 0, countdown: 0, countdownPaused: false,
    units: [], nextUnit: 1,
    players: Array.from({ length: SLOTS }, () => ({ minerals: 0, gas: 0, score: Array.from({ length: 8 }, () => 0), result: null, wait: null })),
    allied: world.allied.map((row) => [...row]),
    kills: new Map(), assumptions: new Map(), unknown: new Map(), log: [], rand: 0x2545f491,
  };
}

export const getDeaths = (s: SimState, player: number, unit: number): number => s.deaths.get(flat(player, unit)) ?? 0;
export const setDeaths = (s: SimState, player: number, unit: number, value: number): void => { s.deaths.set(flat(player, unit), value >>> 0); };

/* ── Players and groups ── */

/** The slots a player field means for the player running the trigger. */
export function slotsOf(group: number, current: number, s: SimState, world: SimWorld): number[] {
  if (group < SLOTS) return [group];
  if (group >= 27) return [];
  const active = (p: number) => world.active[p];
  switch (group) {
    case PlayerGroup.CurrentPlayer: return [current];
    case PlayerGroup.AllPlayers: return Array.from({ length: SLOTS }, (_, p) => p);
    case PlayerGroup.Foes: case PlayerGroup.NonAlliedVictoryPlayers: return range(SLOTS).filter((p) => p !== current && active(p) && !s.allied[current][p]);
    case PlayerGroup.Allies: return range(SLOTS).filter((p) => p === current || (active(p) && s.allied[current][p]));
    case PlayerGroup.NeutralPlayers: return [11];
    case PlayerGroup.Force1: case PlayerGroup.Force2: case PlayerGroup.Force3: case PlayerGroup.Force4: return range(HUMAN_PLAYERS).filter((p) => world.force[p] === group - PlayerGroup.Force1);
    default: return [];
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Whether the trigger runs for a slot: owned outright, through All Players, or through the slot's force. */
export function runsFor(t: TriggerRecord, player: number, world: SimWorld): boolean {
  if (t.players[player] || t.players[PlayerGroup.AllPlayers]) return true;
  const f = world.force[player];
  return f >= 0 && !!t.players[PlayerGroup.Force1 + f];
}

/* ── Units and locations ── */

function matchesUnit(world: SimWorld, unitId: number, wanted: number): boolean {
  if (wanted < UnitClass.Any) return unitId === wanted;
  if (wanted === UnitClass.Any) return true;
  if (wanted === UnitClass.Men) return !world.isBuilding(unitId);
  return world.isBuilding(unitId);
}

function inLocation(world: SimWorld, u: SimUnit, location: number): boolean {
  if (location === 64) return true;
  const r = world.locations[location];
  return !!r && u.x >= r.left && u.x < r.right && u.y >= r.top && u.y < r.bottom;
}

function unitsOf(s: SimState, world: SimWorld, slots: readonly number[], unitId: number, location: number | null): SimUnit[] {
  return s.units.filter((u) => slots.includes(u.owner) && matchesUnit(world, u.unitId, unitId) && (location === null || inLocation(world, u, location)));
}

/** Put `count` units of a type for a player inside a location (its centre, spread a little). */
export function putUnits(s: SimState, world: SimWorld, owner: number, unitId: number, count: number, location: number): SimUnit[] {
  const r = location === 64 ? { left: 0, top: 0, right: 64, bottom: 64 } : world.locations[location];
  if (!r) return [];
  const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  const made: SimUnit[] = [];
  for (let k = 0; k < count; k++) {
    const u = { id: s.nextUnit++, owner, unitId, x: Math.min(r.right - 1, cx + (k % 4)), y: Math.min(r.bottom - 1, cy + Math.floor(k / 4)) };
    s.units.push(u);
    made.push(u);
  }
  return made;
}

/* ── Values ── */

function compare(cmp: number, have: number, want: number): boolean {
  if (cmp === Comparison.AtLeast) return have >= want;
  if (cmp === Comparison.AtMost) return have <= want;
  return have === want;
}

function resourcesOf(p: SimPlayer, kind: number): number {
  return kind === ResourceType.Ore ? p.minerals : kind === ResourceType.Gas ? p.gas : p.minerals + p.gas;
}

function scoreOf(p: SimPlayer, kind: number): number {
  const sc = p.score;
  switch (kind) {
    case ScoreType.UnitsAndBuildings: return sc[ScoreType.Units] + sc[ScoreType.Buildings];
    case ScoreType.KillsAndRazings: return sc[ScoreType.Kills] + sc[ScoreType.Razings];
    case ScoreType.Total: return sc[ScoreType.Total] + sc[ScoreType.Units] + sc[ScoreType.Buildings] + sc[ScoreType.Kills] + sc[ScoreType.Razings] + sc[ScoreType.Custom];
    default: return sc[kind] ?? 0;
  }
}

function modify(op: number, old: number, amount: number): number {
  if (op === SetModifier.Add) return old + amount;
  if (op === SetModifier.Subtract) return Math.max(0, old - amount);
  return amount;
}

function random(s: SimState): number {
  // xorshift32, seeded so a run repeats.
  let x = s.rand;
  x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  s.rand = x;
  return x;
}

/** The deaths cells a condition or action means; EUD players address the same table. */
function cells(player: number, unit: number, current: number, s: SimState, world: SimWorld): number[] {
  if (player >= 27) return [player + unit * 12];
  return slotsOf(player, current, s, world).map((p) => flat(p, unit));
}

/* ── Conditions ── */

export interface Verdict {
  ok: boolean;
  /** False when the run could not tell and `ok` is the assumption. */
  known: boolean;
  /** The value the run saw, for the readout. */
  have?: number;
  key?: string;
}

const most = (world: SimWorld, current: number, value: (p: number) => number, least: boolean): boolean => {
  const mine = value(current);
  return range(HUMAN_PLAYERS).every((p) => p === current || !world.active[p] || (least ? value(p) >= mine : value(p) <= mine));
};

/** Decide one condition for a player; `key` names its assumption when it cannot be decided. */
export function evaluate(c: ConditionRecord, current: number, s: SimState, world: SimWorld, key: string): Verdict {
  const assume = (): Verdict => ({ ok: s.assumptions.get(key) ?? false, known: false, key });
  const count = (slots: number[], location: number | null) => unitsOf(s, world, slots, c.unitId, location).length;
  const commanded = (p: number, location: number | null) => unitsOf(s, world, [p], c.unitId, location).length;
  switch (c.type) {
    case ConditionType.Always: case ConditionType.Briefing: return { ok: true, known: true };
    case ConditionType.Never: return { ok: false, known: true };
    case ConditionType.Switch: return { ok: (c.comparison === SwitchState.Set) === s.switches.has(c.resource), known: true };
    case ConditionType.Deaths: {
      const list = cells(c.player, c.unitId, current, s, world);
      if (list.some((cell) => world.unknownCells.has(cell))) return assume();
      // An EUD read of something no trigger wrote is the game's state, which the run does not have.
      if (isEud(c.player) && !list.every((cell) => s.deaths.has(cell))) return assume();
      const mask = c.mask === MASK_MARKER ? c.location >>> 0 : 0xffffffff;
      const sum = list.reduce((n, cell) => n + (((s.deaths.get(cell) ?? 0) & mask) >>> 0), 0) >>> 0;
      return { ok: compare(c.comparison, sum, c.amount >>> 0), known: true, have: sum };
    }
    case ConditionType.CountdownTimer: { const have = Math.floor(s.countdown); return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.ElapsedTime: { const have = Math.floor(s.seconds); return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.Accumulate: { const have = slotsOf(c.player, current, s, world).reduce((n, p) => n + resourcesOf(s.players[p], c.resource), 0); return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.Score: { const have = slotsOf(c.player, current, s, world).reduce((n, p) => n + scoreOf(s.players[p], c.resource), 0); return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.Bring: { if (c.location === 0) return { ok: false, known: true, have: 0 }; const have = count(slotsOf(c.player, current, s, world), c.location); return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.Command: { const have = count(slotsOf(c.player, current, s, world), null); return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.Kill: { const have = slotsOf(c.player, current, s, world).reduce((n, p) => n + (s.kills.get(flat(p, c.unitId)) ?? 0), 0); return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.Opponents: { const me = slotsOf(c.player, current, s, world)[0] ?? current; const have = range(HUMAN_PLAYERS).filter((p) => p !== me && world.active[p] && !s.allied[me][p] && s.players[p].result === null).length; return { ok: compare(c.comparison, have, c.amount), known: true, have }; }
    case ConditionType.CommandTheMost: return { ok: most(world, current, (p) => commanded(p, null), false), known: true, have: commanded(current, null) };
    case ConditionType.CommandTheLeast: return { ok: most(world, current, (p) => commanded(p, null), true), known: true, have: commanded(current, null) };
    case ConditionType.CommandTheMostAt: return { ok: most(world, current, (p) => commanded(p, c.location), false), known: true, have: commanded(current, c.location) };
    case ConditionType.CommandTheLeastAt: return { ok: most(world, current, (p) => commanded(p, c.location), true), known: true, have: commanded(current, c.location) };
    case ConditionType.MostKills: return { ok: most(world, current, (p) => s.kills.get(flat(p, c.unitId)) ?? 0, false), known: true, have: s.kills.get(flat(current, c.unitId)) ?? 0 };
    case ConditionType.LeastKills: return { ok: most(world, current, (p) => s.kills.get(flat(p, c.unitId)) ?? 0, true), known: true, have: s.kills.get(flat(current, c.unitId)) ?? 0 };
    case ConditionType.HighestScore: return { ok: most(world, current, (p) => scoreOf(s.players[p], c.resource), false), known: true, have: scoreOf(s.players[current], c.resource) };
    case ConditionType.LowestScore: return { ok: most(world, current, (p) => scoreOf(s.players[p], c.resource), true), known: true, have: scoreOf(s.players[current], c.resource) };
    case ConditionType.MostResources: return { ok: most(world, current, (p) => resourcesOf(s.players[p], c.resource), false), known: true, have: resourcesOf(s.players[current], c.resource) };
    case ConditionType.LeastResources: return { ok: most(world, current, (p) => resourcesOf(s.players[p], c.resource), true), known: true, have: resourcesOf(s.players[current], c.resource) };
    default: return assume();
  }
}

export const assumptionKey = (trigger: number, condition: number): string => `${trigger}:${condition}`;

/** Every live, enabled condition of a trigger decided for a player, without side effects. */
export function verdicts(list: readonly TriggerRecord[], index: number, player: number, s: SimState, world: SimWorld): { condition: number; verdict: Verdict }[] {
  const t = list[index];
  if (!t) return [];
  return liveConditions(t).map((c, i) => ({ condition: i, verdict: isConditionDisabled(c) ? { ok: true, known: true } : evaluate(c, player, s, world, assumptionKey(index, i)) }));
}

/* ── Actions ── */

/** What an action asks of the cycle: nothing, or a Wait in seconds. */
type Outcome = { wait?: number };

function runAction(a: ActionRecord, i: number, current: number, s: SimState, world: SimWorld): Outcome {
  const note = (text: string) => s.log.push({ cycle: s.cycle, player: current, trigger: i, kind: "note", text });
  const slots = (group: number) => slotsOf(group, current, s, world);
  const text = (index: number) => world.string(index) ?? "";
  switch (a.type) {
    case ActionType.Victory: case ActionType.Defeat: case ActionType.Draw: {
      const result = a.type === ActionType.Victory ? "victory" : a.type === ActionType.Defeat ? "defeat" : "draw";
      s.players[current].result = result;
      s.log.push({ cycle: s.cycle, player: current, trigger: i, kind: "end", result });
      return {};
    }
    case ActionType.Wait: return { wait: a.time / 1000 };
    case ActionType.Transmission: {
      if (a.text) s.log.push({ cycle: s.cycle, player: current, trigger: i, kind: "text", text: text(a.text) });
      return { wait: modify(a.modifier, a.time, a.target) / 1000 };
    }
    case ActionType.DisplayText: s.log.push({ cycle: s.cycle, player: current, trigger: i, kind: "text", text: text(a.text) }); return {};
    case ActionType.SetMissionObjectives: s.log.push({ cycle: s.cycle, player: current, trigger: i, kind: "objectives", text: text(a.text) }); return {};
    case ActionType.SetSwitch: {
      if (a.modifier === SwitchAction.Set) s.switches.add(a.target);
      else if (a.modifier === SwitchAction.Clear) s.switches.delete(a.target);
      else if (a.modifier === SwitchAction.Toggle) { if (s.switches.has(a.target)) s.switches.delete(a.target); else s.switches.add(a.target); }
      else if (a.modifier === SwitchAction.Randomize) { if (random(s) & 1) s.switches.add(a.target); else s.switches.delete(a.target); }
      return {};
    }
    case ActionType.SetCountdownTimer: s.countdown = modify(a.modifier, s.countdown, a.time); return {};
    case ActionType.PauseTimer: s.countdownPaused = true; return {};
    case ActionType.UnpauseTimer: s.countdownPaused = false; return {};
    case ActionType.SetDeaths: {
      const mask = a.mask === MASK_MARKER ? a.location >>> 0 : 0xffffffff;
      for (const cell of cells(a.player, a.unitId, current, s, world)) {
        const old = s.deaths.get(cell) ?? 0;
        const field = (old & mask) >>> 0;
        let next: number;
        if (a.modifier === SetModifier.SetTo) next = a.target & mask;
        else if (a.modifier === SetModifier.Add) next = ((field + a.target) >>> 0) & mask;
        else next = Math.max(0, field - a.target) & mask;
        s.deaths.set(cell, ((old & ~mask) | next) >>> 0);
        if (world.hookCells.has(cell)) note("A build row runs here in the game; the dry run skips it.");
      }
      return {};
    }
    case ActionType.SetResources: {
      for (const p of slots(a.player)) {
        const pl = s.players[p];
        if (a.unitId === ResourceType.Ore || a.unitId === ResourceType.OreAndGas) pl.minerals = modify(a.modifier, pl.minerals, a.target);
        if (a.unitId === ResourceType.Gas || a.unitId === ResourceType.OreAndGas) pl.gas = modify(a.modifier, pl.gas, a.target);
      }
      return {};
    }
    case ActionType.SetScore: {
      const kinds = a.unitId === ScoreType.UnitsAndBuildings ? [ScoreType.Units, ScoreType.Buildings] : a.unitId === ScoreType.KillsAndRazings ? [ScoreType.Kills, ScoreType.Razings] : [a.unitId];
      for (const p of slots(a.player)) for (const k of kinds) s.players[p].score[k] = modify(a.modifier, s.players[p].score[k] ?? 0, a.target);
      return {};
    }
    case ActionType.CreateUnit: case ActionType.CreateUnitWithProperties: {
      if (a.location === 0 || a.unitId >= UnitClass.Any) return {};
      for (const p of slots(a.player)) putUnits(s, world, p, a.unitId, Math.max(1, a.modifier), a.location);
      return {};
    }
    case ActionType.KillUnit: case ActionType.KillUnitAt: case ActionType.RemoveUnit: case ActionType.RemoveUnitAt: {
      const at = a.type === ActionType.KillUnitAt || a.type === ActionType.RemoveUnitAt;
      if (at && a.location === 0) return {};
      let hit = unitsOf(s, world, slots(a.player), a.unitId, at ? a.location : null);
      if (at && a.modifier > 0) hit = hit.slice(0, a.modifier);
      const gone = new Set(hit.map((u) => u.id));
      s.units = s.units.filter((u) => !gone.has(u.id));
      if (a.type === ActionType.KillUnit || a.type === ActionType.KillUnitAt) for (const u of hit) s.deaths.set(flat(u.owner, u.unitId), (s.deaths.get(flat(u.owner, u.unitId)) ?? 0) + 1);
      return {};
    }
    case ActionType.GiveUnits: {
      if (a.location === 0) return {};
      const to = slots(a.target)[0];
      if (to === undefined) return {};
      let hit = unitsOf(s, world, slots(a.player), a.unitId, a.location);
      if (a.modifier > 0) hit = hit.slice(0, a.modifier);
      for (const u of hit) u.owner = to;
      return {};
    }
    case ActionType.MoveUnit: {
      if (a.location === 0 || a.target === 0) return {};
      const dest = a.target === 64 ? { left: 0, top: 0, right: 64, bottom: 64 } : world.locations[a.target];
      if (!dest) return {};
      let hit = unitsOf(s, world, slots(a.player), a.unitId, a.location);
      if (a.modifier > 0) hit = hit.slice(0, a.modifier);
      for (const u of hit) { u.x = (dest.left + dest.right) / 2; u.y = (dest.top + dest.bottom) / 2; }
      return {};
    }
    case ActionType.MoveLocation: {
      if (a.location === 0 || a.target === 0 || a.target === 64) return {};
      const r = world.locations[a.target];
      const u = unitsOf(s, world, slots(a.player), a.unitId, a.location)[0];
      if (!r || !u) return {};
      const w = r.right - r.left, h = r.bottom - r.top;
      world.locations[a.target] = { left: u.x - w / 2, top: u.y - h / 2, right: u.x + w / 2, bottom: u.y + h / 2 };
      return {};
    }
    case ActionType.SetAllianceStatus: {
      for (const p of slots(a.player)) if (p !== current) s.allied[current][p] = a.unitId !== AllianceStatus.Enemy;
      return {};
    }
    case ActionType.RunAiScript: case ActionType.RunAiScriptAt: note("An AI script runs here in the game; the dry run does not have one."); return {};
    case ActionType.Order: note("An order is given here; the dry run does not move units."); return {};
    case ActionType.SetNextScenario: note(`The next scenario is set to "${text(a.text)}".`); return {};
    case ActionType.PlayWav: note("A sound plays here."); return {};
    default: return {};
  }
}

const isPreserved = (t: TriggerRecord): boolean => (t.flags & TriggerFlag.Preserve) !== 0 || liveActions(t).some((a) => a.type === ActionType.PreserveTrigger && !isActionDisabled(a));

/** Run the actions of trigger `i` for a player from action `from`; true when a Wait stopped them. */
function runActions(list: readonly TriggerRecord[], i: number, from: number, player: number, s: SimState, world: SimWorld): boolean {
  const t = list[i];
  const actions = liveActions(t);
  for (let j = from; j < actions.length; j++) {
    const a = actions[j];
    if (isActionDisabled(a)) continue;
    const out = runAction(a, i, player, s, world);
    if (out.wait !== undefined) {
      s.players[player].wait = { until: s.seconds + out.wait, trigger: i, action: j + 1 };
      s.log.push({ cycle: s.cycle, player, trigger: i, kind: "wait", seconds: out.wait });
      return true;
    }
    if (s.players[player].result !== null) return true;
  }
  return false;
}

function runPlayer(list: readonly TriggerRecord[], player: number, s: SimState, world: SimWorld): number[] {
  const fired: number[] = [];
  const p = s.players[player];
  if (p.result !== null) return fired;
  let start = 0;
  if (p.wait) {
    if (s.seconds < p.wait.until - 1e-9) return fired;
    const { trigger, action } = p.wait;
    p.wait = null;
    if (runActions(list, trigger, action, player, s, world)) return fired;
    start = trigger + 1;
  }
  for (let i = start; i < list.length; i++) {
    const t = list[i];
    if (!runsFor(t, player, world) || s.spent.has(i * 16 + player)) continue;
    let ok = true;
    liveConditions(t).forEach((c, k) => {
      if (!ok || isConditionDisabled(c)) return;
      const key = assumptionKey(i, k);
      const v = evaluate(c, player, s, world, key);
      if (!v.known) s.unknown.set(key, { key, trigger: i, condition: k, player });
      if (!v.ok) ok = false;
    });
    if (!ok) continue;
    fired.push(i);
    s.log.push({ cycle: s.cycle, player, trigger: i, kind: "fired" });
    if (!isPreserved(t)) s.spent.add(i * 16 + player);
    if (runActions(list, i, 0, player, s, world)) return fired;
  }
  return fired;
}

/** Run one trigger cycle over the list. Returns which triggers fired, in order. */
export function cycle(list: readonly TriggerRecord[], s: SimState, world: SimWorld = DEFAULT_WORLD): number[] {
  s.cycle++;
  const fired: number[] = [];
  for (let player = 0; player < HUMAN_PLAYERS; player++) {
    if (!world.active[player]) continue;
    fired.push(...runPlayer(list, player, s, world));
  }
  const dt = secondsPerCycle(world);
  s.seconds += dt;
  if (!s.countdownPaused && s.countdown > 0) s.countdown = Math.max(0, s.countdown - dt);
  return fired;
}

/** Whether every active player has a result: nothing more will happen. */
export const isOver = (s: SimState, world: SimWorld): boolean => range(HUMAN_PLAYERS).every((p) => !world.active[p] || s.players[p].result !== null);

/**
 * Run up to `max` cycles, stopping early when the game is over for everyone, or when
 * nothing has fired or waited for `idle` cycles in a row — a trigger `counts` says no
 * to (a generated run, the every-frame switch) is not something happening. Returns how
 * many cycles ran.
 */
export function run(list: readonly TriggerRecord[], s: SimState, world: SimWorld, max: number, idle = 50, counts: (trigger: number) => boolean = () => true): number {
  let quiet = 0, n = 0;
  for (; n < max; n++) {
    const fired = cycle(list, s, world).filter(counts);
    const waiting = s.players.some((p) => p.wait !== null);
    quiet = fired.length || waiting ? 0 : quiet + 1;
    if (isOver(s, world) || quiet >= idle) { n++; break; }
  }
  return n;
}
