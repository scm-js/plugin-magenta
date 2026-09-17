/**
 * The rows for Tier A+: a counter copy / add / subtract (the anchor's flag action, read
 * as "Copy A into B"), and a comparison (the anchor's conditions on the scratch cells,
 * read as "A is > B"). Their chips edit the sidecar's expansion; the store's sync pass
 * rebuilds the run.
 */
import type { PluginApi, ActionRecord, ConditionRecord, TriggerRecord } from "@scm-js/plugin-api";
import { Comparison, ConditionType } from "../../vendor/triggers";
import { allocate, cellKey, COUNTER_UNITS, usage, type Cell } from "../model/counters";
import { compareConditions, isFlagAction } from "../model/expansions";
import type { Namer } from "../model/names";
import type { ExpansionRecord } from "../model/sync";
import { pickChoice } from "./chips";
import type { Host } from "./host";
import type { Store } from "./store";

export type Relation = ">" | ">=" | "==" | "<" | "<=";
const RELATIONS: { value: number; label: string; rel: Relation }[] = [
  { value: 0, label: "greater than", rel: ">" }, { value: 1, label: "at least", rel: ">=" }, { value: 2, label: "equal to", rel: "==" }, { value: 3, label: "less than", rel: "<" }, { value: 4, label: "at most", rel: "<=" },
];

export const RELATION_WORDS: Record<Relation, string> = Object.fromEntries(RELATIONS.map((r) => [r.rel, r.label])) as Record<Relation, string>;

export const counterExpansionOf = (store: Store, a: ActionRecord) =>
  store.sidecar.expansions.find((x): x is Extract<ExpansionRecord, { kind: "copy" | "add" | "subtract" }> => (x.kind === "copy" || x.kind === "add" || x.kind === "subtract") && isFlagAction(a, { cell: x.flag })) ?? null;

/** The comparison anchored on this trigger, and which of its conditions read the scratch cells. */
export function compareOf(store: Store, index: number, trigger: TriggerRecord): { x: Extract<ExpansionRecord, { kind: "compare" }>; rows: number[]; relation: Relation } | null {
  const clean = store.cleanIndex(index);
  const x = store.sidecar.expansions.find((e): e is Extract<ExpansionRecord, { kind: "compare" }> => e.kind === "compare" && e.anchor.i === clean);
  if (!x) return null;
  const reads = (c: ConditionRecord, cell: Cell) => c.type === ConditionType.Deaths && c.player === cell[0] && c.unitId === cell[1];
  const rows = trigger.conditions.map((c, i) => (reads(c, x.scratch[0]) || reads(c, x.scratch[1]) ? i : -1)).filter((i) => i >= 0);
  const found = rows.map((i) => trigger.conditions[i]);
  let relation: Relation = "==";
  for (const r of RELATIONS) {
    const want = compareConditions(x, r.rel);
    if (want.length === found.length && want.every((w, i) => w.player === found[i].player && w.unitId === found[i].unitId && w.comparison === found[i].comparison && w.amount === found[i].amount)) relation = r.rel;
  }
  return { x, rows, relation };
}

export function cellLabel(cell: Cell, namer: Namer): string {
  return namer.counter?.(cell[0], cell[1]) ?? `${namer.player(cell[0])}'s ${namer.unit(cell[1]).replace(/ \(Unused\)$/, "")} deaths`;
}

/** A free cell for a flag or scratch: nothing in the map, the sidecar's counters, or other expansions uses it. */
export function freeCell(store: Store, host: Host, taken: Cell[] = []): Cell | null {
  const used = usage(store.list).cells;
  for (const c of store.sidecar.counters) used.add(cellKey(c.player, c.unit));
  for (const x of store.sidecar.expansions) {
    if (x.kind === "compare") { used.add(cellKey(...x.scratch[0])); used.add(cellKey(...x.scratch[1])); used.add(cellKey(...x.a)); used.add(cellKey(...x.b)); }
    else if (x.kind !== "forEachPlayer") { used.add(cellKey(...x.flag)); used.add(cellKey(...x.from)); used.add(cellKey(...x.to)); }
  }
  for (const b of store.sidecar.builds) if ("flag" in b) used.add(cellKey(...b.flag));
  if (store.sidecar.chat) used.add(cellKey(...store.sidecar.chat.cell));
  for (const b of store.sidecar.builds) if (b.kind === "scan") used.add(cellKey(...b.cell));
  const m = store.sidecar.msqc;
  if (m) for (const unit of [...Object.values(m.keys), ...Object.values(m.clicks), ...Object.values(m.mouseIn), ...(m.select ? [m.select.ptr, m.select.type] : [])]) for (let p = 0; p < 12; p++) used.add(cellKey(p, unit));
  for (const c of taken) used.add(cellKey(...c));
  return allocate(used, host.placedUnitIds());
}

