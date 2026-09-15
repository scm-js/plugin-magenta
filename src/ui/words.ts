/**
 * A trigger's rows as plain words, one string per live record: the catalogue's
 * sentence for an EUD row, a build row's or an expansion's rendered off-screen, the
 * native sentence otherwise. The list's summary, the explanation and the dry run's
 * readout all read triggers through here.
 */
import type { PluginApi, TriggerRecord } from "@scm-js/plugin-api";
import { ActionType } from "../../vendor/triggers";
import { commentIndex, liveActions, liveConditions } from "../model/records";
import { actionsText, conditionText } from "./describe";
import { cellLabel, compareOf, counterExpansionOf, RELATION_WORDS } from "./expansionRows";
import { conditionRowOf, hookOf, renderConditionRow, renderHook } from "./buildRows";
import type { Host } from "./host";
import type { Store } from "./store";

/** A build row's sentence as plain words: rendered off-screen, its tags and the "#" chip left out. */
export function rowWords(api: PluginApi, render: (into: HTMLElement) => void): string {
  const span = api.ui.el("span");
  render(span);
  span.querySelectorAll(".mg-tag").forEach((e) => e.remove());
  span.querySelectorAll(".mg-chip").forEach((e) => { if (e.textContent === "#") e.remove(); });
  return (span.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** One string per live condition; the rows of a comparison read as one on the first and "" on the rest. */
export function conditionWords(api: PluginApi, host: Host, store: Store, index: number, trigger: TriggerRecord): string[] {
  const namer = host.namer(store.sidecar);
  const extra = host.extra();
  const cmp = compareOf(store, index, trigger);
  return liveConditions(trigger).map((c, i) => {
    if (cmp && cmp.rows.includes(i)) return i === cmp.rows[0] ? `${cellLabel(cmp.x.a, namer)} is ${RELATION_WORDS[cmp.relation]} ${cellLabel(cmp.x.b, namer)}` : "";
    const brow = conditionRowOf(store, c);
    if (brow) return rowWords(api, (into) => renderConditionRow(api, host, store, brow, into, () => {}));
    return conditionText(c, namer, extra);
  });
}

/** One string per live action; a grouped entry reads as one on its first record and "" on the rest, and the title's Comment is "". */
export function actionWords(api: PluginApi, host: Host, store: Store, trigger: TriggerRecord): string[] {
  const namer = host.namer(store.sidecar);
  const extra = host.extra();
  const live = liveActions(trigger);
  const ci = commentIndex(trigger);
  const out = live.map(() => "");
  for (const s of actionsText(live, namer, extra)) {
    const a = live[s.at];
    if (s.at === ci || a.type === ActionType.Comment) continue;
    const hook = s.group ? null : hookOf(store, a);
    if (hook) { out[s.at] = rowWords(api, (into) => renderHook(api, host, store, hook, into)); continue; }
    const x = s.group ? null : counterExpansionOf(store, a);
    if (x) { out[s.at] = x.kind === "copy" ? `Copy ${cellLabel(x.from, namer)} into ${cellLabel(x.to, namer)}` : x.kind === "add" ? `Add ${cellLabel(x.from, namer)} to ${cellLabel(x.to, namer)}` : `Subtract ${cellLabel(x.from, namer)} from ${cellLabel(x.to, namer)}`; continue; }
    out[s.at] = s.text;
  }
  return out;
}

/** The trigger's title, or its first sentence, or "Trigger N". */
export function titleOf(api: PluginApi, host: Host, store: Store, index: number): string {
  const trigger = store.list[index];
  if (!trigger) return "";
  const ci = commentIndex(trigger);
  const title = ci >= 0 ? host.namer(store.sidecar).string(trigger.actions[ci].text) ?? "" : "";
  if (title) return title;
  const first = conditionWords(api, host, store, index, trigger).find(Boolean) ?? actionWords(api, host, store, trigger).find(Boolean);
  return first ?? api.i18n.t("Trigger {n}", { n: store.cleanIndex(index) + 1 });
}
