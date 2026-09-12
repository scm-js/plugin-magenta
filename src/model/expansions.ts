/**
 * Tier A+: things a map maker asks for as one action or condition that the game has no
 * record for, done as a run of ordinary triggers — Remastered's masked reads make each
 * bit of a counter testable without subtracting it, so a copy is one trigger per bit and
 * lands in the same cycle.
 *
 * An action expansion hangs off the trigger that asks for it (the *anchor*): the anchor
 * gets one action of its own, `flag := 1` on a private cell, and the generated run
 * follows the anchor in the list, every trigger of it conditioned on `flag == 1`, with a
 * last trigger that clears the flag. The run fires in the cycle the anchor fires, after
 * it, whatever the anchor's own conditions and actions do. A condition expansion
 * (compare two counters) runs every cycle *before* its anchor and leaves the answer in
 * two scratch cells the anchor's conditions read.
 *
 * Every trigger of a run carries a Comment naming the expansion, and the first and last
 * carry `begin` / `end` markers, which is how `locate` finds the run again by content —
 * the claim the editor fences — after any other tool has had the file.
 */
import { ActionType, Comparison, ConditionType, PlayerGroup, SetModifier, emptyAction, emptyCondition, emptyTrigger, type ActionRecord, type ConditionRecord, type TriggerRecord } from "../../vendor/triggers";
import { addressOf, epd, MASK_MARKER } from "./eud";
import { commentIndex, liveActions, liveConditions, setOwners } from "./records";
import type { Cell } from "./counters";

export type ExpansionKind = "copy" | "add" | "subtract" | "compare" | "forEachPlayer";

export interface CounterExpansion {
  id: string;
  kind: "copy" | "add" | "subtract";
  /** Read from. */
  from: Cell;
  /** Written to. */
  to: Cell;
  /** How many low bits to carry; 32 covers any count, 16 is half the triggers for counters that stay small. */
  bits?: number;
}

export interface CompareExpansion {
  id: string;
  kind: "compare";
  a: Cell;
  b: Cell;
  /** `a − b` clamped at 0, and `b − a` clamped at 0: what the anchor's conditions read. */
  scratch: [Cell, Cell];
  bits?: number;
}

export interface ForEachPlayerExpansion {
  id: string;
  kind: "forEachPlayer";
  /** The `PlayerGroup` value in the anchor that stands for "the player". */
  placeholder: number;
  /** The players (0-based) to make a copy for. */
  players: number[];
}

export type Expansion = CounterExpansion | CompareExpansion | ForEachPlayerExpansion;

/** The private cell the anchor sets to run its action expansions. */
export interface Flag {
  cell: Cell;
}

export const MARKER_PREFIX = "magenta:";
export const beginMarker = (id: string) => `${MARKER_PREFIX}begin:${id}`;
export const endMarker = (id: string) => `${MARKER_PREFIX}end:${id}`;
export const rowMarker = (id: string) => `${MARKER_PREFIX}${id}`;

/** A masked read of one bit of a counter cell: `DeathsX(cell, Exactly, 1 << bit, mask 1 << bit)`. */
function bitCondition(cell: Cell, bit: number): ConditionRecord {
  return { ...emptyCondition(), type: ConditionType.Deaths, player: epd(addressOf(cell[0], cell[1])), unitId: 0, comparison: Comparison.Exactly, amount: (1 << bit) >>> 0, location: (1 << bit) >>> 0, mask: MASK_MARKER };
}

function deathsIs(cell: Cell, comparison: number, amount: number): ConditionRecord {
  return { ...emptyCondition(), type: ConditionType.Deaths, player: cell[0], unitId: cell[1], comparison, amount };
}

function setDeaths(cell: Cell, modifier: number, amount: number): ActionRecord {
  return { ...emptyAction(), type: ActionType.SetDeaths, player: cell[0], unitId: cell[1], modifier, target: amount >>> 0 };
}

const preserve = (): ActionRecord => ({ ...emptyAction(), type: ActionType.PreserveTrigger });
const comment = (text: number): ActionRecord => ({ ...emptyAction(), type: ActionType.Comment, text });

/** Strings the run needs, interned by the caller: the row marker, and the begin / end markers. */
export interface Markers {
  row: number;
  begin: number;
  end: number;
}

function trigger(owners: number[], conditions: ConditionRecord[], actions: ActionRecord[]): TriggerRecord {
  return setOwners({ ...emptyTrigger(), conditions, actions }, owners);
}

/** The anchor's own action for its expansions: `flag := 1`. */
export const flagAction = (flag: Flag): ActionRecord => setDeaths(flag.cell, SetModifier.SetTo, 1);

/** Whether an action is the flag-setting action of an expansion on `flag`. */
export const isFlagAction = (a: ActionRecord, flag: Flag): boolean =>
  a.type === ActionType.SetDeaths && a.player === flag.cell[0] && a.unitId === flag.cell[1] && a.modifier === SetModifier.SetTo && a.target === 1;

/**
 * The run for a counter expansion, to place right after the anchor. `owners` are the
 * anchor's; `flag` the anchor's private cell. The first trigger clears the target for a
 * copy; one trigger per bit carries it; the last clears the flag.
 */
