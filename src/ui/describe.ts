/** A record as words: the catalogue's sentence when it is an EUD row, the native one otherwise. */
import type { ActionRecord, ConditionRecord } from "@scm-js/plugin-api";
import { SetModifier } from "../../vendor/triggers";
import { actionSpans, recognize, recognizeAction, recognizeCondition, type EudRow } from "../model/eud";
import { describeEud } from "../model/eudSentence";
import type { Namer } from "../model/names";
import { describeAction, describeCondition, sentenceText } from "../model/sentences";
import type { Host } from "./host";

export type Extra = ReturnType<Host["extra"]>;

const words = (row: EudRow, kind: "condition" | "action", namer: Namer, extra: Extra) => describeEud(row, kind, namer, extra).map((s) => (s.kind === "text" ? s.text : s.label)).join("");

export function conditionText(c: ConditionRecord, namer: Namer, extra: Extra): string {
  const eud = recognizeCondition(c);
  return eud ? words(eud, "condition", namer, extra) : sentenceText(describeCondition(c, namer));
}

export function actionText(a: ActionRecord, namer: Namer, extra: Extra, briefing = false): string {
  const eud = briefing ? null : recognizeAction(a);
  return eud ? words(eud, "action", namer, extra) : sentenceText(describeAction(a, namer, briefing));
}

/** The action list as sentences, a grouped entry's records read as one. */
export function actionsText(actions: readonly ActionRecord[], namer: Namer, extra: Extra, briefing = false): { at: number; count: number; group: EudRow | null; text: string }[] {
  if (briefing) return actions.map((a, at) => ({ at, count: 1, group: null, text: actionText(a, namer, extra, true) }));
  return actionSpans(actions).map((s) => ({ at: s.at, count: s.count, group: s.group, text: s.group ? words(s.group, "action", namer, extra) : actionText(actions[s.at], namer, extra) }));
}

/** A memory cell of the dry run's state as words: the catalogue's name for it with its value, or the address. */
export function memoryCellText(flatIndex: number, raw: number, namer: Namer, extra: Extra): string {
  const row = recognize("action", flatIndex, 0, 0, 0, raw, SetModifier.SetTo);
  if (!row) return `memory 0x${(0x58a364 + flatIndex * 4).toString(16).toUpperCase()} = ${raw}`;
  const segs = describeEud(row, "action", namer, extra);
  const value = segs.find((s) => s.kind === "echip" && s.slot === "value");
  const words = segs.filter((s) => !(s.kind === "echip" && (s.slot === "value" || s.slot === "op"))).map((s) => (s.kind === "text" ? s.text : s.label)).join("").replace(/\s+/g, " ").trim().replace(/^(Set|Make|Name) /, "");
  return `${words} = ${value && value.kind === "echip" ? value.label : raw}`;
}
