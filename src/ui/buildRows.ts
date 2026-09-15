/**
 * The rows that need a euddraft build, as sentences with chips: a chat command, a key
 * press, a click, a mouse-over and a unit scan (conditions on cells the build fills), and
 * text with counters, counter maths, a pass over units, a count and a read (actions on a
 * private flag cell). Their chips edit the sidecar's build record; the record is what the
 * Build step sends.
 */
import type { PluginApi, ActionRecord, ConditionRecord, TriggerRecord } from "@scm-js/plugin-api";
import { ActionType, Comparison, ConditionType, PlayerGroup, SetModifier } from "../../vendor/triggers";
import type { BuildRecord, ChatArgs, ChatCell, ChatRecord, ForEachDo, Msqc, UnitField, UnitFilter } from "../model/builds";
import { checkChatMessage, DEFAULT_MSQC, HOLD_FIRE_COOLDOWN, isChatPattern, nextChatValue, TIMER_TICKS_PER_SECOND, TIMERS, UNIT_FIELDS } from "../model/builds";
import type { Cell } from "../model/counters";
import type { CounterName } from "../model/sidecar";
import { KEYS } from "../model/eudSentence";
import { flagAction, isFlagAction } from "../model/expansions";
import { partsToText, textToParts, type CounterNames } from "../model/textParts";
import { pickChoice, pickKey, pickLocation, pickNumber, pickText, pickUnitType } from "./chips";
import { cellLabel, freeCell, freeUnit, pickCell } from "./expansionRows";
import type { Host } from "./host";
import type { Store } from "./store";

type HookRecord = Extract<BuildRecord, { flag: Cell }>;
type ScanRecord = Extract<BuildRecord, { kind: "scan" }>;
type PickRecord = Extract<BuildRecord, { kind: "pick" }>;

/** A condition on a build-filled cell: which row it is. */
export type ConditionRow =
  | { kind: "chat"; record: ChatRecord }
  | { kind: "scan"; record: ScanRecord }
  | { kind: "key"; player: number; code: number }
  | { kind: "click"; player: number; button: string }
  | { kind: "mouseIn"; player: number; location: number };

export const hookOf = (store: Store, a: ActionRecord): HookRecord | null =>
  store.sidecar.builds.find((b): b is HookRecord => "flag" in b && isFlagAction(a, { cell: b.flag })) ?? null;

/** The build row a condition reads, or null for an ordinary condition. */
export function conditionRowOf(store: Store, c: ConditionRecord): ConditionRow | null {
  if (c.type !== ConditionType.Deaths) return null;
  const chat = store.sidecar.chat;
  if (chat && c.comparison === Comparison.Exactly) {
    const onCell = c.player === chat.cell[0] && c.unitId === chat.cell[1];
    const onPattern = !!chat.args && c.player === chat.args.pattern[0] && c.unitId === chat.args.pattern[1];
    if (onCell || onPattern) {
      const record = store.sidecar.builds.find((b): b is ChatRecord => b.kind === "chat" && b.value === c.amount && isChatPattern(b) === onPattern);
      return record ? { kind: "chat", record } : null;
    }
  }
  const scan = store.sidecar.builds.find((b): b is ScanRecord => b.kind === "scan" && b.cell[0] === c.player && b.cell[1] === c.unitId);
  if (scan) return { kind: "scan", record: scan };
  const m = store.sidecar.msqc;
  if (m) {
    for (const [code, unit] of Object.entries(m.keys)) if (unit === c.unitId) return { kind: "key", player: c.player, code: Number(code) };
    for (const [button, unit] of Object.entries(m.clicks)) if (unit === c.unitId) return { kind: "click", player: c.player, button };
    for (const [location, unit] of Object.entries(m.mouseIn)) if (unit === c.unitId) return { kind: "mouseIn", player: c.player, location: Number(location) };
  }
  return null;
}

const deathsIs = (cell: Cell, comparison: number, amount: number): ConditionRecord => ({ location: 0, player: cell[0], amount, unitId: cell[1], comparison, type: ConditionType.Deaths, resource: 0, flags: 0, mask: 0 });
/** The condition a chat command inserts: the chat cell for a plain message, the pattern cell for a pattern or a prefix with a number. */
export const chatCondition = (chat: ChatCell, record: ChatRecord): ConditionRecord => deathsIs(isChatPattern(record) && chat.args ? chat.args.pattern : chat.cell, Comparison.Exactly, record.value);

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

const BUILD_NOTE = "Needs a Build (⋯ menu): the game's own triggers cannot do this, so the built map carries the code that does. The source map stays as it is.";
const INPUT_NOTE = "Needs a Build (⋯ menu). The MSQC plugin in the built map turns each player's input into a game command, so every client sees it in the same cycle; the cell is cleared after the triggers have read it.";
const tag = (api: PluginApi, title = BUILD_NOTE): HTMLElement => api.ui.el("span", { className: "mg-tag", title }, "BUILD");

const FIELDS = UNIT_FIELDS.map((f, value) => ({ value, label: f.label, field: f.field, yesNo: f.yesNo === true }));
const fieldIndex = (field: string) => Math.max(0, FIELDS.findIndex((f) => f.field === field));
const CHAT_NUMBER_NAME = "Chat number";

