/**
 * A trigger in plain words, and what it shares with the rest of the list. The
 * sentences themselves come from the caller (they need the map's names); this
 * decides the shape — who runs it, when it fires, once or every cycle, how long its
 * Waits hold — and finds the switches, counters, locations and the timer that other
 * triggers set or read too.
 */
import { ActionType, ConditionType, PlayerGroup, TriggerFlag, type TriggerRecord } from "../../vendor/triggers";
import { actionDef, conditionDef } from "../../vendor/triggerDefs";
import { isEud } from "./eud";
import { cellKey, playerSlots } from "./counters";
import { isActionDisabled, isConditionDisabled, liveActions, liveConditions, owners } from "./records";

export interface ExplainInput {
  /** The live conditions as sentences, in order (disabled ones included; they are skipped by their flag). */
  conditions: string[];
  /** The live actions as sentences, in order, with the title's Comment as an empty string. */
  actions: string[];
  player(group: number): string;
  /** A per-player template: the players it is copied for, and the group that stands for each. */
  perPlayer?: { players: number[]; placeholder: number } | null;
  everyFrame: boolean;
  /** The trigger a generated run belongs to (the list index of its anchor), so a run counts as that trigger. */
  anchorOf?: (index: number) => number;
}

export type RefKind = "switch" | "counter" | "memory" | "location" | "timer";
export type Use = "reads" | "writes" | "both";

export interface Ref {
  kind: RefKind;
  /** What names it: the switch index, a counter's `cellKey`, an EUD address, a location number, 0 for the timer. */
  id: number;
  use: Use;
  /** Other triggers that touch the same thing. */
  others: { index: number; use: Use }[];
}

export interface Explanation {
  lines: string[];
  refs: Ref[];
}

const join = (parts: string[], word: string): string => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`);

/** A sentence after "when" or "then": its leading verb in lower case; a name stays as it is. */
const VERBS = new Set(["show", "set", "end", "unpause", "run", "remove", "pause", "kill", "create", "center", "wait", "unmute", "play", "ping", "order", "mute", "move", "load", "give", "enable", "display", "disable", "add", "make", "name", "the", "vision", "invincibility", "placed", "copy", "subtract", "compare", "count", "read", "pick", "for", "every", "while"]);
const lower = (s: string): string => {
  const word = s.split(/\s/, 1)[0] ?? "";
  return VERBS.has(word.toLowerCase()) ? s[0].toLowerCase() + s.slice(1) : s;
};

/** How long the trigger's Waits and Transmissions hold, in seconds. */
export function waitSeconds(trigger: TriggerRecord): number {
  let ms = 0;
  for (const a of liveActions(trigger)) {
    if (isActionDisabled(a)) continue;
    if (a.type === ActionType.Wait) ms += a.time;
    if (a.type === ActionType.Transmission) ms += a.modifier === 8 ? a.time + a.target : a.modifier === 9 ? Math.max(0, a.time - a.target) : a.modifier === 7 ? a.target : a.time;
  }
  return Math.round(ms / 100) / 10;
}

export const isPreserved = (t: TriggerRecord): boolean => (t.flags & TriggerFlag.Preserve) !== 0 || liveActions(t).some((a) => a.type === ActionType.PreserveTrigger && !isActionDisabled(a));

function usesCurrentPlayer(t: TriggerRecord): boolean {
  return liveConditions(t).some((c) => !isConditionDisabled(c) && c.player === PlayerGroup.CurrentPlayer) || liveActions(t).some((a) => !isActionDisabled(a) && (a.player === PlayerGroup.CurrentPlayer || (a.type === ActionType.GiveUnits && a.target === PlayerGroup.CurrentPlayer)));
}

export function explain(trigger: TriggerRecord, index: number, list: readonly TriggerRecord[], input: ExplainInput): Explanation {
  const lines: string[] = [];
  const own = owners(trigger);

  /* Who */
  if (input.perPlayer) lines.push(`Runs once for each of ${join(input.perPlayer.players.map(input.player), "and")}, with ${input.player(input.perPlayer.placeholder)} standing for the player in every condition and action.`);
  else if (own.length === 0) lines.push("No player owns this trigger, so it never runs.");
  else if (own.length === 1 && own[0] === PlayerGroup.AllPlayers) lines.push("Every player runs this trigger, each on their own.");
  else if (own.length === 1) lines.push(`${input.player(own[0])} runs this trigger.`);
  else lines.push(`${join(own.map(input.player), "and")} each run this trigger on their own.`);

  /* When */
  const conditions = liveConditions(trigger);
  const live = conditions.map((c, i) => ({ c, text: input.conditions[i] ?? "" })).filter(({ c }) => !isConditionDisabled(c));
  const skipped = conditions.length - live.length;
  const never = live.some(({ c }) => c.type === ConditionType.Never);
  const always = live.every(({ c }) => c.type === ConditionType.Always);
  const actions = liveActions(trigger);
  const does = actions.map((a, i) => ({ a, text: input.actions[i] ?? "" })).filter(({ a, text }) => !isActionDisabled(a) && a.type !== ActionType.Comment && a.type !== ActionType.PreserveTrigger && text);

  if (never) lines.push("A Never condition means it never fires.");
  else {
    if (always) lines.push("It fires on the first cycle.");
    else {
      const when = live.filter(({ c }) => c.type !== ConditionType.Always).map((x) => lower(x.text));
      lines.push(`It fires when ${join(when, "and")}${when.length === 2 ? " both hold" : when.length > 2 ? " all hold" : ""}.`);
    }
    lines.push(does.length ? `Then: ${does.map((d) => lower(d.text)).join("; ")}.` : "It does nothing when it fires.");
  }
  if (skipped) lines.push(skipped === 1 ? "One disabled condition is ignored." : `${skipped} disabled conditions are ignored.`);

  /* How often */
  const clock = input.everyFrame ? "every frame" : "every two seconds";
  if (!never && own.length) {
    if (isPreserved(trigger)) lines.push(always ? `It is preserved, so it runs again every cycle (${clock}).` : `It is preserved, so it fires again on every cycle (${clock}) its conditions hold.`);
    else lines.push(own.length > 1 || own[0] === PlayerGroup.AllPlayers || input.perPlayer ? "It fires once for each owner and then stops." : "It fires once and then stops.");
  }
  const wait = waitSeconds(trigger);
  if (wait > 0) lines.push(`Its Waits hold the owner's other triggers for ${wait} second${wait === 1 ? "" : "s"} in all${isPreserved(trigger) ? ", every time it fires" : ""}.`);
  if (usesCurrentPlayer(trigger) && (own.length > 1 || own[0] >= 12 || input.perPlayer)) lines.push("Current Player is whichever owner is running it.");

  return { lines, refs: refsOf(list, index, input.anchorOf) };
}