export function counterRun(x: CounterExpansion, owners: number[], flag: Flag, markers: Markers): TriggerRecord[] {
  const bits = x.bits ?? 32;
  const gate = deathsIs(flag.cell, Comparison.Exactly, 1);
  const out: TriggerRecord[] = [];
  const mark = (i: number, n: number) => comment(i === 0 ? markers.begin : i === n - 1 ? markers.end : markers.row);
  const rows: { conditions: ConditionRecord[]; actions: ActionRecord[] }[] = [];
  if (x.kind === "copy") rows.push({ conditions: [gate], actions: [setDeaths(x.to, SetModifier.SetTo, 0)] });
  const modifier = x.kind === "subtract" ? SetModifier.Subtract : SetModifier.Add;
  for (let bit = bits - 1; bit >= 0; bit--) rows.push({ conditions: [gate, bitCondition(x.from, bit)], actions: [setDeaths(x.to, modifier, (1 << bit) >>> 0)] });
  rows.push({ conditions: [gate], actions: [setDeaths(flag.cell, SetModifier.SetTo, 0)] });
  rows.forEach((r, i) => out.push(trigger(owners, r.conditions, [...r.actions, preserve(), mark(i, rows.length)])));
  return out;
}

/**
 * The run for a comparison, to place right *before* the anchor and run every cycle:
 * `scratch[0] := a; scratch[0] −= b; scratch[1] := b; scratch[1] −= a`. The anchor then
 * tests `scratch[0] ≥ 1` for a > b, `scratch[1] == 0` for a ≥ b, both 0 for a == b. There is no `!=`: it would need an OR, and a trigger's conditions are ANDed.
 */
export function compareRun(x: CompareExpansion, owners: number[], markers: Markers): TriggerRecord[] {
  const bits = x.bits ?? 32;
  const [d, e] = x.scratch;
  const rows: { conditions: ConditionRecord[]; actions: ActionRecord[] }[] = [];
  rows.push({ conditions: [], actions: [setDeaths(d, SetModifier.SetTo, 0), setDeaths(e, SetModifier.SetTo, 0)] });
  for (let bit = bits - 1; bit >= 0; bit--) rows.push({ conditions: [bitCondition(x.a, bit)], actions: [setDeaths(d, SetModifier.Add, (1 << bit) >>> 0)] });
  for (let bit = bits - 1; bit >= 0; bit--) rows.push({ conditions: [bitCondition(x.b, bit)], actions: [setDeaths(e, SetModifier.Add, (1 << bit) >>> 0)] });
  // d = a, e = b. Now d −= b and e −= a, each clamped at 0 by the game.
  for (let bit = bits - 1; bit >= 0; bit--) rows.push({ conditions: [bitCondition(x.b, bit)], actions: [setDeaths(d, SetModifier.Subtract, (1 << bit) >>> 0)] });
  for (let bit = bits - 1; bit >= 0; bit--) rows.push({ conditions: [bitCondition(x.a, bit)], actions: [setDeaths(e, SetModifier.Subtract, (1 << bit) >>> 0)] });
  const out: TriggerRecord[] = [];
  rows.forEach((r, i) => out.push(trigger(owners, r.conditions, [...r.actions, preserve(), comment(i === 0 ? markers.begin : i === rows.length - 1 ? markers.end : markers.row)])));
  return out;
}

/** The conditions the anchor uses to read a comparison's answer. */
export function compareConditions(x: CompareExpansion, relation: ">" | ">=" | "==" | "<" | "<="): ConditionRecord[] {
  const [d, e] = x.scratch;
  switch (relation) {
    case ">": return [deathsIs(d, Comparison.AtLeast, 1)];
    case ">=": return [deathsIs(e, Comparison.Exactly, 0)];
    case "==": return [deathsIs(d, Comparison.Exactly, 0), deathsIs(e, Comparison.Exactly, 0)];
    case "<": return [deathsIs(e, Comparison.AtLeast, 1)];
    case "<=": return [deathsIs(d, Comparison.Exactly, 0)];
  }
}

/** One copy of the anchor per player, the placeholder group replaced, each owned by that player alone. */
export function forEachPlayerRun(x: ForEachPlayerExpansion, anchor: TriggerRecord, markers: Markers): TriggerRecord[] {
  const swap = (v: number, p: number) => (v === x.placeholder ? p : v);
  return x.players.map((p, i) => {
    const t: TriggerRecord = {
      ...anchor,
      conditions: liveConditions(anchor).map((c) => ({ ...c, player: swap(c.player, p) })),
      actions: liveActions(anchor).filter((a) => a.type !== ActionType.Comment).map((a) => ({ ...a, player: swap(a.player, p), target: a.type === ActionType.GiveUnits ? swap(a.target, p) : a.target })),
      players: anchor.players.map(() => 0),
    };
    t.actions.push(comment(i === 0 ? markers.begin : i === x.players.length - 1 ? markers.end : markers.row));
    return setOwners(t, [x.placeholder === PlayerGroup.CurrentPlayer ? p : p]);
  });
}

/** Where a run sits in `list`, found by its begin and end markers; `text` reads the string table. */
export function locateRun(list: readonly TriggerRecord[], id: string, text: (index: number) => string | null): { start: number; count: number } | null {
  const begin = beginMarker(id), end = endMarker(id);
  let start = -1;
  for (let i = 0; i < list.length; i++) {
    const ci = commentIndex(list[i]);
    if (ci < 0) continue;
    const s = text(list[i].actions[ci].text);
    if (s === begin) start = i;
    if (s === end && start >= 0) return { start, count: i - start + 1 };
  }
  return null;
}

/** The expansion id a trigger's marker comment names, or null. */
export function markerOf(trigger: TriggerRecord, text: (index: number) => string | null): { id: string; edge: "begin" | "end" | null } | null {
  const ci = commentIndex(trigger);
  if (ci < 0) return null;
  const s = text(trigger.actions[ci].text);
  if (!s || !s.startsWith(MARKER_PREFIX)) return null;
  const rest = s.slice(MARKER_PREFIX.length);
  if (rest.startsWith("begin:")) return { id: rest.slice(6), edge: "begin" };
  if (rest.startsWith("end:")) return { id: rest.slice(4), edge: "end" };
  return { id: rest, edge: null };
}
