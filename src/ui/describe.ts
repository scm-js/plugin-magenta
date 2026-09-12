/** A record as words: the catalogue's sentence when it is an EUD row, the native one otherwise. */
import type { ActionRecord, ConditionRecord } from "@scm-js/plugin-api";
import { recognizeAction, recognizeCondition } from "../model/eud";
import { describeEud } from "../model/eudSentence";
import type { Namer } from "../model/names";
import { describeAction, describeCondition, sentenceText } from "../model/sentences";
import type { Host } from "./host";

export type Extra = ReturnType<Host["extra"]>;

export function conditionText(c: ConditionRecord, namer: Namer, extra: Extra): string {
  const eud = recognizeCondition(c);
  return eud ? describeEud(eud, "condition", namer, extra).map((s) => (s.kind === "text" ? s.text : s.label)).join("") : sentenceText(describeCondition(c, namer));
}

export function actionText(a: ActionRecord, namer: Namer, extra: Extra, briefing = false): string {
  const eud = briefing ? null : recognizeAction(a);
  return eud ? describeEud(eud, "action", namer, extra).map((s) => (s.kind === "text" ? s.text : s.label)).join("") : sentenceText(describeAction(a, namer, briefing));
}