/** The chat args' cells, allocated with the first pattern; the number cell gets a name so text rows and counter steps can use it. */
function ensureChatArgs(host: Host, store: Store): { args: ChatArgs; counters: CounterName[] } | null {
  const have = store.sidecar.chat?.args;
  if (have) return { args: have, counters: store.sidecar.counters };
  const taken: Cell[] = [];
  const next = () => { const c = freeCell(store, host, taken); if (c) taken.push(c); return c; };
  const ptr = next(), len = next(), pattern = next(), number = next();
  if (!ptr || !len || !pattern || !number) return null;
  const counters = store.sidecar.counters.some((c) => c.name === CHAT_NUMBER_NAME) ? store.sidecar.counters : [...store.sidecar.counters, { player: number[0], unit: number[1], name: CHAT_NUMBER_NAME }];
  return { args: { ptr, len, pattern, number }, counters };
}

/** The unit / owner / location chips every pass, count, read and scan shares. */
function filterChips(api: PluginApi, host: Host, store: Store, f: UnitFilter, update: (patch: Partial<UnitFilter>) => void): HTMLElement[] {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const unit = chip(api, f.unit === null ? t("any unit") : namer.unit(f.unit));
  unit.addEventListener("click", () => pickUnitType(api, host, unit, f.unit ?? 228, (v) => update({ unit: v >= 228 ? null : v }), { classes: true }));
  const owner = chip(api, f.owner === null ? t("anyone") : namer.player(f.owner), "");
  owner.addEventListener("click", () => pickChoice(api, owner, [{ value: -1, label: t("anyone") }, ...Array.from({ length: 12 }, (_, i) => ({ value: i, label: namer.player(i), color: namer.playerColor?.(i) ?? null }))], (v) => update({ owner: v < 0 ? null : v }), { current: f.owner ?? -1 }));
  const loc = chip(api, f.location === null ? t("anywhere") : namer.location(f.location), "");
  loc.addEventListener("click", () => pickLocation(api, host, loc, f.location ?? 64, (v) => update({ location: v === 0 || v === 64 ? null : v })));
  return [unit, api.ui.el("span", {}, t(" owned by ")), owner, api.ui.el("span", {}, t(" at ")), loc];
}

export function renderHook(api: PluginApi, host: Host, store: Store, hook: HookRecord, into: HTMLElement): void {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const update = (patch: Record<string, unknown>) => store.updateSidecar(t("Edit build row"), { builds: store.sidecar.builds.map((b) => (b.id === hook.id ? { ...b, ...patch } as BuildRecord : b)) });
  if (hook.kind === "text") {
    const names = counterNames(store, host);
    const text = chip(api, partsToText(hook.parts, names), "text");
    text.addEventListener("click", () => pickText(api, text, partsToText(hook.parts, names), (value) => update({ parts: textToParts(value, names) }), { title: t("{Counter name} for a counter's value, {Player 1} for a name, {Player 1's colour} to switch colour; the buttons insert the game's own codes") }));
    const to = chip(api, hook.to === "all" ? t("everyone") : namer.player(hook.to), "");
    to.addEventListener("click", () => pickChoice(api, to, [{ value: -1, label: t("everyone") }, ...Array.from({ length: 8 }, (_, i) => ({ value: i, label: namer.player(i), color: namer.playerColor?.(i) ?? null }))], (v) => update({ to: v < 0 ? "all" : v }), { current: hook.to === "all" ? -1 : hook.to }));
    into.append(t("Show "), text, t(" to "), to, tag(api));
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
    num.addEventListener("click", () => pickNumber(api, num, typeof hook.b === "number" ? hook.b : 2, (v) => update({ b: v }), { min: hook.op === "mul" ? 0 : 1 }));
    if (hook.op === "rand") into.append(t("Set "), to, t(" to "), op, " ", b, num, tag(api));
    else into.append(t("Set "), to, t(" to "), a, " ", op, " ", b, num, tag(api));
    return;
  }
  if (hook.kind === "count") {
    const to = chip(api, cellLabel(hook.to, namer));
    to.addEventListener("click", () => pickCell(api, host, store, to, hook.to, (cell) => update({ to: cell })));
    into.append(t("Set "), to, t(" to the number of "), ...filterChips(api, host, store, hook, update), tag(api));
    return;
  }
  if (hook.kind === "read") {
    const to = chip(api, cellLabel(hook.to, namer));
    to.addEventListener("click", () => pickCell(api, host, store, to, hook.to, (cell) => update({ to: cell })));
    const field = chip(api, FIELDS[fieldIndex(hook.field)].label, "");
    field.addEventListener("click", () => pickChoice(api, field, FIELDS, (v) => update({ field: FIELDS[v].field }), { current: fieldIndex(hook.field) }));
    into.append(t("Set "), to, t(" to the "), field, t(" of the first "), ...filterChips(api, host, store, hook, update), tag(api));
    return;
  }
  if (hook.kind === "pick") {
    renderPick(api, host, store, hook, into, update);
    return;
  }
  if (hook.kind === "setloc") {
    const loc = chip(api, namer.location(hook.location), "");
    loc.addEventListener("click", () => pickLocation(api, host, loc, hook.location, (v) => { if (v > 0 && v < 64) update({ location: v }); }));
    const x = chip(api, String(hook.x), "");
    x.addEventListener("click", () => pickNumber(api, x, hook.x, (v) => update({ x: v }), { min: 0, max: 65535, unit: "px" }));
    const y = chip(api, String(hook.y), "");
    y.addEventListener("click", () => pickNumber(api, y, hook.y, (v) => update({ y: v }), { min: 0, max: 65535, unit: "px" }));
    const MODE = [{ value: 0, label: t("to") }, { value: 1, label: t("by") }];
    const mode = chip(api, hook.relative ? MODE[1].label : MODE[0].label, "");
    mode.title = t("To: the top-left corner lands on x, y. By: the whole location shifts by x, y from where it is (negative goes left or up).");
    mode.addEventListener("click", () => pickChoice(api, mode, MODE, (v) => update({ relative: v === 1 }), { current: hook.relative ? 1 : 0 }));
    if (hook.relative) {
      const dx = chip(api, String(hook.x), "");
      dx.addEventListener("click", () => pickNumber(api, dx, hook.x, (v) => update({ x: v }), { min: -65535, max: 65535, unit: "px" }));
      const dy = chip(api, String(hook.y), "");
      dy.addEventListener("click", () => pickNumber(api, dy, hook.y, (v) => update({ y: v }), { min: -65535, max: 65535, unit: "px" }));
      into.append(t("Move "), loc, " ", mode, " ", dx, ", ", dy, tag(api));
      return;
    }
    const size = chip(api, hook.width === null || hook.height === null ? t("its size") : `${hook.width} × ${hook.height}`, "");
    size.title = t("Width × height in map pixels, 32 per tile; 0 keeps the location's own size");
    size.addEventListener("click", () => pickNumber(api, size, hook.width ?? 0, (wv) => pickNumber(api, size, hook.height ?? 0, (hv) => update({ width: wv > 0 ? wv : null, height: hv > 0 ? hv : null }), { min: 0, max: 65535, unit: t("px high") }), { min: 0, max: 65535, unit: t("px wide") }));
    into.append(t("Move "), loc, " ", mode, " ", x, ", ", y, t(" keeping "), size, tag(api));
    return;
  }
  // foreach
  into.append(t("For each "), ...filterChips(api, host, store, hook, update), ": ", ...doChips(api, host, store, hook.do, (d) => update({ do: d })), tag(api));
}

