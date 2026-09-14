/** A record as words: the catalogue's sentence when it is an EUD row, the native one otherwise. */
import type { ActionRecord, ConditionRecord } from "@scm-js/plugin-api";
import { actionSpans, recognizeAction, recognizeCondition, type EudRow } from "../model/eud";
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
