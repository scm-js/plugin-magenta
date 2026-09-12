/**
 * One condition or action as a row: the sentence with its chips, the row's tools, and
 * the problems under it. A chip click opens the picker for its kind; the pick writes the
 * record through `onChange` and the editor re-renders.
 */
import type { PluginApi, ActionRecord, ConditionRecord } from "@scm-js/plugin-api";
import { ActionType, ConditionType } from "../../vendor/triggers";
import { AI_SCRIPT_CHOICES, aiScriptCode, type ArgKind } from "../../vendor/triggerDefs";
import type { Entry } from "../catalogue";
import { lowerAction, lowerCondition, recognizeAction, recognizeCondition, entryAddress, type EudRow } from "../model/eud";
import { describeEud, type EudSegment } from "../model/eudSentence";
import type { Namer } from "../model/names";
import { describeAction, describeCondition, type Segment } from "../model/sentences";
import { isActionDisabled, isConditionDisabled } from "../model/records";
import type { Problem } from "../model/checks";
import { allocate, cellKey, usage } from "../model/counters";
import { pickChoice, pickKey, pickLocation, pickNamed, pickNumber, pickPlacedUnit, pickPlayer, pickSound, pickSwitch, pickText, pickUnitType } from "./chips";
import type { Host } from "./host";
import type { Store } from "./store";

export interface RowContext {
  api: PluginApi;
  host: Host;
  store: Store;
  namer: Namer;
  extra: ReturnType<Host["extra"]>;
  /** The trigger the row belongs to. */
  triggerIndex: number;
}

export interface RowHandlers<R> {
  onChange(record: R): void;
  /** Change the record and intern a string for it in the same write. */
  onChangeWithText(text: string, apply: (index: number) => R): void;
  onRemove(): void;
  onMove(delta: number): void;
  onToggle(): void;
}

function chipEl(api: PluginApi, label: string, className: string, color?: string | null, title?: string): HTMLButtonElement {
  const b = api.ui.el("button", { type: "button", className: `mg-chip ${className}`.trim(), title: title ?? "" },
    color ? api.ui.el("span", { className: "mg-dot", style: `background:${color}` }) : null,
    label,
  ) as HTMLButtonElement;
  return b;
}

/** The choices of an enumerated native argument, from the editor's table. */
function choicesOf(api: PluginApi, kind: ArgKind) {
  return api.triggers.defs.choices(kind).map((c) => ({ value: c.value, label: c.label }));
}

export function renderRow(ctx: RowContext, kind: "condition", index: number, record: ConditionRecord, problems: Problem[], h: RowHandlers<ConditionRecord>): HTMLElement;
export function renderRow(ctx: RowContext, kind: "action", index: number, record: ActionRecord, problems: Problem[], h: RowHandlers<ActionRecord>): HTMLElement;
export function renderRow(ctx: RowContext, kind: "condition" | "action", index: number, record: ConditionRecord | ActionRecord, problems: Problem[], h: RowHandlers<ConditionRecord> | RowHandlers<ActionRecord>): HTMLElement {
  const { api } = ctx;
  const el = api.ui.el;
  const t = api.i18n.t;
  const disabled = kind === "condition" ? isConditionDisabled(record as ConditionRecord) : isActionDisabled(record as ActionRecord);
  const sentence = el("span", { className: "mg-sentence" });
  const eud = kind === "condition" ? recognizeCondition(record as ConditionRecord) : recognizeAction(record as ActionRecord);

  if (eud) renderEud(ctx, kind, eud, sentence, (row) => (h as RowHandlers<ConditionRecord | ActionRecord>).onChange(kind === "condition" ? lowerCondition(row) : lowerAction(row)));
  else if (kind === "condition") renderNative(ctx, "condition", record as ConditionRecord, describeCondition(record as ConditionRecord, ctx.namer).segments, sentence, h as RowHandlers<ConditionRecord>);
  else renderNative(ctx, "action", record as ActionRecord, describeAction(record as ActionRecord, ctx.namer).segments, sentence, h as RowHandlers<ActionRecord>);

  const tools = el("span", { className: "mg-tools" },
    api.ui.widgets.button(disabled ? "✓" : "⊘", { ghost: true, title: disabled ? t("Enable") : t("Disable"), onClick: () => h.onToggle() }),
    api.ui.widgets.button("↑", { ghost: true, title: t("Move up (Alt+Up)"), onClick: () => h.onMove(-1) }),
    api.ui.widgets.button("↓", { ghost: true, title: t("Move down (Alt+Down)"), onClick: () => h.onMove(1) }),
    api.ui.widgets.button("✕", { ghost: true, title: t("Remove (Delete)"), onClick: () => h.onRemove() }),
  );
  const row = el("div", { className: `mg-row${disabled ? " disabled" : ""}`, tabIndex: 0, "data-kind": kind, "data-index": index }, sentence, tools);
  row.addEventListener("keydown", (e) => {
    if (e.target !== row) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); h.onRemove(); }
    else if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); h.onMove(-1); }
    else if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); h.onMove(1); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); h.onToggle(); }
    else if (e.key === "Enter") { e.preventDefault(); (row.querySelector(".mg-chip") as HTMLElement | null)?.click(); }
  });
  const wrap = el("div", {}, row, ...problems.map((p) => el("div", { className: `mg-problem ${p.level}` }, p.text)));
  return wrap;
}