/** What a pass or a pick does to a unit, as chips; `d` null is "nothing" (a pick that only locates or reads). */
function doChips(api: PluginApi, host: Host, store: Store, d: ForEachDo | null, onChange: (d: ForEachDo | null) => void, allowNothing = false): (HTMLElement | string)[] {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const scratch = () => host.ensureLocation("Magenta scratch");
  const firstLocation = () => host.locations().find((l) => l.value !== 64)?.value ?? 1;
  const DOS: { value: number; label: string; make: () => ForEachDo | null }[] = [
    { value: 0, label: t("set hit points"), make: () => ({ set: "hp", value: 100 }) }, { value: 1, label: t("set shields"), make: () => ({ set: "shields", value: 100 }) }, { value: 2, label: t("set energy"), make: () => ({ set: "energy", value: 100 }) }, { value: 3, label: t("set kills"), make: () => ({ set: "kills", value: 0 }) },
    { value: 4, label: t("kill"), make: () => ({ kill: true }) }, { value: 5, label: t("remove"), make: () => ({ remove: true }) },
    { value: 6, label: t("make invincible"), make: () => ({ invincible: true }) }, { value: 7, label: t("make vulnerable"), make: () => ({ invincible: false }) },
    { value: 8, label: t("hallucinate"), make: () => ({ hallucination: true }) }, { value: 9, label: t("un-hallucinate"), make: () => ({ hallucination: false }) },
    { value: 10, label: t("give the speed upgrade"), make: () => ({ speed: true }) }, { value: 11, label: t("take the speed upgrade"), make: () => ({ speed: false }) },
    { value: 12, label: t("give to"), make: () => ({ give: 1 }) }, { value: 13, label: t("center a location on it"), make: () => ({ locate: firstLocation() }) },
    { value: 14, label: t("order to move to"), make: () => { const sc = scratch(); return sc ? { order: "move", location: firstLocation(), scratch: sc } : null; } },
    { value: 15, label: t("order to patrol to"), make: () => { const sc = scratch(); return sc ? { order: "patrol", location: firstLocation(), scratch: sc } : null; } },
    { value: 16, label: t("order to attack-move to"), make: () => { const sc = scratch(); return sc ? { order: "attack", location: firstLocation(), scratch: sc } : null; } },
    { value: 17, label: t("apply a spell effect"), make: () => ({ timer: "stim", value: 10 * TIMER_TICKS_PER_SECOND }) },
    { value: 18, label: t("hold fire"), make: () => ({ cooldown: HOLD_FIRE_COOLDOWN }) },
    { value: 19, label: t("set the resources"), make: () => ({ set: "resources", value: 1500 }) }, { value: 20, label: t("set the remaining build time"), make: () => ({ set: "buildTime", value: 0 }) }, { value: 21, label: t("set the rank"), make: () => ({ set: "rank", value: 0 }) },
    { value: 22, label: t("walk through anything"), make: () => ({ status: "noclip", on: true }) }, { value: 23, label: t("collide again"), make: () => ({ status: "noclip", on: false }) },
    { value: 25, label: t("take"), make: () => ({ adjust: "hp", delta: -20 }) }, { value: 26, label: t("give"), make: () => ({ adjust: "hp", delta: 20 }) },
    ...(allowNothing ? [{ value: 24, label: t("do nothing to it"), make: () => null }] : []),
  ];
  const current = d === null ? 24 : "set" in d ? ({ hp: 0, shields: 1, energy: 2, kills: 3, resources: 19, buildTime: 20, rank: 21 } as const)[d.set] : "kill" in d ? 4 : "remove" in d ? 5 : "invincible" in d ? (d.invincible ? 6 : 7) : "hallucination" in d ? (d.hallucination ? 8 : 9) : "speed" in d ? (d.speed ? 10 : 11) : "give" in d ? 12 : "locate" in d ? 13 : "order" in d ? ({ move: 14, patrol: 15, attack: 16 } as const)[d.order] : "timer" in d ? 17 : "cooldown" in d ? 18 : "adjust" in d ? (d.delta < 0 ? 25 : 26) : d.on ? 22 : 23;
  const what = chip(api, DOS.find((x) => x.value === current)?.label ?? "?", "");
  what.addEventListener("click", () => pickChoice(api, what, DOS, (v) => {
    const entry = DOS.find((x) => x.value === v)!;
    const made = entry.make();
    if (made === null && v !== 24) { api.ui.toast({ kind: "error", title: t("No free location slot"), detail: t("Ordering one unit at a time needs a location of Magenta's own; free a location slot first.") }); return; }
    onChange(made);
  }, { current }));
  const out: (HTMLElement | string)[] = [what];
  if (d === null) return out;
  if ("set" in d) {
    const value = chip(api, String(d.value), "");
    value.addEventListener("click", () => pickNumber(api, value, d.value, (v) => onChange({ set: d.set, value: v }), { min: 0, max: 65535 }));
    out.push(t(" to "), value);
  } else if ("give" in d) {
    const p = chip(api, namer.player(d.give), "");
    p.addEventListener("click", () => pickChoice(api, p, Array.from({ length: 12 }, (_, i) => ({ value: i, label: namer.player(i), color: namer.playerColor?.(i) ?? null })), (v) => onChange({ give: v }), { current: d.give }));
    out.push(" ", p);
  } else if ("locate" in d) {
    const l = chip(api, namer.location(d.locate), "");
    l.addEventListener("click", () => pickLocation(api, host, l, d.locate, (v) => { if (v > 0 && v < 64) onChange({ locate: v }); }));
    out.push(": ", l);
  } else if ("order" in d) {
    const l = chip(api, namer.location(d.location), "");
    l.addEventListener("click", () => pickLocation(api, host, l, d.location, (v) => { if (v > 0 && v < 64) onChange({ ...d, location: v }); }));
    l.title = t("The destination. The order goes to one unit at a time through the location named Magenta scratch, which is Magenta's to move.");
    out.push(" ", l);
  } else if ("timer" in d) {
    const which = chip(api, TIMERS.find((x) => x.timer === d.timer)?.label ?? d.timer, "");
    which.addEventListener("click", () => pickChoice(api, which, TIMERS.map((x, value) => ({ value, label: x.label })), (v) => onChange({ timer: TIMERS[v].timer, value: d.value }), { current: Math.max(0, TIMERS.findIndex((x) => x.timer === d.timer)) }));
    const seconds = chip(api, String(Math.round(d.value / TIMER_TICKS_PER_SECOND)), "");
    seconds.title = t("Seconds at the fastest speed; the game counts these timers in ticks of about eight frames. The effect applies without the spell's overlay graphic.");
    seconds.addEventListener("click", () => pickNumber(api, seconds, Math.round(d.value / TIMER_TICKS_PER_SECOND), (v) => onChange({ timer: d.timer, value: Math.max(1, Math.min(255, v * TIMER_TICKS_PER_SECOND)) }), { min: 1, max: 85, unit: "s" }));
    out.push(": ", which, t(" for "), seconds, t(" s"));
  } else if ("cooldown" in d) {
    const note = api.ui.el("span", { className: "hint", title: t("The cooldowns are written each time the trigger fires; to keep a unit from firing, the trigger must fire every cycle (preserved, with triggers running every frame).") }, t(" (each cycle)"));
    out.push(note);
  } else if ("adjust" in d) {
    // "take 20 hit points" / "give 20 shields": the sign is the verb, the number is always positive.
    const ADJ = [{ value: 0, label: t("hit points"), field: "hp" as const }, { value: 1, label: t("shields"), field: "shields" as const }, { value: 2, label: t("energy"), field: "energy" as const }];
    const sign = d.delta < 0 ? -1 : 1;
    const n = chip(api, String(Math.abs(d.delta)), "");
    n.addEventListener("click", () => pickNumber(api, n, Math.abs(d.delta), (v) => onChange({ adjust: d.adjust, delta: sign * Math.max(1, v) }), { min: 1, max: 65535 }));
    const f = chip(api, ADJ.find((x) => x.field === d.adjust)?.label ?? d.adjust, "");
    f.title = d.delta < 0 ? t("Never below 0; a unit whose hit points reach 0 dies.") : t("Never above the type's maximum.");
    f.addEventListener("click", () => pickChoice(api, f, ADJ, (v) => onChange({ adjust: ADJ[v].field, delta: d.delta }), { current: ADJ.findIndex((x) => x.field === d.adjust) }));
    out.push(" ", n, " ", f);
  }
  return out;
}

