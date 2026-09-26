/**
 * A condition or action as a sentence: text with the arguments as chips, in the order a
 * map maker reads them. One template per type; the argument slots are the labels of the
 * editor's own definitions table (`vendor/triggerDefs.ts`), so a template that names an
 * argument the table does not have, or misses one, is caught by the tests.
 *
 * A Deaths condition or Set Deaths action on a cell the map has named reads as that
 * counter ("Score is at least 10"); one whose player is past the 27 groups is an EUD
 * address, which the catalogue names when it can (`recognize.ts`) — this file only
 * renders it as memory.
 */
import { ActionType, ConditionType, PLAYER_GROUP_COUNT, type ActionRecord, type ConditionRecord } from "../../vendor/triggers";
import { actionDef, conditionDef, type ActionDef, type ArgDef, type ArgKind, type ConditionDef } from "../../vendor/triggerDefs";
import type { Namer } from "./names";
import { compose, josa, msg, t, translate } from "../i18n";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "chip"; arg: ArgDef<string>; value: number; label: string; role?: "counter" | "eud" };

export interface Sentence {
  segments: Segment[];
  /** The type's definition, or null for a type the table does not know. */
  def: ConditionDef | ActionDef | null;
  /** A short name for the list's summary line. */
  name: string;
}

const C = ConditionType;
const A = ActionType;

export const CONDITION_TEMPLATES: Record<number, string> = {
  [C.Accumulate]: msg("{Player} accumulates {Comparison} {Amount} {Resource}"),
  [C.Always]: msg("Always"),
  [C.Bring]: msg("{Player} brings {Comparison} {Amount} {Unit} to {Location}"),
  [C.Command]: msg("{Player} commands {Comparison} {Amount} {Unit}"),
  [C.CommandTheLeast]: msg("Current player commands the least {Unit}"),
  [C.CommandTheLeastAt]: msg("Current player commands the least {Unit} at {Location}"),
  [C.CommandTheMost]: msg("Current player commands the most {Unit}"),
  [C.CommandTheMostAt]: msg("Current player commands the most {Unit} at {Location}"),
  [C.CountdownTimer]: msg("Countdown timer is {Comparison} {Amount} seconds"),
  [C.Deaths]: msg("{Player} has suffered {Comparison} {Amount} deaths of {Unit}"),
  [C.ElapsedTime]: msg("Elapsed game time is {Comparison} {Amount} seconds"),
  [C.HighestScore]: msg("Current player has the highest {Score} score"),
  [C.Kill]: msg("{Player} has killed {Comparison} {Amount} {Unit}"),
  [C.LeastKills]: msg("Current player has the fewest kills of {Unit}"),
  [C.LeastResources]: msg("Current player has the least {Resource}"),
  [C.LowestScore]: msg("Current player has the lowest {Score} score"),
  [C.MostKills]: msg("Current player has the most kills of {Unit}"),
  [C.MostResources]: msg("Current player has the most {Resource}"),
  [C.Never]: msg("Never"),
  [C.Opponents]: msg("{Player} has {Comparison} {Amount} opponents remaining"),
  [C.Score]: msg("{Player}'s {Score} score is {Comparison} {Amount}"),
  [C.Switch]: msg("{Switch} is {State}"),
  [C.Briefing]: msg("Mission briefing"),
};