/** A whole counter unit nothing uses: for an MSQC event, whose cells are one per player. */
export function freeUnit(store: Store, host: Host): number | null {
  const used = usage(store.list).cells;
  const taken = new Set<number>();
  for (const k of used) taken.add(Math.floor(k / 12));
  for (const c of store.sidecar.counters) taken.add(c.unit);
  for (const x of store.sidecar.expansions) {
    if (x.kind === "compare") { taken.add(x.scratch[0][1]); taken.add(x.scratch[1][1]); taken.add(x.a[1]); taken.add(x.b[1]); }
    else if (x.kind !== "forEachPlayer") { taken.add(x.flag[1]); taken.add(x.from[1]); taken.add(x.to[1]); }
  }
  for (const b of store.sidecar.builds) { if ("flag" in b) taken.add(b.flag[1]); if (b.kind === "scan") taken.add(b.cell[1]); }
  if (store.sidecar.chat) taken.add(store.sidecar.chat.cell[1]);
  const m = store.sidecar.msqc;
  if (m) for (const unit of [...Object.values(m.keys), ...Object.values(m.clicks), ...Object.values(m.mouseIn), ...(m.select ? [m.select.ptr, m.select.type] : [])]) taken.add(unit);
  const placed = host.placedUnitIds();
  for (const unit of COUNTER_UNITS) if (!taken.has(unit) && !placed.has(unit)) return unit;
  return null;
}

/** A counter cell: the named counters, or a new one. */
export function pickCell(api: PluginApi, host: Host, store: Store, anchor: HTMLElement, current: Cell, onPick: (cell: Cell) => void): void {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const items = store.sidecar.counters.map((c) => ({ value: cellKey(c.player, c.unit), label: c.name, hint: `${namer.player(c.player)} · ${namer.unit(c.unit)}` }));
  pickChoice(api, anchor, items, (key) => onPick([key % 12, Math.floor(key / 12)]), {
    current: cellKey(...current), width: 280, searchable: true,
    actions: [{ label: t("New counter…"), run: (p) => {
      p.close();
      const cell = freeCell(store, host);
      if (!cell) { api.ui.toast({ kind: "error", title: t("No free counter cell") }); return; }
      void api.ui.prompt(t("Name for the new counter"), { title: t("New counter") }).then((name) => {
        if (typeof name !== "string" || !name.trim()) return;
        store.sidecar.counters.push({ player: cell[0], unit: cell[1], name: name.trim() });
        onPick(cell);
      });
    } }],
  });
}

function chip(api: PluginApi, label: string, className = "counter"): HTMLButtonElement {
  return api.ui.el("button", { type: "button", className: `mg-chip ${className}` }, label) as HTMLButtonElement;
}

/** "Copy [A] into [B]" — the sentence of a counter expansion, with its chips live. */
export function renderCounterExpansion(api: PluginApi, host: Host, store: Store, x: Extract<ExpansionRecord, { kind: "copy" | "add" | "subtract" }>, into: HTMLElement): void {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const update = (patch: Partial<typeof x>) => store.updateSidecar(t("Edit counter step"), { expansions: store.sidecar.expansions.map((e) => (e.id === x.id ? { ...e, ...patch } as ExpansionRecord : e)) });
  const from = chip(api, cellLabel(x.from, namer));
  from.addEventListener("click", () => pickCell(api, host, store, from, x.from, (cell) => update({ from: cell })));
  const to = chip(api, cellLabel(x.to, namer));
  to.addEventListener("click", () => pickCell(api, host, store, to, x.to, (cell) => update({ to: cell })));
  const bits = chip(api, `${x.bits ?? 32}-bit`, "");
  bits.title = t("How many bits of the counter to carry: 16 is half the triggers for a counter that stays under 65536");
  bits.addEventListener("click", () => pickChoice(api, bits, [{ value: 16, label: t("16-bit (up to 65,535)") }, { value: 32, label: t("32-bit (any count)") }], (v) => update({ bits: v }), { current: x.bits ?? 32 }));
  if (x.kind === "copy") into.append(t("Copy "), from, t(" into "), to, " ", bits);
  else if (x.kind === "add") into.append(t("Add "), from, t(" to "), to, " ", bits);
  else into.append(t("Subtract "), from, t(" from "), to, " ", bits);
  into.append(api.ui.el("span", { className: "mg-tag", title: t("Done by a run of {n} generated triggers right after this one, in the same cycle: this trigger's own rows run first, the triggers after the run see the result. The run is hidden here and locked in the other editors.", { n: (x.bits ?? 32) + (x.kind === "copy" ? 2 : 1) }) }, "A+"));
}

