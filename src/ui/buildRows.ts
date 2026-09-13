/**
 * The rows that need a euddraft build, as sentences with chips: a chat command (a
 * condition on the map's chat cell), text with counters in it, counter maths, and a pass
 * over every unit of a kind (each an action on a private flag cell). Their chips edit the
 * sidecar's build record; the record itself is what the Build step sends.
 */
import type { PluginApi, ActionRecord, ConditionRecord, TriggerRecord } from "@scm-js/plugin-api";
import { ActionType, Comparison, ConditionType, PlayerGroup, SetModifier } from "../../vendor/triggers";
import type { BuildRecord, ForEachDo } from "../model/builds";
import { checkChatMessage, nextChatValue } from "../model/builds";
import { cellKey, type Cell } from "../model/counters";
import { flagAction, isFlagAction } from "../model/expansions";
import { partsToText, textToParts, type CounterNames } from "../model/textParts";
import { pickChoice, pickLocation, pickNumber, pickText, pickUnitType } from "./chips";
import { cellLabel, freeCell, pickCell } from "./expansionRows";
import type { Host } from "./host";
import type { Store } from "./store";

type HookRecord = Exclude<BuildRecord, { kind: "chat" }>;
type ChatRecord = Extract<BuildRecord, { kind: "chat" }>;

export const hookOf = (store: Store, a: ActionRecord): HookRecord | null =>
  store.sidecar.builds.find((b): b is HookRecord => b.kind !== "chat" && isFlagAction(a, { cell: b.flag })) ?? null;

/** The chat command a condition reads: `Deaths(chat cell) == value`. */
export function chatOf(store: Store, c: ConditionRecord): ChatRecord | null {
  const chat = store.sidecar.chat;
  if (!chat || c.type !== ConditionType.Deaths || c.player !== chat.cell[0] || c.unitId !== chat.cell[1] || c.comparison !== Comparison.Exactly) return null;
  return store.sidecar.builds.find((b): b is ChatRecord => b.kind === "chat" && b.value === c.amount) ?? null;
}

export const chatCondition = (cell: Cell, value: number): ConditionRecord => ({ location: 0, player: cell[0], amount: value, unitId: cell[1], comparison: Comparison.Exactly, type: ConditionType.Deaths, resource: 0, flags: 0, mask: 0 });

function counterNames(store: Store, host: Host): CounterNames {
  const namer = host.namer(store.sidecar);
  return {
    name: (cell) => store.sidecar.counters.find((c) => c.player === cell[0] && c.unit === cell[1])?.name ?? cellLabel(cell, namer),
    cell: (name) => {
      const c = store.sidecar.counters.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (c) return [c.player, c.unit];
      const byLabel = store.sidecar.counters.map((x) => [x.player, x.unit] as Cell).find((cell) => cellLabel(cell, namer).toLowerCase() === name.toLowerCase());
      return byLabel ?? null;
    },
  };
}

function chip(api: PluginApi, label: string, className = "counter"): HTMLButtonElement {
  return api.ui.el("button", { type: "button", className: `mg-chip ${className}` }, label) as HTMLButtonElement;
}

function tag(api: PluginApi, title: string): HTMLElement {
  return api.ui.el("span", { className: "mg-tag", title }, "BUILD");
}

const BUILD_NOTE = "Needs a Build (⋯ menu): the game's own triggers cannot do this, so the built map carries the code that does. The source map stays as it is.";

