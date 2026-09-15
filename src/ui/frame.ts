/** The every-frame switch's trigger: one that only sets the trigger timer to 0 and preserves itself. */
import type { TriggerRecord } from "@scm-js/plugin-api";
import { ActionType, SetModifier } from "../../vendor/triggers";
import { recognizeAction } from "../model/eud";
import { liveActions } from "../model/records";

export function isFrameTrigger(tr: TriggerRecord): boolean {
  const acts = liveActions(tr).filter((a) => a.type !== ActionType.Comment && a.type !== ActionType.PreserveTrigger);
  if (acts.length !== 1) return false;
  const row = recognizeAction(acts[0]);
  return !!row && row.entry.id === "game.triggerTimer" && row.op === SetModifier.SetTo && row.value === 0;
}