/* ── Native rows ── */

function renderNative<R extends ConditionRecord | ActionRecord>(ctx: RowContext, kind: "condition" | "action", record: R, segments: Segment[], into: HTMLElement, h: RowHandlers<R>): void {
  const { api, host, store } = ctx;
  const t = api.i18n.t;
  const set = (field: string, value: number) => h.onChange({ ...record, [field]: value });
  for (const seg of segments) {
    if (seg.kind === "text") { into.append(seg.text); continue; }
    const { arg, value } = seg;
    const className = seg.role === "eud" ? "eud" : seg.role === "counter" ? "counter" : arg.kind === "text" ? "text" : "";
    const color = arg.kind === "player" ? ctx.namer.playerColor?.(value) ?? null : null;
    const chip = chipEl(api, seg.label, className, color, arg.kind === "location" && value > 0 && value < 64 ? t("Click to change; hover to show on the map") : arg.label);
    if (arg.kind === "location") {
      chip.addEventListener("pointerenter", () => host.flashLocation(value));
    }
    chip.addEventListener("click", () => {
      const isDeaths = record.type === (kind === "condition" ? ConditionType.Deaths : ActionType.SetDeaths);
      if (seg.role === "counter") { pickCounter(ctx, chip, record, kind, h); return; }
      switch (arg.kind) {
        case "player": pickPlayer(api, host, chip, value, (v) => set(arg.field, v), { eud: isDeaths }); break;
        case "unit": pickUnitType(api, host, chip, value, (v) => set(arg.field, v), { classes: !isDeaths || kind === "condition" }); break;
        case "location": pickLocation(api, host, chip, value, (v) => set(arg.field, v)); break;
        case "switch": pickSwitch(api, host, chip, value, (v) => set(arg.field, v), (i, name) => { host.renameSwitch(i, name); store.reload(); }); break;
        case "wav": pickSound(api, host, chip, value, (v) => set(arg.field, v)); break;
        case "text": pickText(api, chip, ctx.namer.string(value) ?? "", (text) => h.onChangeWithText(text, (i) => ({ ...record, [arg.field]: i })), { title: arg.label }); break;
        case "aiScript": pickNamed(api, chip, AI_SCRIPT_CHOICES.map((s) => ({ value: aiScriptCode(s.id), label: s.name, hint: s.id })), value, (v) => set(arg.field, v), 300); break;
        case "cuwp": pickNumber(api, chip, value, (v) => set(arg.field, v), { min: 0, max: 64, hint: t("A Unit Properties slot, 1 to 64; 0 for none") }); break;
        case "slot": pickNumber(api, chip, value + 1, (v) => set(arg.field, v - 1), { min: 1, max: 4, hint: t("Portrait slot, 1 to 4") }); break;
        case "count": pickNumber(api, chip, value, (v) => set(arg.field, v), { min: 0, max: 255, hint: t("0 means all") }); break;
        case "percent": pickNumber(api, chip, value, (v) => set(arg.field, v), { min: 0, max: 100, unit: "%" }); break;
        case "duration": pickNumber(api, chip, value, (v) => set(arg.field, v), { min: 0, max: 4294967295, unit: arg.label === "Seconds" ? t("seconds") : "ms" }); break;
        case "number": case "amount": pickNumber(api, chip, value, (v) => set(arg.field, v), { min: 0, max: 4294967295 }); break;
        case "textFlags": {
          const a = record as ActionRecord;
          pickChoice(api, chip, choicesOf(api, "textFlags"), (v) => h.onChange({ ...record, flags: v ? a.flags | 4 : a.flags & ~4 }), { current: a.flags & 4 });
          break;
        }
        default: pickChoice(api, chip, choicesOf(api, arg.kind), (v) => set(arg.field, v), { current: value });
      }
    });
    into.append(chip);
  }
  // A plain deaths row on a cell nothing names: offer a name.
  const isDeaths = record.type === (kind === "condition" ? ConditionType.Deaths : ActionType.SetDeaths);
  if (isDeaths && record.player < 27 && !segments.some((s) => s.kind === "chip" && s.role === "counter")) {
    const name = api.ui.el("button", { type: "button", className: "mg-chip", title: t("Give this death counter a name, and use it by name everywhere") }, t("name…")) as HTMLButtonElement;
    name.addEventListener("click", () => nameCounter(ctx, record.player, record.unitId));
    into.append(" ", name);
  }
}