/** The pick row: the one unit with the least / greatest field or nearest a location, then what to do with it. */
function renderPick(api: PluginApi, host: Host, store: Store, hook: PickRecord, into: HTMLElement, update: (patch: Record<string, unknown>) => void): void {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const BY = [{ value: 0, label: t("with the least"), by: "min" as const }, { value: 1, label: t("with the greatest"), by: "max" as const }, { value: 2, label: t("nearest to"), by: "nearest" as const }, { value: 3, label: t("at random"), by: "random" as const }];
  const by = chip(api, BY.find((b) => b.by === hook.by)!.label, "");
  by.addEventListener("click", () => pickChoice(api, by, BY, (v) => update({ by: BY[v].by, near: BY[v].by === "nearest" ? hook.near ?? host.locations().find((l) => l.value !== 64)?.value ?? 1 : hook.near }), { current: BY.findIndex((b) => b.by === hook.by) }));
  into.append(t("Take the "), ...filterChips(api, host, store, hook, update), " ", by, " ");
  if (hook.by === "nearest") {
    const mouseOf = typeof hook.near === "object" && hook.near !== null ? hook.near.mouse : null;
    const near = chip(api, mouseOf !== null ? t("{player}'s mouse", { player: namer.player(mouseOf) }) : typeof hook.near === "number" ? namer.location(hook.near) : t("a location"), "");
    near.addEventListener("click", () => {
      const pop = pickLocation(api, host, near, typeof hook.near === "number" ? hook.near : 1, (v) => { if (v > 0 && v < 64) update({ near: v, radius: null }); });
      // A player's mouse as the point: MSQC has to carry the mouse for that.
      const foot = pop.root.querySelector(".mg-pop-foot");
      foot?.prepend(api.ui.widgets.button(t("A player's mouse…"), { ghost: true, onClick: () => {
        pop.close();
        pickChoice(api, near, Array.from({ length: 8 }, (_, i) => ({ value: i, label: namer.player(i), color: namer.playerColor?.(i) ?? null })), (p) => {
          const m = withMsqc(host, store, true);
          if (!m) { api.ui.toast({ kind: "error", title: t("No room for the mouse"), detail: t("It needs nine free location slots for MSQC.") }); return; }
          store.commit(t("Pick near the mouse"), () => store.list, { sidecar: { msqc: m, builds: store.sidecar.builds.map((b) => (b.id === hook.id ? { ...b, near: { mouse: p }, radius: hook.radius ?? 64 } as BuildRecord : b)) } });
        }, { current: mouseOf ?? 0, width: 200 });
      } }));
    });
    into.append(near);
    if (mouseOf !== null) {
      const radius = chip(api, hook.radius === null || hook.radius === undefined ? t("any distance") : `${hook.radius} px`, "");
      radius.title = t("How far from the mouse a unit still counts, in map pixels (32 a tile); farther, and the pick finds nothing.");
      radius.addEventListener("click", () => pickNumber(api, radius, hook.radius ?? 64, (v) => update({ radius: v > 0 ? v : null }), { min: 0, max: 4096, unit: "px", hint: t("0 for any distance") }));
      into.append(t(" within "), radius);
    }
  } else if (hook.by === "random") {
    // Nothing to choose: one of the matches, drawn each time the trigger fires.
  } else {
    const numeric = FIELDS.filter((f) => !f.yesNo);
    const field = chip(api, FIELDS[fieldIndex(hook.field)].label, "");
    field.addEventListener("click", () => pickChoice(api, field, numeric, (v) => update({ field: FIELDS[v].field }), { current: fieldIndex(hook.field) }));
    into.append(field);
  }
  into.append(t(": "), ...doChips(api, host, store, hook.do, (d) => update({ do: d }), true));
  const locate = chip(api, hook.locate ? namer.location(hook.locate) : t("no location"), "");
  locate.title = t("A small box is centred on the unit, so the trigger's other actions — or the next trigger's — can act on it through the location.");
  locate.addEventListener("click", () => pickLocation(api, host, locate, hook.locate ?? 64, (v) => update({ locate: v > 0 && v < 64 ? v : null })));
  const to = chip(api, hook.to ? cellLabel(hook.to, namer) : t("no counter"));
  to.title = t("The field's value — or the distance, for the nearest — goes into this counter; 0 when nothing matched.");
  to.addEventListener("click", () => pickCell(api, host, store, to, hook.to ?? store.sidecar.chat?.cell ?? [0, 181], (cell) => update({ to: cell })));
  into.append(t(", center "), locate, t(" on it, value into "), to);
  if (hook.to) {
    const clear = chip(api, "×", "");
    clear.title = t("No counter");
    clear.addEventListener("click", () => update({ to: null }));
    into.append(clear);
  }
  into.append(tag(api));
}