/* ── What the trigger shares with the list ── */

type Touch = Map<string, { kind: RefKind; id: number; use: Use }>;

const merge = (a: Use | undefined, b: Use): Use => (a === undefined || a === b ? b : "both");

function touches(t: TriggerRecord): Touch {
  const out: Touch = new Map();
  const add = (kind: RefKind, id: number, use: Use) => {
    const key = `${kind}:${id}`;
    const old = out.get(key);
    out.set(key, { kind, id, use: merge(old?.use, use) });
  };
  const own = owners(t);
  const counter = (player: number, unit: number, use: Use) => {
    if (isEud(player)) {
      // An address inside the deaths table is a counter cell read the EUD way (a masked bit, a run's scratch): the same thing.
      const k = player + unit * 12;
      if (k < 228 * 12) add("counter", k, use); else add("memory", (0x58a364 + k * 4) >>> 0, use);
      return;
    }
    if (unit >= 228) return;
    for (const p of playerSlots(player, own)) add("counter", cellKey(p, unit), use);
  };
  for (const c of liveConditions(t)) {
    if (isConditionDisabled(c)) continue;
    if (c.type === ConditionType.Switch) add("switch", c.resource, "reads");
    else if (c.type === ConditionType.Deaths) counter(c.player, c.unitId, "reads");
    else if (c.type === ConditionType.CountdownTimer) add("timer", 0, "reads");
    const def = conditionDef(c.type);
    if (def) for (const arg of def.args) if (arg.kind === "location") { const n = c[arg.field] as number; if (n > 0 && n < 64) add("location", n, "reads"); }
  }
  for (const a of liveActions(t)) {
    if (isActionDisabled(a)) continue;
    if (a.type === ActionType.SetSwitch) add("switch", a.target, "writes");
    else if (a.type === ActionType.SetDeaths) counter(a.player, a.unitId, "writes");
    else if (a.type === ActionType.SetCountdownTimer || a.type === ActionType.PauseTimer || a.type === ActionType.UnpauseTimer) add("timer", 0, "writes");
    else if (a.type === ActionType.MoveLocation) { if (a.target > 0 && a.target < 64) add("location", a.target, "writes"); if (a.location > 0 && a.location < 64) add("location", a.location, "reads"); continue; }
    const def = actionDef(a.type);
    if (def) for (const arg of def.args) if (arg.kind === "location") { const n = a[arg.field] as number; if (n > 0 && n < 64) add("location", n, "reads"); }
  }
  return out;
}

function mergeInto(into: Touch, from: Touch): void {
  for (const [key, x] of from) { const old = into.get(key); into.set(key, { ...x, use: merge(old?.use, x.use) }); }
}

/**
 * What the trigger at `index` touches that the list shares, with the other triggers on
 * each. A generated run counts as the trigger that asked for it (`anchorOf`), on both sides.
 */
export function refsOf(list: readonly TriggerRecord[], index: number, anchorOf: (i: number) => number = (i) => i): Ref[] {
  const mine: Touch = new Map();
  const theirs = new Map<number, Touch>();
  list.forEach((t, i) => {
    const at = anchorOf(i);
    if (at === index) { mergeInto(mine, touches(t)); return; }
    const acc = theirs.get(at) ?? new Map();
    mergeInto(acc, touches(t));
    theirs.set(at, acc);
  });
  if (!mine.size) return [];
  const refs: Ref[] = [...mine.values()].map((x) => ({ ...x, others: [] }));
  for (const [at, touch] of [...theirs.entries()].sort((a, b) => a[0] - b[0])) {
    for (const r of refs) { const hit = touch.get(`${r.kind}:${r.id}`); if (hit) r.others.push({ index: at, use: hit.use }); }
  }
  // Locations only every trigger reads are noise; a switch or counter is worth a line even when it is this trigger's alone.
  return refs.filter((r) => r.kind !== "location" || r.others.some((o) => o.use !== "reads") || r.use !== "reads").sort((a, b) => b.others.length - a.others.length);
}

