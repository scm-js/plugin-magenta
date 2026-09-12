/**
 * A small interpreter for the triggers the expansions generate: death counters, masked
 * EUD reads and writes of those same cells, switches, Always, Never and Preserve. It
 * runs the list the way the game does — one cycle is every player in order, each
 * player's triggers in list order, a trigger firing once and then disabled unless
 * preserved — so a test can prove a copy lands in one cycle. Anything else is ignored.
 */
import { ActionType, Comparison, ConditionType, PlayerGroup, SetModifier, SwitchAction, SwitchState, TriggerFlag, type TriggerRecord } from "../../vendor/triggers";
import { MASK_MARKER } from "./eud";
import { liveActions, liveConditions, isActionDisabled, isConditionDisabled } from "./records";

export interface SimState {
  /** Death counts by flat dword index into the table: `player + unit × 12`. */
  deaths: Map<number, number>;
  switches: Set<number>;
  /** Triggers that fired and are not preserved. */
  spent: Set<number>;
}

const HUMAN_PLAYERS = 8;
export const flat = (player: number, unit: number): number => player + unit * 12;

export function newState(): SimState {
  return { deaths: new Map(), switches: new Set(), spent: new Set() };
}

export const getDeaths = (s: SimState, player: number, unit: number): number => s.deaths.get(flat(player, unit)) ?? 0;
export const setDeaths = (s: SimState, player: number, unit: number, value: number): void => { s.deaths.set(flat(player, unit), value >>> 0); };

/** The flat cells a player field of a record means for the player running the trigger. */
function cells(player: number, unit: number, current: number): number[] {
  if (player >= 27) return [player + unit * 12];
  if (player < 12) return [flat(player, unit)];
  if (player === PlayerGroup.CurrentPlayer) return [flat(current, unit)];
  if (player === PlayerGroup.AllPlayers) return Array.from({ length: 12 }, (_, p) => flat(p, unit));
  return [];
}

function owns(t: TriggerRecord, player: number): boolean {
  return !!(t.players[player] || t.players[PlayerGroup.AllPlayers]);
}

function compare(cmp: number, have: number, want: number): boolean {
  if (cmp === Comparison.AtLeast) return have >= want;
  if (cmp === Comparison.AtMost) return have <= want;
  return have === want;
}

/** Run one trigger cycle over the list. Returns which triggers fired, in order. */
export function cycle(list: readonly TriggerRecord[], s: SimState): number[] {
  const fired: number[] = [];
  for (let player = 0; player < HUMAN_PLAYERS; player++) {
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!owns(t, player) || s.spent.has(i * 16 + player)) continue;
      let ok = true;
      for (const c of liveConditions(t)) {
        if (isConditionDisabled(c)) continue;
        if (c.type === ConditionType.Always) continue;
        if (c.type === ConditionType.Never) { ok = false; break; }
        if (c.type === ConditionType.Switch) { if ((c.comparison === SwitchState.Set) !== s.switches.has(c.resource)) { ok = false; break; } continue; }
        if (c.type === ConditionType.Deaths) {
          const mask = c.mask === MASK_MARKER ? c.location >>> 0 : 0xffffffff;
          const sum = cells(c.player, c.unitId, player).reduce((n, cell) => n + ((s.deaths.get(cell) ?? 0) & mask) >>> 0, 0);
          if (!compare(c.comparison, sum >>> 0, c.amount >>> 0)) { ok = false; break; }
          continue;
        }
        // Anything else is taken as true — the simulator only knows counters.
      }
      if (!ok) continue;
      fired.push(i);
      let preserved = (t.flags & TriggerFlag.Preserve) !== 0;
      for (const a of liveActions(t)) {
        if (isActionDisabled(a)) continue;
        if (a.type === ActionType.PreserveTrigger) preserved = true;
        else if (a.type === ActionType.SetSwitch) {
          if (a.modifier === SwitchAction.Set) s.switches.add(a.target);
          else if (a.modifier === SwitchAction.Clear) s.switches.delete(a.target);
          else if (a.modifier === SwitchAction.Toggle) { if (s.switches.has(a.target)) s.switches.delete(a.target); else s.switches.add(a.target); }
        } else if (a.type === ActionType.SetDeaths) {
          const mask = a.mask === MASK_MARKER ? a.location >>> 0 : 0xffffffff;
          for (const cell of cells(a.player, a.unitId, player)) {
            const old = s.deaths.get(cell) ?? 0;
            const field = (old & mask) >>> 0;
            let next: number;
            if (a.modifier === SetModifier.SetTo) next = a.target & mask;
            else if (a.modifier === SetModifier.Add) next = ((field + a.target) >>> 0) & mask;
            else next = Math.max(0, field - a.target) & mask;
            s.deaths.set(cell, ((old & ~mask) | next) >>> 0);
          }
        }
      }
      if (!preserved) s.spent.add(i * 16 + player);
    }
  }
  return fired;
}
