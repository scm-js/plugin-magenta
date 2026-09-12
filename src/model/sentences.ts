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
  [C.Accumulate]: "{Player} accumulates {Comparison} {Amount} {Resource}",
  [C.Always]: "Always",
  [C.Bring]: "{Player} brings {Comparison} {Amount} {Unit} to {Location}",
  [C.Command]: "{Player} commands {Comparison} {Amount} {Unit}",
  [C.CommandTheLeast]: "Current player commands the least {Unit}",
  [C.CommandTheLeastAt]: "Current player commands the least {Unit} at {Location}",
  [C.CommandTheMost]: "Current player commands the most {Unit}",
  [C.CommandTheMostAt]: "Current player commands the most {Unit} at {Location}",
  [C.CountdownTimer]: "Countdown timer is {Comparison} {Amount} seconds",
  [C.Deaths]: "{Player} has suffered {Comparison} {Amount} deaths of {Unit}",
  [C.ElapsedTime]: "Elapsed game time is {Comparison} {Amount} seconds",
  [C.HighestScore]: "Current player has the highest {Score} score",
  [C.Kill]: "{Player} has killed {Comparison} {Amount} {Unit}",
  [C.LeastKills]: "Current player has the fewest kills of {Unit}",
  [C.LeastResources]: "Current player has the least {Resource}",
  [C.LowestScore]: "Current player has the lowest {Score} score",
  [C.MostKills]: "Current player has the most kills of {Unit}",
  [C.MostResources]: "Current player has the most {Resource}",
  [C.Never]: "Never",
  [C.Opponents]: "{Player} has {Comparison} {Amount} opponents remaining",
  [C.Score]: "{Player}'s {Score} score is {Comparison} {Amount}",
  [C.Switch]: "{Switch} is {State}",
  [C.Briefing]: "Mission briefing",
};

export const ACTION_TEMPLATES: Record<number, string> = {
  [A.CenterView]: "Center the view on {Location}",
  [A.Comment]: "Comment {Text}",
  [A.CreateUnit]: "Create {Count} {Unit} at {Location} for {Player}",
  [A.CreateUnitWithProperties]: "Create {Count} {Unit} at {Location} for {Player} with {Properties}",
  [A.Defeat]: "End the scenario in defeat",
  [A.DisplayText]: "Display {Text} ({Display})",
  [A.Draw]: "End the scenario in a draw",
  [A.GiveUnits]: "Give {Count} {Unit} owned by {From} at {Location} to {To}",
  [A.KillUnit]: "Kill all {Unit} owned by {Player}",
  [A.KillUnitAt]: "Kill {Count} {Unit} owned by {Player} at {Location}",
  [A.LeaderboardControl]: "Show a leader board of most {Unit} controlled, labelled {Label}",
  [A.LeaderboardControlAt]: "Show a leader board of most {Unit} controlled at {Location}, labelled {Label}",
  [A.LeaderboardGreed]: "Show the greed leader board with a goal of {Goal} resources",
  [A.LeaderboardKills]: "Show a leader board of most {Unit} killed, labelled {Label}",
  [A.LeaderboardPoints]: "Show a leader board of most {Score} points, labelled {Label}",
  [A.LeaderboardResources]: "Show a leader board of most {Resource}, labelled {Label}",
  [A.LeaderboardGoalControl]: "Show a leader board of {Unit} controlled with a goal of {Goal}, labelled {Label}",
  [A.LeaderboardGoalControlAt]: "Show a leader board of {Unit} controlled at {Location} with a goal of {Goal}, labelled {Label}",
  [A.LeaderboardGoalKills]: "Show a leader board of {Unit} killed with a goal of {Goal}, labelled {Label}",
  [A.LeaderboardGoalPoints]: "Show a leader board of {Score} points with a goal of {Goal}, labelled {Label}",
  [A.LeaderboardGoalResources]: "Show a leader board of {Resource} with a goal of {Goal}, labelled {Label}",
  [A.LeaderboardComputerPlayers]: "{State} computer players on the leader board",
  [A.MinimapPing]: "Ping the minimap at {Location}",
  [A.ModifyEnergy]: "Set the energy of {Count} {Unit} owned by {Player} at {Location} to {Percent}%",
  [A.ModifyHangarCount]: "Add {Amount} to the hangar of {Count} {Unit} owned by {Player} at {Location}",
  [A.ModifyHitPoints]: "Set the hit points of {Count} {Unit} owned by {Player} at {Location} to {Percent}%",
  [A.ModifyResourceAmount]: "Set the resources of {Count} resource units owned by {Player} at {Location} to {Amount}",
  [A.ModifyShields]: "Set the shields of {Count} {Unit} owned by {Player} at {Location} to {Percent}%",
  [A.MoveLocation]: "Center {Move} on {Unit} owned by {Player} at {Unit at}",
  [A.MoveUnit]: "Move {Count} {Unit} owned by {Player} from {From} to {To}",
  [A.MuteUnitSpeech]: "Mute unit speech",
  [A.Order]: "Order {Unit} owned by {Player} at {From} to {Order} to {To}",
  [A.PauseGame]: "Pause the game",
  [A.PauseTimer]: "Pause the countdown timer",
  [A.PlayWav]: "Play {WAV} ({Duration} ms)",
  [A.PreserveTrigger]: "Preserve trigger",
  [A.RemoveUnit]: "Remove all {Unit} owned by {Player}",
  [A.RemoveUnitAt]: "Remove {Count} {Unit} owned by {Player} at {Location}",
  [A.RunAiScript]: "Run the AI script {Script}",
  [A.RunAiScriptAt]: "Run the AI script {Script} at {Location}",
  [A.SetAllianceStatus]: "Set {Player} to {Status}",
  [A.SetCountdownTimer]: "Set the countdown timer {Modifier} {Seconds} seconds",
  [A.SetDeaths]: "Set deaths of {Unit} for {Player} {Modifier} {Amount}",
  [A.SetDoodadState]: "{State} the doodad state of {Unit} owned by {Player} at {Location}",
  [A.SetInvincibility]: "{State} invincibility for {Unit} owned by {Player} at {Location}",
  [A.SetMissionObjectives]: "Set the mission objectives to {Text}",
  [A.SetNextScenario]: "Load {Scenario} after this scenario",
  [A.SetResources]: "Set {Resource} of {Player} {Modifier} {Amount}",
  [A.SetScore]: "Set the {Score} score of {Player} {Modifier} {Amount}",
  [A.SetSwitch]: "{Switch}: {Action}",
  [A.TalkingPortrait]: "Show the talking portrait of {Unit} for {Duration} ms",
  [A.Transmission]: "Transmission from {Unit} at {Location}: {Text}, {WAV} for {WAV duration} ms, shown {Modifier} {Duration} ms ({Display})",
  [A.UnmuteUnitSpeech]: "Unmute unit speech",
  [A.UnpauseGame]: "Unpause the game",
  [A.UnpauseTimer]: "Unpause the countdown timer",
  [A.Victory]: "End the scenario in victory",
  [A.Wait]: "Wait {Milliseconds} ms",
  [A.DisableDebugMode]: "Disable debug mode",
  [A.EnableDebugMode]: "Enable debug mode",
};