export function renderHook(api: PluginApi, host: Host, store: Store, hook: HookRecord, into: HTMLElement): void {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const update = (patch: Partial<HookRecord>) => store.updateSidecar(t("Edit build row"), { builds: store.sidecar.builds.map((b) => (b.id === hook.id ? { ...b, ...patch } as BuildRecord : b)) });
  if (hook.kind === "text") {
    const names = counterNames(store, host);
    const text = chip(api, partsToText(hook.parts, names), "text");
    text.addEventListener("click", () => pickText(api, text, partsToText(hook.parts, names), (value) => update({ parts: textToParts(value, names) }), { title: t("Write {Counter name} where a counter's value goes") }));
    const to = chip(api, hook.to === "all" ? t("everyone") : namer.player(hook.to), "");
    to.addEventListener("click", () => pickChoice(api, to, [{ value: -1, label: t("everyone") }, ...Array.from({ length: 8 }, (_, i) => ({ value: i, label: namer.player(i), color: namer.playerColor?.(i) ?? null }))], (v) => update({ to: v < 0 ? "all" : v }), { current: hook.to === "all" ? -1 : hook.to }));
    into.append(t("Show "), text, t(" to "), to, tag(api, BUILD_NOTE));
    return;
  }
  if (hook.kind === "math") {
    const OPS = [{ value: 0, label: t("times"), op: "mul" as const }, { value: 1, label: t("divided by"), op: "div" as const }, { value: 2, label: t("modulo"), op: "mod" as const }, { value: 3, label: t("a random number below"), op: "rand" as const }];
    const to = chip(api, cellLabel(hook.to, namer));
    to.addEventListener("click", () => pickCell(api, host, store, to, hook.to, (cell) => update({ to: cell })));
    const a = chip(api, cellLabel(hook.a, namer));
    a.addEventListener("click", () => pickCell(api, host, store, a, hook.a, (cell) => update({ a: cell })));
    const op = chip(api, OPS.find((o) => o.op === hook.op)?.label ?? hook.op, "");
    op.addEventListener("click", () => pickChoice(api, op, OPS, (v) => update({ op: OPS[v].op }), { current: OPS.findIndex((o) => o.op === hook.op) }));
    const b = chip(api, typeof hook.b === "number" ? String(hook.b) : cellLabel(hook.b, namer));
    b.addEventListener("click", () => pickCell(api, host, store, b, typeof hook.b === "number" ? hook.a : hook.b, (cell) => update({ b: cell })));
    const num = chip(api, "#", "");
    num.title = t("A number instead of a counter");
    num.addEventListener("click", () => pickNumber(api, num, typeof hook.b === "number" ? hook.b : 2, (v) => update({ b: v }), { min: hook.op === "rand" || hook.op === "div" || hook.op === "mod" ? 1 : 0 }));
    if (hook.op === "rand") into.append(t("Set "), to, t(" to "), op, " ", b, num, tag(api, BUILD_NOTE));
    else into.append(t("Set "), to, t(" to "), a, " ", op, " ", b, num, tag(api, BUILD_NOTE));
    return;
  }
  // foreach
  const unit = chip(api, hook.unit === null ? t("any unit") : namer.unit(hook.unit));
  unit.addEventListener("click", () => pickUnitType(api, host, unit, hook.unit ?? 228, (v) => update({ unit: v >= 228 ? null : v }), { classes: true }));
  const owner = chip(api, hook.owner === null ? t("anyone") : namer.player(hook.owner), "", );
  owner.addEventListener("click", () => pickChoice(api, owner, [{ value: -1, label: t("anyone") }, ...Array.from({ length: 12 }, (_, i) => ({ value: i, label: namer.player(i), color: namer.playerColor?.(i) ?? null }))], (v) => update({ owner: v < 0 ? null : v }), { current: hook.owner ?? -1 }));
  const loc = chip(api, hook.location === null ? t("anywhere") : namer.location(hook.location), "");
  loc.addEventListener("click", () => pickLocation(api, host, loc, hook.location ?? 64, (v) => update({ location: v === 0 || v === 64 ? null : v })));
  const DOS: { value: number; label: string; make: () => ForEachDo }[] = [
    { value: 0, label: t("set hit points"), make: () => ({ set: "hp", value: 100 }) }, { value: 1, label: t("set shields"), make: () => ({ set: "shields", value: 100 }) }, { value: 2, label: t("set energy"), make: () => ({ set: "energy", value: 100 }) },
    { value: 3, label: t("kill"), make: () => ({ kill: true }) }, { value: 4, label: t("remove"), make: () => ({ remove: true }) }, { value: 5, label: t("make invincible"), make: () => ({ invincible: true }) }, { value: 6, label: t("make vulnerable"), make: () => ({ invincible: false }) },
  ];
  const current = "set" in hook.do ? { hp: 0, shields: 1, energy: 2 }[hook.do.set] : "kill" in hook.do ? 3 : "remove" in hook.do ? 4 : hook.do.invincible ? 5 : 6;
  const what = chip(api, DOS[current].label, "");
  what.addEventListener("click", () => pickChoice(api, what, DOS, (v) => update({ do: DOS[v].make() }), { current }));
  into.append(t("For each "), unit, t(" owned by "), owner, t(" at "), loc, ": ", what);
  if ("set" in hook.do) {
    const d = hook.do;
    const value = chip(api, String(d.value), "");
    value.addEventListener("click", () => pickNumber(api, value, d.value, (v) => update({ do: { set: d.set, value: v } }), { min: 0, max: 65535 }));
    into.append(t(" to "), value);
  }
  into.append(tag(api, BUILD_NOTE));
}