/** A condition row's sentence; the chips edit the record (chat, scan) or replace the condition (key, click, mouse). */
export function renderConditionRow(api: PluginApi, host: Host, store: Store, row: ConditionRow, into: HTMLElement, replace: (next: ConditionRecord) => void): void {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const playerChip = (player: number, onPick: (p: number) => void) => {
    const c = chip(api, namer.player(player), "");
    c.addEventListener("click", () => pickChoice(api, c, [{ value: PlayerGroup.CurrentPlayer, label: namer.player(PlayerGroup.CurrentPlayer) }, ...Array.from({ length: 8 }, (_, i) => ({ value: i, label: namer.player(i), color: namer.playerColor?.(i) ?? null }))], onPick, { current: player }));
    return c;
  };
  if (row.kind === "chat") {
    const chat = row.record;
    const setMessage = (value: string) => {
      const problem = checkChatMessage(value);
      if (problem) { api.ui.toast({ kind: "error", title: problem }); return; }
      const next = { ...chat, message: value.trim() };
      // A ^…$ pattern needs the args cells like a prefix with a number does; make them the moment one is written.
      const needArgs = isChatPattern(next) && !store.sidecar.chat?.args;
      const made = needArgs ? ensureChatArgs(host, store) : null;
      if (needArgs && !made) { api.ui.toast({ kind: "error", title: t("No free counter cells for a chat pattern") }); return; }
      const chatCell: ChatCell = { ...(store.sidecar.chat ?? { cell: [0, 181] }), ...(made ? { args: made.args } : {}) };
      store.commit(t("Edit chat command"), () => store.list, { sidecar: { builds: store.sidecar.builds.map((b) => (b.id === chat.id ? next : b)), chat: chatCell, ...(made ? { counters: made.counters } : {}) } });
      replace(chatCondition(chatCell, next));
    };
    const msg = chip(api, chat.message, "text");
    msg.addEventListener("click", () => pickText(api, msg, chat.message, setMessage, { title: chat.arg === "number" ? t("The command before the number: -set matches -set 250, and the number lands in the counter named Chat number") : t("What a player types in chat; ^…$ writes a pattern, as in ^-give .*$") }));
    const ARG = [{ value: 0, label: t("exactly") }, { value: 1, label: t("followed by a number") }];
    const arg = chip(api, chat.arg === "number" ? ARG[1].label : ARG[0].label, "");
    arg.title = t("With a number, the message is a prefix and the number typed after it goes into the counter named Chat number.");
    arg.addEventListener("click", () => pickChoice(api, arg, ARG, (v) => {
      const next: ChatRecord = v === 1 ? { ...chat, arg: "number", message: chat.message.startsWith("^") ? chat.message.replace(/^\^|\.\*|\$$/g, "").trim() || "-set" : chat.message } : { id: chat.id, kind: "chat", message: chat.message, value: chat.value };
      const made = v === 1 && !store.sidecar.chat?.args ? ensureChatArgs(host, store) : null;
      if (v === 1 && !store.sidecar.chat?.args && !made) { api.ui.toast({ kind: "error", title: t("No free counter cells for the number") }); return; }
      const chatCell: ChatCell = { ...(store.sidecar.chat ?? { cell: [0, 181] }), ...(made ? { args: made.args } : {}) };
      store.commit(t("Edit chat command"), () => store.list, { sidecar: { builds: store.sidecar.builds.map((b) => (b.id === chat.id ? next : b)), chat: chatCell, ...(made ? { counters: made.counters } : {}) } });
      replace(chatCondition(chatCell, next));
    }, { current: chat.arg === "number" ? 1 : 0 }));
    into.append(t("The chat said "), msg, " ", arg, tag(api, t("Needs a Build (⋯ menu): the chat plugin in the built map writes the command's number into a cell this condition reads, in the cycle the message arrives, for every player at once. A message with a number is matched as a pattern and the number is parsed out for you.")));
    return;
  }
  if (row.kind === "scan") {
    const s = row.record;
    const update = (patch: Record<string, unknown>) => store.updateSidecar(t("Edit unit check"), { builds: store.sidecar.builds.map((b) => (b.id === s.id ? { ...b, ...patch } as BuildRecord : b)) });
    const fi = FIELDS[fieldIndex(s.field)];
    const field = chip(api, fi.label, "");
    field.addEventListener("click", () => pickChoice(api, field, FIELDS, (v) => update(FIELDS[v].yesNo ? { field: FIELDS[v].field, cmp: "=", value: s.cmp === "=" && s.value === 0 ? 0 : 1 } : { field: FIELDS[v].field }), { current: fieldIndex(s.field) }));
    const note = tag(api, t("Needs a Build (⋯ menu): the built map checks this every cycle and leaves the answer in a cell this condition reads."));
    if (fi.yesNo) {
      const IS = [{ value: 1, label: t("is") }, { value: 0, label: t("is not") }];
      const is = chip(api, s.value === 0 ? IS[1].label : IS[0].label, "");
      is.addEventListener("click", () => pickChoice(api, is, IS, (v) => update({ cmp: "=", value: v }), { current: s.value === 0 ? 0 : 1 }));
      into.append(t("Any "), ...filterChips(api, host, store, s, update), " ", is, " ", field, note);
      return;
    }
    const CMP = [{ value: 0, label: t("below"), cmp: "<" as const }, { value: 1, label: t("above"), cmp: ">" as const }, { value: 2, label: t("exactly"), cmp: "=" as const }];
    const cmp = chip(api, CMP.find((c) => c.cmp === s.cmp)?.label ?? s.cmp, "");
    cmp.addEventListener("click", () => pickChoice(api, cmp, CMP, (v) => update({ cmp: CMP[v].cmp }), { current: CMP.findIndex((c) => c.cmp === s.cmp) }));
    const value = chip(api, String(s.value), "");
    value.addEventListener("click", () => pickNumber(api, value, s.value, (v) => update({ value: v }), { min: 0, max: 65535 }));
    into.append(t("Any "), ...filterChips(api, host, store, s, update), t(" has "), field, " ", cmp, " ", value, note);
    return;
  }
  const m = store.sidecar.msqc ?? DEFAULT_MSQC;
  if (row.kind === "key") {
    const key = chip(api, KEYS.find((k) => k.code === row.code)?.label ?? `0x${row.code.toString(16)}`, "");
    key.addEventListener("click", () => pickKey(api, key, row.code, (code) => { const unit = m.keys[String(code)] ?? m.keys[String(row.code)]; void unit; store.commit(t("Change key"), () => store.list, { sidecar: { msqc: { ...m, keys: { ...m.keys, [String(code)]: m.keys[String(code)] ?? freeUnit(store, host) ?? m.keys[String(row.code)] } } } }); replace(deathsIs([row.player, (store.sidecar.msqc ?? m).keys[String(code)] ?? m.keys[String(row.code)]], Comparison.AtLeast, 1)); }));
    into.append(playerChip(row.player, (p) => replace(deathsIs([p, m.keys[String(row.code)]], Comparison.AtLeast, 1))), t(" pressed "), key, tag(api, INPUT_NOTE));
    return;
  }
  if (row.kind === "click") {
    const button = chip(api, row.button === "L" ? t("left") : row.button === "M" ? t("middle") : t("right"), "");
    button.addEventListener("click", () => pickChoice(api, button, [{ value: 0, label: t("left") }, { value: 1, label: t("right") }, { value: 2, label: t("middle") }], (v) => {
      const b = v === 0 ? "L" : v === 1 ? "R" : "M";
      const unit = m.clicks[b] ?? freeUnit(store, host);
      if (unit === null) return;
      store.commit(t("Change button"), () => store.list, { sidecar: { msqc: { ...m, clicks: { ...m.clicks, [b]: unit } } } });
      replace(deathsIs([row.player, unit], Comparison.AtLeast, 1));
    }, { current: row.button === "L" ? 0 : row.button === "R" ? 1 : 2 }));
    into.append(playerChip(row.player, (p) => replace(deathsIs([p, m.clicks[row.button]], Comparison.AtLeast, 1))), t(" clicked the "), button, t(" button"), tag(api, INPUT_NOTE));
    return;
  }
  // mouseIn
  const loc = chip(api, namer.location(row.location), "");
  loc.addEventListener("click", () => pickLocation(api, host, loc, row.location, (v) => {
    if (v <= 0 || v >= 64) return;
    const unit = m.mouseIn[String(v)] ?? freeUnit(store, host);
    if (unit === null) return;
    store.commit(t("Change location"), () => store.list, { sidecar: { msqc: { ...m, mouseIn: { ...m.mouseIn, [String(v)]: unit } } } });
    replace(deathsIs([row.player, unit], Comparison.Exactly, 1));
  }));
  into.append(playerChip(row.player, (p) => replace(deathsIs([p, m.mouseIn[String(row.location)]], Comparison.Exactly, 1))), t("'s mouse is over "), loc, tag(api, INPUT_NOTE));
}