export const BRIEFING_TEMPLATES: Record<number, string> = {
  1: "Wait {Milliseconds} ms",
  2: "Play {WAV} ({Duration} ms)",
  3: "Show {Text} for {Duration} ms",
  4: "Set the mission objectives to {Text}",
  5: "Show the portrait of {Unit} in {Slot}",
  6: "Hide the portrait in {Slot}",
  7: "Animate the portrait in {Slot} for {Duration} ms",
  8: "Transmission {Text} from {Slot}, {WAV}, shown {Modifier} {Amount} for {Duration} ms",
  9: "Enable Skip Tutorial",
};

const NUMBER_KINDS: ReadonlySet<ArgKind> = new Set(["number", "amount", "count", "duration", "percent"]);

/** How a modifier reads inside a sentence: "Set X [to] 5", "Set X [up by] 5". */
export const MODIFIER_WORDS: Record<number, string> = { 7: "to", 8: "up by", 9: "down by" };
/** A comparison, lowercase, as it reads after "is". */
export function opLabel(kind: "comparison" | "modifier", value: number, namer: Namer): string {
  if (kind === "modifier" && MODIFIER_WORDS[value]) return MODIFIER_WORDS[value];
  const label = namer.choice(kind, value);
  return label ? label.toLowerCase() : String(value);
}

/** The words for one argument's value. */
export function chipLabel(arg: ArgDef<string>, value: number, namer: Namer): string {
  switch (arg.kind) {
    case "player": return namer.player(value);
    case "unit": return namer.unit(value);
    case "location": return namer.location(value);
    case "switch": return namer.switch(value);
    case "text": { const s = namer.string(value); return s === null ? (value === 0 ? "(no text)" : `string ${value}`) : s; }
    case "wav": return namer.wav(value);
    case "aiScript": return namer.aiScript(value);
    case "cuwp": return value === 0 ? "no properties" : `properties slot ${value}`;
    case "slot": return `slot ${value + 1}`;
    case "count": return value === 0 ? "all" : String(value);
    case "comparison": case "modifier": return opLabel(arg.kind, value, namer);
    default:
      if (NUMBER_KINDS.has(arg.kind)) return String(value);
      return namer.choice(arg.kind, value) ?? String(value);
  }
}

