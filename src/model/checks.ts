/**
 * What is wrong with a trigger, as lines under its rows: pure functions over the record
 * and a little context (what exists on the map, what the map's settings say).
 */
import { ActionType, Comparison, ConditionType, TriggerFlag, MAX_ACTIONS, MAX_CONDITIONS, type TriggerRecord } from "../../vendor/triggers";
import { actionDef, conditionDef } from "../../vendor/triggerDefs";
import { recognizeAction, recognizeCondition, isEud, accessOf } from "./eud";
import { liveActions, liveConditions, owners, isActionDisabled, isConditionDisabled } from "./records";
import { cellKey, playerSlots } from "./counters";

export interface Problem {
  level: "error" | "warn" | "info";
  text: string;
  /** The row the problem is on, when it is one row's. */
  at?: { kind: "condition" | "action"; index: number };
}

export interface CheckContext {
  /** Triggers run every frame (the map's every-frame switch is on). */
  everyFrame?: boolean;
  /** Whether a 1-based location number names a location that exists. */
  locationExists?(number: number): boolean;
  stringExists?(index: number): boolean;
  wavPresent?(index: number): boolean;
  /** Cells (`cellKey`) another plugin's generated triggers own. */
  claimedCells?: ReadonlySet<number>;
  /** The trigger is a per-player template: it owns no player on purpose. */
  template?: boolean;
}

const LOCATION_ANYWHERE = 64;