/* ── Inserting ── */

/** A new chat command: the map's chat cell (allocated with the first), a value, the condition to insert; with `arg` the args cells and the Chat number counter too. */
export function newChat(host: Host, store: Store, message = "-command", arg: "number" | null = null): { condition: ConditionRecord; builds: BuildRecord[]; chat: ChatCell; counters?: CounterName[] } | null {
  const chat: ChatCell | null = store.sidecar.chat ?? (() => { const cell = freeCell(store, host); return cell ? { cell, args: null } : null; })();
  if (!chat) return null;
  const value = nextChatValue(store.sidecar.builds);
  const record: ChatRecord = { id: `h${Date.now().toString(36)}`, kind: "chat", message, value, ...(arg ? { arg } : {}) };
  let counters: CounterName[] | undefined;
  let withArgs = chat;
  if (isChatPattern(record) && !chat.args) {
    const made = ensureChatArgs(host, { ...store, sidecar: { ...store.sidecar, chat } } as Store);
    if (!made) return null;
    withArgs = { ...chat, args: made.args };
    counters = made.counters;
  }
  return { condition: chatCondition(withArgs, record), builds: [...store.sidecar.builds, record], chat: withArgs, ...(counters ? { counters } : {}) };
}

/** MSQC with its own location, player and unit settled, and the mouse locations when they are needed. */
function withMsqc(host: Host, store: Store, needMouse: boolean): Msqc | null {
  const m: Msqc = store.sidecar.msqc ? { ...store.sidecar.msqc } : { ...DEFAULT_MSQC, keys: {}, clicks: {}, mouseIn: {} };
  if (!store.sidecar.msqc) {
    const free = host.freeLocationSlots();
    if (!free.length) return null;
    m.qcLoc = free[0];
  }
  if (needMouse && m.mouseBase === null) {
    // Eight slots in a row, low to high, that nothing uses. MSQC's setting is the 1-based location
    // number of Player 1's mouse (it keeps player p's in base + p), so the number is the first slot's index + 1.
    const free = new Set(host.freeLocationSlots().filter((i) => i !== m.qcLoc));
    for (let slot = 0; slot + 8 <= 63; slot++) {
      let ok = true;
      for (let p = 0; p < 8; p++) if (!free.has(slot + p)) { ok = false; break; }
      if (ok) { m.mouseBase = slot + 1; break; }
    }
    if (m.mouseBase === null) return null;
  }
  return m;
}