export const ACTION_TEMPLATES: Record<number, string> = {
  [A.CenterView]: msg("Center the view on {Location}"),
  [A.Comment]: msg("Comment {Text}"),
  [A.CreateUnit]: msg("Create {Count} {Unit} at {Location} for {Player}"),
  [A.CreateUnitWithProperties]: msg("Create {Count} {Unit} at {Location} for {Player} with {Properties}"),
  [A.Defeat]: msg("End the scenario in defeat"),
  [A.DisplayText]: msg("Display {Text} ({Display})"),
  [A.Draw]: msg("End the scenario in a draw"),
  [A.GiveUnits]: msg("Give {Count} {Unit} owned by {From} at {Location} to {To}"),
  [A.KillUnit]: msg("Kill all {Unit} owned by {Player}"),
  [A.KillUnitAt]: msg("Kill {Count} {Unit} owned by {Player} at {Location}"),
  [A.LeaderboardControl]: msg("Show a leader board of most {Unit} controlled, labelled {Label}"),
  [A.LeaderboardControlAt]: msg("Show a leader board of most {Unit} controlled at {Location}, labelled {Label}"),
  [A.LeaderboardGreed]: msg("Show the greed leader board with a goal of {Goal} resources"),
  [A.LeaderboardKills]: msg("Show a leader board of most {Unit} killed, labelled {Label}"),
  [A.LeaderboardPoints]: msg("Show a leader board of most {Score} points, labelled {Label}"),
  [A.LeaderboardResources]: msg("Show a leader board of most {Resource}, labelled {Label}"),
  [A.LeaderboardGoalControl]: msg("Show a leader board of {Unit} controlled with a goal of {Goal}, labelled {Label}"),
  [A.LeaderboardGoalControlAt]: msg("Show a leader board of {Unit} controlled at {Location} with a goal of {Goal}, labelled {Label}"),
  [A.LeaderboardGoalKills]: msg("Show a leader board of {Unit} killed with a goal of {Goal}, labelled {Label}"),
  [A.LeaderboardGoalPoints]: msg("Show a leader board of {Score} points with a goal of {Goal}, labelled {Label}"),
  [A.LeaderboardGoalResources]: msg("Show a leader board of {Resource} with a goal of {Goal}, labelled {Label}"),
  [A.LeaderboardComputerPlayers]: msg("{State} computer players on the leader board"),
  [A.MinimapPing]: msg("Ping the minimap at {Location}"),
  [A.ModifyEnergy]: msg("Set the energy of {Count} {Unit} owned by {Player} at {Location} to {Percent}%"),
  [A.ModifyHangarCount]: msg("Add {Amount} to the hangar of {Count} {Unit} owned by {Player} at {Location}"),
  [A.ModifyHitPoints]: msg("Set the hit points of {Count} {Unit} owned by {Player} at {Location} to {Percent}%"),
  [A.ModifyResourceAmount]: msg("Set the resources of {Count} resource units owned by {Player} at {Location} to {Amount}"),
  [A.ModifyShields]: msg("Set the shields of {Count} {Unit} owned by {Player} at {Location} to {Percent}%"),
  [A.MoveLocation]: msg("Center {Move} on {Unit} owned by {Player} at {Unit at}"),
  [A.MoveUnit]: msg("Move {Count} {Unit} owned by {Player} from {From} to {To}"),
  [A.MuteUnitSpeech]: msg("Mute unit speech"),
  [A.Order]: msg("Order {Unit} owned by {Player} at {From} to {Order} to {To}"),
  [A.PauseGame]: msg("Pause the game"),
  [A.PauseTimer]: msg("Pause the countdown timer"),
  [A.PlayWav]: msg("Play {WAV} ({Duration} ms)"),
  [A.PreserveTrigger]: msg("Preserve trigger"),
  [A.RemoveUnit]: msg("Remove all {Unit} owned by {Player}"),
  [A.RemoveUnitAt]: msg("Remove {Count} {Unit} owned by {Player} at {Location}"),
  [A.RunAiScript]: msg("Run the AI script {Script}"),
  [A.RunAiScriptAt]: msg("Run the AI script {Script} at {Location}"),
  [A.SetAllianceStatus]: msg("Set {Player} to {Status}"),
  [A.SetCountdownTimer]: msg("Set the countdown timer {Modifier} {Seconds} seconds"),
  [A.SetDeaths]: msg("Set deaths of {Unit} for {Player} {Modifier} {Amount}"),
  [A.SetDoodadState]: msg("{State} the doodad state of {Unit} owned by {Player} at {Location}"),
  [A.SetInvincibility]: msg("{State} invincibility for {Unit} owned by {Player} at {Location}"),
  [A.SetMissionObjectives]: msg("Set the mission objectives to {Text}"),
  [A.SetNextScenario]: msg("Load {Scenario} after this scenario"),
  [A.SetResources]: msg("Set {Resource} of {Player} {Modifier} {Amount}"),
  [A.SetScore]: msg("Set the {Score} score of {Player} {Modifier} {Amount}"),
  [A.SetSwitch]: msg("{Switch}: {Action}"),
  [A.TalkingPortrait]: msg("Show the talking portrait of {Unit} for {Duration} ms"),
  [A.Transmission]: msg("Transmission from {Unit} at {Location}: {Text}, {WAV} for {WAV duration} ms, shown {Modifier} {Duration} ms ({Display})"),
  [A.UnmuteUnitSpeech]: msg("Unmute unit speech"),
  [A.UnpauseGame]: msg("Unpause the game"),
  [A.UnpauseTimer]: msg("Unpause the countdown timer"),
  [A.Victory]: msg("End the scenario in victory"),
  [A.Wait]: msg("Wait {Milliseconds} ms"),
  [A.DisableDebugMode]: msg("Disable debug mode"),
  [A.EnableDebugMode]: msg("Enable debug mode"),
};

export const BRIEFING_TEMPLATES: Record<number, string> = {
  1: msg("Wait {Milliseconds} ms"),
  2: msg("Play {WAV} ({Duration} ms)"),
  3: msg("Show {Text} for {Duration} ms"),
  4: msg("Set the mission objectives to {Text}"),
  5: msg("Show the portrait of {Unit} in {Slot}"),
  6: msg("Hide the portrait in {Slot}"),
  7: msg("Animate the portrait in {Slot} for {Duration} ms"),
  8: msg("Transmission {Text} from {Slot}, {WAV}, shown {Modifier} {Amount} for {Duration} ms"),
  9: msg("Enable Skip Tutorial"),
};