/** "[A] is [greater than] [B]" — the sentence of a comparison, with its chips live. */
export function renderCompare(api: PluginApi, host: Host, store: Store, index: number, trigger: TriggerRecord, cmp: NonNullable<ReturnType<typeof compareOf>>, into: HTMLElement): void {
  const t = api.i18n.t;
  const namer = host.namer(store.sidecar);
  const { x } = cmp;
  const update = (patch: Partial<typeof x>) => store.updateSidecar(t("Edit comparison"), { expansions: store.sidecar.expansions.map((e) => (e.id === x.id ? { ...e, ...patch } as ExpansionRecord : e)) });
  const a = chip(api, cellLabel(x.a, namer));
  a.addEventListener("click", () => pickCell(api, host, store, a, x.a, (cell) => update({ a: cell })));
  const b = chip(api, cellLabel(x.b, namer));
  b.addEventListener("click", () => pickCell(api, host, store, b, x.b, (cell) => update({ b: cell })));
  const rel = chip(api, RELATIONS.find((r) => r.rel === cmp.relation)?.label ?? "?", "");
  rel.addEventListener("click", () => pickChoice(api, rel, RELATIONS, (v) => {
    const next = compareConditions(x, RELATIONS[v].rel);
    const conditions = trigger.conditions.filter((_, i) => !cmp.rows.includes(i));
    conditions.splice(cmp.rows[0] ?? conditions.length, 0, ...next);
    store.replace(index, { ...trigger, conditions }, t("Edit comparison"));
  }, { current: RELATIONS.findIndex((r) => r.rel === cmp.relation) }));
  into.append(a, t(" is "), rel, " ", b);
  into.append(api.ui.el("span", { className: "mg-tag", title: t("Answered by a run of generated triggers before this one, every cycle; they are hidden here and locked in the other editors.") }, "A+"));
}

/** The conditions to insert for a new comparison, and the expansion to record. */
export function newCompare(store: Store, host: Host, index: number, trigger: TriggerRecord): { conditions: ConditionRecord[]; expansion: ExpansionRecord } | null {
  const named = store.sidecar.counters;
  const a: Cell = named[0] ? [named[0].player, named[0].unit] : freeCell(store, host) ?? [0, 181];
  const b: Cell = named[1] ? [named[1].player, named[1].unit] : freeCell(store, host, [a]) ?? [1, 181];
  const s0 = freeCell(store, host, [a, b]);
  const s1 = s0 ? freeCell(store, host, [a, b, s0]) : null;
  if (!s0 || !s1) return null;
  const x: ExpansionRecord = { id: `k${Date.now().toString(36)}`, kind: "compare", a, b, scratch: [s0, s1], bits: 32, anchor: { i: store.cleanIndex(index), h: "" } };
  void trigger;
  return { conditions: compareConditions(x, ">"), expansion: x };
}

/** The flag action to insert for a new counter step, and the expansion to record. */
export function newCounterStep(store: Store, host: Host, what: "copy" | "add" | "subtract"): { expansion: ExpansionRecord; flag: Cell } | null {
  const named = store.sidecar.counters;
  const from: Cell = named[0] ? [named[0].player, named[0].unit] : freeCell(store, host) ?? [0, 181];
  const to: Cell = named[1] ? [named[1].player, named[1].unit] : freeCell(store, host, [from]) ?? [1, 181];
  const flag = freeCell(store, host, [from, to]);
  if (!flag) return null;
  return { expansion: { id: `c${Date.now().toString(36)}`, kind: what, from, to, bits: 32, flag }, flag };
}

export const isCompareCondition = (c: ConditionRecord) => c.type === ConditionType.Deaths && (c.comparison === Comparison.AtLeast || c.comparison === Comparison.Exactly);