/** A new input condition: the MSQC bookkeeping and the condition to insert. */
export function newInput(host: Host, store: Store, what: "key" | "click" | "mouseIn", options: { code?: number; button?: "L" | "R" | "M"; location?: number } = {}): { condition: ConditionRecord; msqc: Msqc } | null {
  const m = withMsqc(host, store, what !== "key");
  if (!m) return null;
  if (what === "key") {
    const code = options.code ?? 0x41;
    const unit = m.keys[String(code)] ?? freeUnit({ ...store, sidecar: { ...store.sidecar, msqc: m } } as Store, host);
    if (unit === null) return null;
    m.keys = { ...m.keys, [String(code)]: unit };
    return { condition: deathsIs([PlayerGroup.CurrentPlayer, unit], Comparison.AtLeast, 1), msqc: m };
  }
  if (what === "click") {
    const b = options.button ?? "L";
    const unit = m.clicks[b] ?? freeUnit({ ...store, sidecar: { ...store.sidecar, msqc: m } } as Store, host);
    if (unit === null) return null;
    m.clicks = { ...m.clicks, [b]: unit };
    return { condition: deathsIs([PlayerGroup.CurrentPlayer, unit], Comparison.AtLeast, 1), msqc: m };
  }
  const location = options.location ?? host.locations().find((l) => l.value !== 64)?.value ?? 0;
  if (!location) return null;
  const unit = m.mouseIn[String(location)] ?? freeUnit({ ...store, sidecar: { ...store.sidecar, msqc: m } } as Store, host);
  if (unit === null) return null;
  m.mouseIn = { ...m.mouseIn, [String(location)]: unit };
  return { condition: deathsIs([PlayerGroup.CurrentPlayer, unit], Comparison.Exactly, 1), msqc: m };
}