export function check(trigger: TriggerRecord, ctx: CheckContext = {}): Problem[] {
  const out: Problem[] = [];
  const conditions = liveConditions(trigger);
  const actions = liveActions(trigger);
  const own = owners(trigger);

  if (own.length === 0 && !ctx.template) out.push({ level: "error", text: "No player owns this trigger, so it never runs." });
  if (actions.length === 0) out.push({ level: "warn", text: "This trigger has no actions." });
  if (conditions.length >= MAX_CONDITIONS) out.push({ level: "info", text: "All 16 condition slots are used." });
  if (actions.length >= MAX_ACTIONS) out.push({ level: "info", text: "All 64 action slots are used." });

  const enabledConditions = conditions.map((c, index) => ({ c, index })).filter(({ c }) => !isConditionDisabled(c));
  if (enabledConditions.some(({ c }) => c.type === ConditionType.Never)) out.push({ level: "warn", text: "A Never condition means this trigger never fires." });

  // Contradictions between two conditions on the same thing.
  for (let i = 0; i < enabledConditions.length; i++) for (let j = i + 1; j < enabledConditions.length; j++) {
    const a = enabledConditions[i].c, b = enabledConditions[j].c;
    if (a.type !== b.type || a.player !== b.player || a.unitId !== b.unitId || a.location !== b.location || a.resource !== b.resource || a.mask !== b.mask) continue;
    const def = conditionDef(a.type);
    if (!def?.args.some((x) => x.kind === "comparison")) continue;
    const lo = a.comparison === Comparison.AtLeast ? a : b.comparison === Comparison.AtLeast ? b : null;
    const hi = a.comparison === Comparison.AtMost ? a : b.comparison === Comparison.AtMost ? b : null;
    if (lo && hi && lo.amount > hi.amount) out.push({ level: "warn", text: `Conditions ${enabledConditions[i].index + 1} and ${enabledConditions[j].index + 1} contradict each other: at least ${lo.amount} and at most ${hi.amount}.` });
    if (a.comparison === Comparison.Exactly && b.comparison === Comparison.Exactly && a.amount !== b.amount) out.push({ level: "warn", text: `Conditions ${enabledConditions[i].index + 1} and ${enabledConditions[j].index + 1} contradict each other: exactly ${a.amount} and exactly ${b.amount}.` });
  }

  // A switch is one flag for everyone; a trigger every player runs, guarding per-player conditions
  // with it, lets one player's run flip it for the rest (a computer's run cleared the probe's guard).
  const sharedOwner = own.some((o) => o >= 12);
  const perPlayer = enabledConditions.some(({ c }) => c.type === ConditionType.Deaths && c.player === 13);
  const usesSwitch = enabledConditions.some(({ c }) => c.type === ConditionType.Switch) && actions.some((a) => a.type === ActionType.SetSwitch && !isActionDisabled(a));
  if (sharedOwner && perPlayer && usesSwitch) out.push({ level: "warn", text: "Every owner runs this trigger, and its switch is shared: when the Current Player condition is false for one of them, that run can flip the switch for the others. Guard with a death counter of the Current Player instead." });

  const preserved = (trigger.flags & TriggerFlag.Preserve) !== 0 || actions.some((a) => a.type === ActionType.PreserveTrigger && !isActionDisabled(a));
  actions.forEach((a, index) => {
    if (isActionDisabled(a)) return;
    const at = { kind: "action" as const, index };
    if (a.type === ActionType.Wait || a.type === ActionType.Transmission) {
      if (preserved) out.push({ level: "warn", text: "A Wait in a preserved trigger holds up every other trigger of its owner while it waits, every cycle.", at });
      if (ctx.everyFrame) out.push({ level: "warn", text: "With triggers running every frame, a Wait blocks the owner's other triggers for its whole length.", at });
    }
    const def = actionDef(a.type);
    if (def) {
      for (const arg of def.args) {
        const value = a[arg.field as keyof typeof a] as number;
        if (arg.kind === "location") {
          if (value === 0) out.push({ level: "warn", text: `${def.name} names no location.`, at });
          else if (value !== LOCATION_ANYWHERE && ctx.locationExists && !ctx.locationExists(value)) out.push({ level: "error", text: `${def.name} names location ${value}, which the map no longer has.`, at });
        }
        if (arg.kind === "text" && value !== 0 && ctx.stringExists && !ctx.stringExists(value)) out.push({ level: "error", text: `${def.name} names string ${value}, which the map does not have.`, at });
        if (arg.kind === "text" && value === 0 && (a.type === ActionType.DisplayText || a.type === ActionType.SetMissionObjectives)) out.push({ level: "warn", text: `${def.name} has no text.`, at });
        if (arg.kind === "wav" && value !== 0 && ctx.wavPresent && !ctx.wavPresent(value)) out.push({ level: "warn", text: `The sound of ${def.name} is not in the map.`, at });
      }
    }
    if (a.type === ActionType.SetDeaths) {
      if (isEud(a.player)) {
        const row = recognizeAction(a);
        if (!row) {
          const access = accessOf(a.player, a.unitId, a.mask, a.location);
          out.push({ level: "info", text: `Writes memory at 0x${access!.address.toString(16).toUpperCase()}, which the catalogue does not know.`, at });
        } else if (!row.entry.remastered.write) out.push({ level: "error", text: `Remastered does not let a trigger write ${row.entry.name.toLowerCase()}.`, at });
      } else if (ctx.claimedCells && a.unitId < 228) {
        for (const p of playerSlots(a.player, own)) if (ctx.claimedCells.has(cellKey(p, a.unitId))) { out.push({ level: "warn", text: "This death counter is used by another plugin's generated triggers.", at }); break; }
      }
    }
  });

  conditions.forEach((c, index) => {
    if (isConditionDisabled(c)) return;
    const at = { kind: "condition" as const, index };
    const def = conditionDef(c.type);
    if (def) for (const arg of def.args) {
      const value = c[arg.field as keyof typeof c] as number;
      if (arg.kind === "location" && value !== 0 && value !== LOCATION_ANYWHERE && ctx.locationExists && !ctx.locationExists(value)) out.push({ level: "error", text: `${def.name} names location ${value}, which the map no longer has.`, at });
      if (arg.kind === "location" && value === 0) out.push({ level: "warn", text: `${def.name} names no location.`, at });
    }
    if (c.type === ConditionType.Deaths && isEud(c.player) && !recognizeCondition(c)) {
      const access = accessOf(c.player, c.unitId, c.mask, c.location);
      out.push({ level: "info", text: `Reads memory at 0x${access!.address.toString(16).toUpperCase()}, which the catalogue does not know.`, at });
    }
    if (c.type === ConditionType.Deaths && !isEud(c.player) && ctx.claimedCells && c.unitId < 228) {
      for (const p of playerSlots(c.player, own)) if (ctx.claimedCells.has(cellKey(p, c.unitId))) { out.push({ level: "warn", text: "This death counter is used by another plugin's generated triggers.", at }); break; }
    }
  });

  return out;
}