/** Name (or rename) the cell a Deaths row uses. */
function nameCounter(ctx: RowContext, player: number, unit: number): void {
  const { api, store } = ctx;
  const existing = store.sidecar.counters.find((c) => c.player === player && c.unit === unit);
  void api.ui.prompt(api.i18n.t("Name for this death counter"), { title: api.i18n.t("Counter name"), value: existing?.name ?? "" }).then((name) => {
    if (typeof name !== "string") return;
    const counters = store.sidecar.counters.filter((c) => !(c.player === player && c.unit === unit));
    if (name.trim()) counters.push({ player, unit, name: name.trim() });
    store.updateSidecar(api.i18n.t("Name counter"), { counters });
  });
}

/** The counter chip: every named counter, the cell itself, a new one, or take the name off. */
function pickCounter<R extends ConditionRecord | ActionRecord>(ctx: RowContext, chip: HTMLElement, record: R, kind: "condition" | "action", h: RowHandlers<R>): void {
  const { api, host, store } = ctx;
  const t = api.i18n.t;
  const items = store.sidecar.counters.map((c) => ({ value: cellKey(c.player, c.unit), label: c.name, hint: `${ctx.namer.player(c.player)} · ${ctx.namer.unit(c.unit)}` }));
  const current = cellKey(record.player, record.unitId);
  pickChoice(api, chip, items, (key) => {
    const c = store.sidecar.counters.find((x) => cellKey(x.player, x.unit) === key);
    if (c) h.onChange({ ...record, player: c.player, unitId: c.unit });
  }, {
    current, width: 280, searchable: true,
    actions: [
      { label: t("New counter…"), run: (p) => {
        p.close();
        const used = usage(store.list).cells;
        for (const c of store.sidecar.counters) used.add(cellKey(c.player, c.unit));
        const cell = allocate(used, host.placedUnitIds());
        if (!cell) { api.ui.toast({ kind: "error", title: t("No free counter cell") }); return; }
        void api.ui.prompt(t("Name for the new counter"), { title: t("New counter") }).then((name) => {
          if (typeof name !== "string" || !name.trim()) return;
          store.commit(t("New counter"), () => store.list.map((tr, i) => (i !== ctx.triggerIndex ? tr : {
            ...tr,
            conditions: kind === "condition" ? tr.conditions.map((c) => (c === record ? { ...c, player: cell[0], unitId: cell[1] } : c)) : tr.conditions,
            actions: kind === "action" ? tr.actions.map((a) => (a === record ? { ...a, player: cell[0], unitId: cell[1] } : a)) : tr.actions,
          })), { sidecar: { counters: [...store.sidecar.counters, { player: cell[0], unit: cell[1], name: name.trim() }] } });
        });
      } },
      { label: t("Rename…"), run: (p) => { p.close(); nameCounter(ctx, record.player, record.unitId); } },
      { label: t("Show as player and unit"), run: (p) => { p.close(); store.updateSidecar(t("Unname counter"), { counters: store.sidecar.counters.filter((c) => !(c.player === record.player && c.unit === record.unitId)) }); } },
    ],
  });
}

/* ── EUD rows ── */

