/**
 * What is wrong with a trigger, as lines under its rows: pure functions over the record
 * and a little context (what exists on the map, what the map's settings say).
 */
import { ActionType, Comparison, ConditionType, TriggerFlag, MAX_ACTIONS, MAX_CONDITIONS, type ActionRecord, type TriggerRecord } from "../../vendor/triggers";
import { actionDef, conditionDef } from "../../vendor/triggerDefs";
import { actionSpans, recognizeAction, recognizeCondition, isEud, accessOf } from "./eud";
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
  /** The location a build row moves once this cycle's triggers have all run (a Move location, a pick's box, a pass's centre), or null for any other action. */
  deferredLocation?(action: ActionRecord): number | null;
  locationName?(number: number): string;
}

/** Actions that change nothing shared: what a player sees or hears on their own screen, and the trigger's own bookkeeping. */
const LOCAL_ACTIONS = new Set<number>([ActionType.Comment, ActionType.PreserveTrigger, ActionType.Wait, ActionType.DisplayText, ActionType.PlayWav, ActionType.CenterView, ActionType.MinimapPing, ActionType.TalkingPortrait, ActionType.Transmission, ActionType.MuteUnitSpeech, ActionType.UnmuteUnitSpeech, ActionType.SetMissionObjectives, ActionType.LeaderboardControl, ActionType.LeaderboardControlAt, ActionType.LeaderboardResources, ActionType.LeaderboardKills, ActionType.LeaderboardPoints, ActionType.LeaderboardGoalControl, ActionType.LeaderboardGoalControlAt, ActionType.LeaderboardGoalResources, ActionType.LeaderboardGoalKills, ActionType.LeaderboardGoalPoints, ActionType.LeaderboardComputerPlayers, ActionType.LeaderboardGreed]);

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

  // A value each computer has of its own, read by a trigger that changes the game: the computers can disagree and the game drops out of sync.
  const localRead = enabledConditions.find(({ c }) => c.type === ConditionType.Deaths && isEud(c.player) && recognizeCondition(c)?.entry.local);
  if (localRead && actions.some((a) => !isActionDisabled(a) && !LOCAL_ACTIONS.has(a.type))) {
    out.push({ level: "warn", text: `${recognizeCondition(localRead.c)!.entry.name} is each computer's own, and this trigger changes the game for everyone: the players can go out of sync. For a key or a click, use a synced press (search "key press"); a read like this fits only what one screen shows.`, at: { kind: "condition", index: localRead.index } });
  }

  const preserved = (trigger.flags & TriggerFlag.Preserve) !== 0 || actions.some((a) => a.type === ActionType.PreserveTrigger && !isActionDisabled(a));
  // The records of a grouped entry (a unit type's speed, a player's colour) are known as a set, not one by one.
  const groups = actionSpans(actions).filter((s) => s.group);
  const inGroup = new Set(groups.flatMap((s) => Array.from({ length: s.count }, (_, i) => s.at + i)));
  for (const s of groups) {
    const v = s.group!.entry.value;
    if (v?.kind === "string" && s.group!.value !== 0 && ctx.stringExists && !ctx.stringExists(s.group!.value)) out.push({ level: "error", text: `${s.group!.entry.name} names string ${s.group!.value}, which the map does not have.`, at: { kind: "action", index: s.at } });
  }
  // A build row moves its location after every trigger has run this cycle; a native row below it still sees the location where it was.
  const movedLater = new Map<number, number>();
  actions.forEach((a, index) => {
    if (isActionDisabled(a) || inGroup.has(index)) return;
    const at = { kind: "action" as const, index };
    const deferred = ctx.deferredLocation?.(a) ?? null;
    if (deferred !== null) { if (!movedLater.has(deferred)) movedLater.set(deferred, index); return; }
    const def0 = actionDef(a.type);
    for (const arg of def0?.args ?? []) {
      if (arg.kind !== "location") continue;
      const value = a[arg.field as keyof typeof a] as number;
      const row = movedLater.get(value);
      if (row === undefined) continue;
      out.push({ level: "warn", text: `Row ${row + 1} moves ${ctx.locationName?.(value) ?? `location ${value}`} only after this cycle's triggers have all run, so this row still sees it where it was. Put this row in a trigger that fires in a later cycle.`, at });
      break;
    }
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
        else if (row.entry.value?.kind === "string" && ctx.stringExists && !ctx.stringExists(row.value)) out.push({ level: "error", text: `${row.entry.name} names string ${row.value}, which the map does not have.`, at });
        else if (row.entry.value?.kind === "string" && row.value === 0) out.push({ level: "warn", text: `${row.entry.name} has no text.`, at });
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