const NUMBER_KINDS: ReadonlySet<ArgKind> = new Set(["number", "amount", "count", "duration", "percent"]);

/** How a modifier reads inside a sentence: "Set X [to] 5", "Set X [up by] 5". */
export const MODIFIER_WORDS: Record<number, string> = { 7: msg("to"), 8: msg("up by"), 9: msg("down by") };

/**
 * The editor's labels for the enumerated arguments (`api.triggers.defs`), which it hands
 * over in English: listed here so they are in the catalogue, and shown through `translate`.
 */
export const CHOICE_LABELS: readonly string[] = [
  msg("At least"), msg("At most"), msg("Exactly"),
  msg("set"), msg("not set"), msg("clear"), msg("toggle"), msg("randomize"),
  msg("Set To"), msg("Add"), msg("Subtract"),
  msg("enable"), msg("disable"),
  msg("move"), msg("patrol"), msg("attack"),
  msg("Enemy"), msg("Ally"), msg("Allied Victory"),
  msg("ore"), msg("gas"), msg("ore and gas"),
  msg("Total"), msg("Units"), msg("Buildings"), msg("Units and buildings"), msg("Kills"), msg("Razings"), msg("Kills and razings"), msg("Custom"),
  msg("Don't Always Display"), msg("Always Display"),
];
/** An argument's label as the chip's hover shows it (`vendor/triggerDefs.ts`). */
export const ARG_LABELS: readonly string[] = [
  msg("Player"), msg("Unit"), msg("Location"), msg("Comparison"), msg("Amount"), msg("Resource"), msg("Score"), msg("Switch"), msg("State"),
  msg("Count"), msg("Modifier"), msg("Text"), msg("Label"), msg("Display"), msg("Properties"), msg("From"), msg("To"), msg("Goal"), msg("Percent"),
  msg("Unit at"), msg("Move"), msg("Order"), msg("WAV"), msg("Duration"), msg("Script"), msg("Status"), msg("Seconds"), msg("Scenario"), msg("Action"),
  msg("WAV duration"), msg("Milliseconds"), msg("Slot"), msg("Counter"),
];
/** A comparison, lowercase, as it reads after "is". */
export function opLabel(kind: "comparison" | "modifier", value: number, namer: Namer): string {
  if (kind === "modifier" && MODIFIER_WORDS[value]) return translate(MODIFIER_WORDS[value]);
  const label = namer.choice(kind, value);
  return label ? translate(label).toLowerCase() : String(value);
}

/** The words for one argument's value. */
export function chipLabel(arg: ArgDef<string>, value: number, namer: Namer): string {
  switch (arg.kind) {
    case "player": return namer.player(value);
    case "unit": return namer.unit(value);
    case "location": return namer.location(value);
    case "switch": return namer.switch(value);
    case "text": { const s = namer.string(value); return s === null ? (value === 0 ? t("(no text)") : t("string {n}", { n: value })) : s; }
    case "wav": return namer.wav(value);
    case "aiScript": return namer.aiScript(value);
    case "cuwp": return value === 0 ? t("no properties") : t("properties slot {n}", { n: value });
    case "slot": return t("slot {n}", { n: value + 1 });
    case "count": return value === 0 ? t("all") : String(value);
    case "comparison": case "modifier": return opLabel(arg.kind, value, namer);
    default:
      if (NUMBER_KINDS.has(arg.kind)) return String(value);
      { const label = namer.choice(arg.kind, value); return label === undefined ? String(value) : translate(label); }
  }
}

function parse(template: string, args: ArgDef<string>[], read: (arg: ArgDef<string>) => number, namer: Namer): Segment[] {
  const out: Segment[] = [];
  const byLabel = new Map(args.map((a) => [a.label, a]));
  // `{Unit|을}`: a translation's particle, chosen by the chip's words.
  const re = /\{([^}|]+)(?:\|([^}]+))?\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) out.push({ kind: "text", text: template.slice(last, m.index) });
    const arg = byLabel.get(m[1]);
    if (!arg) throw new Error(`Template names an argument the definition lacks: {${m[1]}}`);
    const value = read(arg);
    const label = chipLabel(arg, value, namer);
    out.push({ kind: "chip", arg, value, label, role: arg.kind === "player" && value >= PLAYER_GROUP_COUNT ? "eud" : undefined });
    if (m[2]) out.push({ kind: "text", text: josa(label, m[2]).slice(label.length) });
    last = re.lastIndex;
  }
  if (last < template.length) out.push({ kind: "text", text: template.slice(last) });
  return out;
}