function parse(template: string, args: ArgDef<string>[], read: (arg: ArgDef<string>) => number, namer: Namer): Segment[] {
  const out: Segment[] = [];
  const byLabel = new Map(args.map((a) => [a.label, a]));
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) out.push({ kind: "text", text: template.slice(last, m.index) });
    const arg = byLabel.get(m[1]);
    if (!arg) throw new Error(`Template names an argument the definition lacks: {${m[1]}}`);
    const value = read(arg);
    out.push({ kind: "chip", arg, value, label: chipLabel(arg, value, namer), role: arg.kind === "player" && value >= PLAYER_GROUP_COUNT ? "eud" : undefined });
    last = re.lastIndex;
  }
  if (last < template.length) out.push({ kind: "text", text: template.slice(last) });
  return out;
}

/** `Condition 99(1, 2, 3)`: a type the table does not know, every field shown. */
function rawCondition(c: ConditionRecord): Segment[] {
  const args: [string, number][] = [["location", c.location], ["player", c.player], ["amount", c.amount], ["unit", c.unitId], ["comparison", c.comparison], ["resource", c.resource], ["flags", c.flags], ["mask", c.mask]];
  return [{ kind: "text", text: `Condition ${c.type}: ` }, ...args.flatMap(([label, value], i): Segment[] => [
    ...(i ? [{ kind: "text", text: ", " } as Segment] : []),
    { kind: "chip", arg: { kind: "number", field: label, label }, value, label: String(value) },
  ])];
}

function rawAction(a: ActionRecord): Segment[] {
  const args: [string, number][] = [["location", a.location], ["text", a.text], ["wav", a.wav], ["time", a.time], ["player", a.player], ["target", a.target], ["unit", a.unitId], ["modifier", a.modifier], ["flags", a.flags], ["mask", a.mask]];
  return [{ kind: "text", text: `Action ${a.type}: ` }, ...args.flatMap(([label, value], i): Segment[] => [
    ...(i ? [{ kind: "text", text: ", " } as Segment] : []),
    { kind: "chip", arg: { kind: "number", field: label, label }, value, label: String(value) },
  ])];
}

const counterChip = (name: string, player: number, unit: number): Segment => ({ kind: "chip", arg: { kind: "player", field: "player", label: "Counter" }, value: player * 0x10000 + unit, label: name, role: "counter" });

export function describeCondition(c: ConditionRecord, namer: Namer): Sentence {
  const def = conditionDef(c.type);
  if (!def) return { segments: rawCondition(c), def: null, name: `Condition ${c.type}` };
  if (c.type === ConditionType.Deaths && c.player < PLAYER_GROUP_COUNT) {
    const name = namer.counter?.(c.player, c.unitId);
    if (name) {
      const cmp = def.args.find((a) => a.kind === "comparison")!;
      const amt = def.args.find((a) => a.kind === "amount")!;
      return { def, name: def.name, segments: [counterChip(name, c.player, c.unitId), { kind: "text", text: " is " }, { kind: "chip", arg: cmp, value: c.comparison, label: chipLabel(cmp, c.comparison, namer) }, { kind: "text", text: " " }, { kind: "chip", arg: amt, value: c.amount, label: String(c.amount) }] };
    }
  }
  const template = CONDITION_TEMPLATES[c.type] ?? def.name;
  return { def, name: def.name, segments: parse(template, def.args, (arg) => c[arg.field as keyof ConditionRecord], namer) };
}

export function describeAction(a: ActionRecord, namer: Namer, briefing = false): Sentence {
  const def = actionDef(a.type, briefing);
  if (!def) return { segments: rawAction(a), def: null, name: `Action ${a.type}` };
  if (!briefing && a.type === ActionType.SetDeaths && a.player < PLAYER_GROUP_COUNT) {
    const name = namer.counter?.(a.player, a.unitId);
    if (name) {
      const mod = def.args.find((a) => a.kind === "modifier")!;
      const amt = def.args.find((a) => a.kind === "amount")!;
      return { def, name: def.name, segments: [{ kind: "text", text: "Set " }, counterChip(name, a.player, a.unitId), { kind: "text", text: " " }, { kind: "chip", arg: mod, value: a.modifier, label: chipLabel(mod, a.modifier, namer) }, { kind: "text", text: " " }, { kind: "chip", arg: amt, value: a.target, label: String(a.target) }] };
    }
  }
  const template = (briefing ? BRIEFING_TEMPLATES : ACTION_TEMPLATES)[a.type] ?? def.name;
  const read = (arg: ArgDef<string>) => (arg.kind === "textFlags" ? a.flags & 0x04 : a[arg.field as keyof ActionRecord]);
  return { def, name: def.name, segments: parse(template, def.args, read, namer) };
}

/** The sentence as plain words, for the list's summary and for copying. */
export function sentenceText(s: Sentence): string {
  return s.segments.map((seg) => (seg.kind === "text" ? seg.text : seg.label)).join("");
}