function eudTitle(entry: Entry, row: EudRow): string {
  const address = entryAddress(entry, row.args);
  const rw = entry.remastered.read && entry.remastered.write ? "read and write" : entry.remastered.read ? "read only" : "write only";
  return [`${entry.name} — 0x${address.toString(16).toUpperCase()}, ${entry.width === "bit" ? "one bit" : `${entry.width} byte${entry.width > 1 ? "s" : ""}`}, Remastered: ${rw}.`, entry.note, `Source: ${entry.source}.`].filter(Boolean).join("\n");
}

function renderEud(ctx: RowContext, kind: "condition" | "action", row: EudRow, into: HTMLElement, onChange: (row: EudRow) => void): void {
  const { api, host } = ctx;
  const t = api.i18n.t;
  const placed = new Map(host.placedUnits().map((u) => [u.slot, u]));
  const extraWithSlots = { ...ctx.extra, slot: (n: number) => { const u = placed.get(n); return u ? `${ctx.namer.unit(u.unitId)} (slot ${n})` : `slot ${n}`; } };
  const segments: EudSegment[] = describeEud(row, kind, ctx.namer, extraWithSlots);
  const entry = row.entry;
  const update = (patch: Partial<EudRow>) => onChange({ ...row, ...patch, args: { ...row.args, ...(patch.args ?? {}) } });
  for (const seg of segments) {
    if (seg.kind === "text") { into.append(seg.text); continue; }
    if (seg.kind === "chip") { into.append(chipEl(api, seg.label, "")); continue; }
    const chip = chipEl(api, seg.label, "eud", seg.slot !== "value" && seg.slot !== "op" && seg.slot.arg.kind === "player" ? ctx.namer.playerColor?.(seg.value) ?? null : entry.value?.kind === "player" && seg.slot === "value" ? ctx.namer.playerColor?.(seg.value) ?? null : null);
    chip.addEventListener("click", () => {
      if (seg.slot === "op") {
        pickChoice(api, chip, choicesOf(api, kind === "condition" ? "comparison" : "modifier"), (v) => update({ op: v }), { current: row.op });
        return;
      }
      if (seg.slot === "value") {
        const v = entry.value;
        if (v?.choices) pickChoice(api, chip, v.choices, (value) => update({ value }), { current: row.value });
        else if (v?.kind === "unit") pickUnitType(api, host, chip, row.value, (value) => update({ value }), { classes: false });
        else if (v?.kind === "player") pickPlayer(api, host, chip, row.value, (value) => update({ value }), { eud: false });
        else if (v?.kind === "weapon") pickNamed(api, chip, [...host.weapons(), { value: 130, label: t("No weapon") }], row.value, (value) => update({ value }));
        else pickNumber(api, chip, row.value, (value) => update({ value }), { min: v?.min ?? 0, max: v?.max ?? 4294967295, unit: v?.unit, integer: (v?.scale ?? 1) === 1, step: (v?.scale ?? 1) === 1 ? 1 : 0.01, hint: entry.note });
        return;
      }
      const arg = seg.slot.arg;
      const setArg = (value: number) => update({ args: { [arg.name]: value } });
      switch (arg.kind) {
        case "unit": pickUnitType(api, host, chip, seg.value, setArg, { classes: false }); break;
        case "player": pickPlayer(api, host, chip, seg.value, setArg, { eud: false }); break;
        case "weapon": pickNamed(api, chip, host.weapons(), seg.value, setArg); break;
        case "upgrade": pickNamed(api, chip, host.upgrades().filter((u) => u.value < arg.max), seg.value, setArg); break;
        case "tech": pickNamed(api, chip, host.techs().filter((u) => u.value < arg.max), seg.value, setArg); break;
        case "key": pickKey(api, chip, seg.value, setArg); break;
        case "unitIndex": pickPlacedUnit(api, host, chip, seg.value, setArg); break;
        default: pickNumber(api, chip, seg.value, setArg, { min: 0, max: arg.max - 1 });
      }
    });
    into.append(chip);
  }
  const tag = api.ui.el("span", { className: "mg-tag", title: eudTitle(entry, row) }, "EUD");
  into.append(tag);
  if (kind === "action" && !entry.remastered.write) into.append(api.ui.el("span", { className: "mg-tag ro", title: t("Remastered does not let a trigger write this address; the action does nothing in the game.") }, t("read only")));
}