/** `Condition 99(1, 2, 3)`: a type the table does not know, every field shown. */
function rawCondition(c: ConditionRecord): Segment[] {
  const args: [string, number][] = [["location", c.location], ["player", c.player], ["amount", c.amount], ["unit", c.unitId], ["comparison", c.comparison], ["resource", c.resource], ["flags", c.flags], ["mask", c.mask]];
  return [{ kind: "text", text: `${t("Condition {n}", { n: c.type })}: ` }, ...args.flatMap(([label, value], i): Segment[] => [
    ...(i ? [{ kind: "text", text: ", " } as Segment] : []),
    { kind: "chip", arg: { kind: "number", field: label, label }, value, label: String(value) },
  ])];
}

function rawAction(a: ActionRecord): Segment[] {
  const args: [string, number][] = [["location", a.location], ["text", a.text], ["wav", a.wav], ["time", a.time], ["player", a.player], ["target", a.target], ["unit", a.unitId], ["modifier", a.modifier], ["flags", a.flags], ["mask", a.mask]];
  return [{ kind: "text", text: `${t("Action {n}", { n: a.type })}: ` }, ...args.flatMap(([label, value], i): Segment[] => [
    ...(i ? [{ kind: "text", text: ", " } as Segment] : []),
    { kind: "chip", arg: { kind: "number", field: label, label }, value, label: String(value) },
  ])];
}

/** A translated template over ready segments: the words between them as text, a particle after a chip by its words. */
const segmentsOf = (template: string, parts: Record<string, Segment>): Segment[] =>
  compose(template, parts, (seg) => (seg.kind === "text" ? seg.text : seg.label)).map((p) => (typeof p === "string" ? { kind: "text", text: p } : p));

const counterChip = (name: string, player: number, unit: number): Segment => ({ kind: "chip", arg: { kind: "player", field: "player", label: "Counter" }, value: player * 0x10000 + unit, label: name, role: "counter" });

export function describeCondition(c: ConditionRecord, namer: Namer): Sentence {
  const def = conditionDef(c.type);
  if (!def) return { segments: rawCondition(c), def: null, name: t("Condition {n}", { n: c.type }) };
  if (c.type === ConditionType.Deaths && c.player < PLAYER_GROUP_COUNT) {
    const name = namer.counter?.(c.player, c.unitId);
    if (name) {
      const cmp = def.args.find((a) => a.kind === "comparison")!;
      const amt = def.args.find((a) => a.kind === "amount")!;
      const parts = { counter: counterChip(name, c.player, c.unitId), cmp: { kind: "chip", arg: cmp, value: c.comparison, label: chipLabel(cmp, c.comparison, namer) } as Segment, amount: { kind: "chip", arg: amt, value: c.amount, label: String(c.amount) } as Segment };
      return { def, name: def.name, segments: segmentsOf(t("{counter} is {cmp} {amount}"), parts) };
    }
  }
  const template = CONDITION_TEMPLATES[c.type] ? translate(CONDITION_TEMPLATES[c.type]) : def.name;
  return { def, name: def.name, segments: parse(template, def.args, (arg) => c[arg.field as keyof ConditionRecord], namer) };
}

export function describeAction(a: ActionRecord, namer: Namer, briefing = false): Sentence {
  const def = actionDef(a.type, briefing);
  if (!def) return { segments: rawAction(a), def: null, name: t("Action {n}", { n: a.type }) };
  if (!briefing && a.type === ActionType.SetDeaths && a.player < PLAYER_GROUP_COUNT) {
    const name = namer.counter?.(a.player, a.unitId);
    if (name) {
      const mod = def.args.find((a) => a.kind === "modifier")!;
      const amt = def.args.find((a) => a.kind === "amount")!;
      const parts = { counter: counterChip(name, a.player, a.unitId), mod: { kind: "chip", arg: mod, value: a.modifier, label: chipLabel(mod, a.modifier, namer) } as Segment, amount: { kind: "chip", arg: amt, value: a.target, label: String(a.target) } as Segment };
      return { def, name: def.name, segments: segmentsOf(t("Set {counter} {mod} {amount}"), parts) };
    }
  }
  const english = (briefing ? BRIEFING_TEMPLATES : ACTION_TEMPLATES)[a.type];
  const template = english ? translate(english) : def.name;
  const read = (arg: ArgDef<string>) => (arg.kind === "textFlags" ? a.flags & 0x04 : a[arg.field as keyof ActionRecord]);
  return { def, name: def.name, segments: parse(template, def.args, read, namer) };
}

/** The sentence as plain words, for the list's summary and for copying. */
export function sentenceText(s: Sentence): string {
  return s.segments.map((seg) => (seg.kind === "text" ? seg.text : seg.label)).join("");
}