export function renderChat(api: PluginApi, host: Host, store: Store, chat: ChatRecord, into: HTMLElement): void {
  const t = api.i18n.t;
  void host;
  const msg = chip(api, chat.message, "text");
  msg.addEventListener("click", () => pickText(api, msg, chat.message, (value) => {
    const problem = checkChatMessage(value);
    if (problem) { api.ui.toast({ kind: "error", title: problem }); return; }
    store.updateSidecar(t("Edit chat command"), { builds: store.sidecar.builds.map((b) => (b.id === chat.id ? { ...b, message: value.trim() } : b)) });
  }, { title: t("What a player types in chat; ^…$ for a pattern, as in ^-give .*$") }));
  into.append(t("The chat said "), msg, tag(api, "Needs a Build (⋯ menu): the chat plugin in the built map writes the command's number into a cell this condition reads, in the cycle the message arrives, for every player at once."));
}

/* ── Inserting ── */

/** A new chat command: the map's chat cell (allocated with the first), a value, the condition to insert. */
export function newChat(api: PluginApi, host: Host, store: Store, message = "-command"): { condition: ConditionRecord; builds: BuildRecord[]; chat: { cell: Cell } } | null {
  const chat = store.sidecar.chat ?? (() => { const cell = freeCell(store, host); return cell ? { cell } : null; })();
  if (!chat) return null;
  const value = nextChatValue(store.sidecar.builds);
  const record: BuildRecord = { id: `h${Date.now().toString(36)}`, kind: "chat", message, value };
  void api;
  return { condition: chatCondition(chat.cell, value), builds: [...store.sidecar.builds, record], chat };
}

/** A new action hook: a flag cell, the record, and the flag action to insert. */
export function newHook(host: Host, store: Store, what: "text" | "math" | "foreach", query = ""): { action: ActionRecord; builds: BuildRecord[] } | null {
  const flag = freeCell(store, host);
  if (!flag) return null;
  const named = store.sidecar.counters;
  const a: Cell = named[0] ? [named[0].player, named[0].unit] : freeCell(store, host, [flag]) ?? [0, 181];
  const id = `b${Date.now().toString(36)}`;
  const record: BuildRecord = what === "text"
    ? { id, kind: "text", flag, parts: [{ text: "Score: " }, { counter: a }], to: "all" }
    : what === "math"
      ? { id, kind: "math", flag, op: /random/i.test(query) ? "rand" : /divid/i.test(query) ? "div" : /modul|remainder/i.test(query) ? "mod" : "mul", a, b: /random/i.test(query) ? 100 : 2, to: a }
      : { id, kind: "foreach", flag, unit: 0, owner: PlayerGroup.Player1, location: null, do: { set: "hp", value: 100 } };
  return { action: flagAction({ cell: flag }), builds: [...store.sidecar.builds, record] };
}

/** Whether a trigger uses anything that needs a build. */
export function needsBuild(store: Store, trigger: TriggerRecord): boolean {
  return trigger.actions.some((a) => a.type === ActionType.SetDeaths && a.modifier === SetModifier.SetTo && hookOf(store, a) !== null) || trigger.conditions.some((c) => chatOf(store, c) !== null);
}

export const cellKeyOf = cellKey;