/** A new unit check: a cell of its own, the record and the condition. */
export function newScan(host: Host, store: Store, query = "", unit: number | null = 0): { condition: ConditionRecord; builds: BuildRecord[] } | null {
  const cell = freeCell(store, host);
  if (!cell) return null;
  const pct = /percent|%/i.test(query);
  const field: UnitField = /shield/i.test(query) ? (pct ? "shieldsPct" : "shields") : /energy|mana/i.test(query) ? (pct ? "energyPct" : "energy") : /under attack/i.test(query) ? "underAttack" : /target/i.test(query) ? "hasTarget" : /burrow/i.test(query) ? "burrowed" : /moving/i.test(query) ? "speed" : /attacking|order/i.test(query) ? "order" : /kills/i.test(query) ? "kills" : pct ? "hpPct" : "hp";
  const yesNo = FIELDS[fieldIndex(field)].yesNo;
  const record: BuildRecord = { id: `s${Date.now().toString(36)}`, kind: "scan", cell, unit, owner: PlayerGroup.Player1, location: null, field, cmp: yesNo ? "=" : /above|over|more/i.test(query) ? ">" : "<", value: yesNo ? 1 : pct ? 30 : 20 };
  return { condition: deathsIs(cell, Comparison.Exactly, 1), builds: [...store.sidecar.builds, record] };
}

/** A new action hook: a flag cell, the record, and the flag action to insert. */
export function newHook(host: Host, store: Store, what: "text" | "math" | "foreach" | "count" | "read" | "setloc" | "pick", query = "", named_: { unit?: number | null; location?: number | null } = {}): { action: ActionRecord; builds: BuildRecord[] } | null {
  const flag = freeCell(store, host);
  if (!flag) return null;
  const named = store.sidecar.counters;
  const a: Cell = named[0] ? [named[0].player, named[0].unit] : freeCell(store, host, [flag]) ?? [0, 181];
  const id = `b${Date.now().toString(36)}`;
  // "damage every zergling at lava": the unit and the location the box recognised go into the filter.
  const filter: UnitFilter = { unit: named_.unit === undefined ? 0 : named_.unit, owner: PlayerGroup.Player1, location: named_.location ?? null };
  const record: BuildRecord = what === "text"
    ? { id, kind: "text", flag, parts: [{ text: "Score: " }, { counter: a }], to: "all" }
    : what === "math"
      ? { id, kind: "math", flag, op: /random/i.test(query) ? "rand" : /divid/i.test(query) ? "div" : /modul|remainder/i.test(query) ? "mod" : "mul", a, b: /random/i.test(query) ? 100 : 2, to: a }
      : what === "count"
        ? { id, kind: "count", flag, ...filter, to: a }
        : what === "read"
          ? { id, kind: "read", flag, ...filter, field: "hp", to: a }
          : what === "setloc"
            ? { id, kind: "setloc", flag, location: host.locations().find((l) => l.value !== 64)?.value ?? 1, x: 0, y: 0, width: null, height: null, ...(/\bby\b|shift|offset|slide|scroll/i.test(query) ? { relative: true, x: 32 } : {}) }
            : what === "pick"
              ? { id, kind: "pick", flag, ...filter, by: /random|lottery|any one/i.test(query) ? "random" : /near|clos|mouse|under/i.test(query) ? "nearest" : /strong|most|great|high/i.test(query) ? "max" : "min", field: /kill/i.test(query) ? "kills" : "hp", near: /near|clos|mouse|under/i.test(query) ? host.locations().find((l) => l.value !== 64)?.value ?? 1 : null, locate: null, to: null, do: /kill/i.test(query) ? { kill: true } : null }
          : { id, kind: "foreach", flag, ...filter, do: /give to|owner/i.test(query) ? { give: 1 } : /kill/i.test(query) ? { kill: true } : /damage|hurt|take|drain/i.test(query) ? { adjust: /shield/i.test(query) ? "shields" : /energy|mana/i.test(query) ? "energy" : "hp", delta: -20 } : /heal|restore|regen/i.test(query) ? { adjust: /shield/i.test(query) ? "shields" : /energy|mana/i.test(query) ? "energy" : "hp", delta: 20 } : { set: "hp", value: 100 } };
  return { action: flagAction({ cell: flag }), builds: [...store.sidecar.builds, record] };
}

/** Whether a trigger uses anything that needs a build. */
export function needsBuild(store: Store, trigger: TriggerRecord): boolean {
  return trigger.actions.some((a) => a.type === ActionType.SetDeaths && a.modifier === SetModifier.SetTo && hookOf(store, a) !== null) || trigger.conditions.some((c) => conditionRowOf(store, c) !== null);
}
