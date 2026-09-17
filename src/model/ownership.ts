/**
 * Who owns what in the sidecar. A build row (a hook on a flag cell, a scan on a cell) and
 * a counter step (an expansion on a flag cell) are private to the trigger that carries
 * the record on that cell: a second trigger on the same cell would edit the same sentence
 * and, on the server, fire the same hook. So a duplicate — or a paste of this map's own
 * text — gets rows of its own on fresh cells (`detach`), a row removed from one trigger
 * takes its definition with it only when no other trigger reads it (`refs`), and a
 * deleted trigger takes its private definitions along (`prune`). A chat command, a
 * synced key and a named counter are shared on purpose and are left alone.
 */
import { ConditionType, type ConditionRecord, type TriggerRecord } from "../../vendor/triggers";
import type { BuildRecord } from "./builds";
import type { Cell } from "./counters";
import { isFlagAction } from "./expansions";
import { liveActions, liveConditions } from "./records";
import type { ExpansionRecord } from "./sync";

const readsCell = (c: ConditionRecord, cell: Cell) => c.type === ConditionType.Deaths && c.player === cell[0] && c.unitId === cell[1];

/** The cell a record is private through, or null for a shared one (a chat command). */
export function privateCell(record: BuildRecord | ExpansionRecord): Cell | null {
  if ("flag" in record) return record.flag;
  if (record.kind === "scan") return record.cell;
  return null;
}

/** Whether the trigger carries the record: a flag action for a hook or step, a condition on the cell for a scan. */
export function carries(trigger: TriggerRecord, record: BuildRecord | ExpansionRecord): boolean {
  const cell = privateCell(record);
  if (!cell) return false;
  if (record.kind === "scan") return liveConditions(trigger).some((c) => readsCell(c, cell));
  return liveActions(trigger).some((a) => isFlagAction(a, { cell }));
}

/** The indexes of the triggers that carry the record. */
export function refs(list: readonly TriggerRecord[], record: BuildRecord | ExpansionRecord): number[] {
  const out: number[] = [];
  list.forEach((t, i) => { if (carries(t, record)) out.push(i); });
  return out;
}

/** Whether a trigger other than `except` carries the record — when removing a row must keep its definition. */
export const sharedElsewhere = (list: readonly TriggerRecord[], record: BuildRecord | ExpansionRecord, except: number): boolean =>
  refs(list, record).some((i) => i !== except);

let serial = 0;
/** A record id nobody has: the time, and a counter for two in the same millisecond. */
export const freshId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(serial++ % 1296).toString(36).padStart(2, "0")}`;

export interface Detached {
  trigger: TriggerRecord;
  builds: BuildRecord[];
  expansions: ExpansionRecord[];
  /** How many private rows were moved to cells of their own. */
  moved: number;
  /** Rows that could not get a cell of their own and stay shared. */
  stuck: number;
}

/**
 * The trigger with rows of its own: every hook, scan and counter step it carries that is
 * a record of `builds` / `expansions` is copied to a fresh id and a fresh cell — `alloc`
 * answers one the map, the sidecar and the cells taken so far do not use — and the
 * trigger's records are rewritten to the new cells. The sidecar's lists come back with
 * the copies appended. A trigger pasted from another map carries no record of this
 * sidecar and comes back as it is.
 */
export function detach(trigger: TriggerRecord, builds: readonly BuildRecord[], expansions: readonly ExpansionRecord[], alloc: (taken: Cell[]) => Cell | null): Detached {
  const taken: Cell[] = [];
  let moved = 0, stuck = 0;
  const actions = [...trigger.actions];
  const conditions = [...trigger.conditions];
  const nextBuilds = [...builds];
  const nextExpansions = [...expansions];
  const fresh = (): Cell | null => { const c = alloc(taken); if (c) taken.push(c); return c; };

  for (const b of builds) {
    const cell = privateCell(b);
    if (!cell || !carries(trigger, b)) continue;
    const to = fresh();
    if (!to) { stuck++; continue; }
    if (b.kind === "scan") {
      nextBuilds.push({ ...b, id: freshId("s"), cell: to });
      conditions.forEach((c, i) => { if (readsCell(c, cell)) conditions[i] = { ...c, player: to[0], unitId: to[1] }; });
    } else {
      nextBuilds.push({ ...b, id: freshId("b"), flag: to } as BuildRecord);
      actions.forEach((a, i) => { if (isFlagAction(a, { cell })) actions[i] = { ...a, player: to[0], unitId: to[1] }; });
    }
    moved++;
  }
  for (const x of expansions) {
    if (!("flag" in x) || !carries(trigger, x)) continue;
    const to = fresh();
    if (!to) { stuck++; continue; }
    nextExpansions.push({ ...x, id: freshId("c"), flag: to });
    actions.forEach((a, i) => { if (isFlagAction(a, { cell: x.flag })) actions[i] = { ...a, player: to[0], unitId: to[1] }; });
    moved++;
  }
  return { trigger: { ...trigger, actions, conditions }, builds: nextBuilds, expansions: nextExpansions, moved, stuck };
}

/** The build records without those only the triggers at `removed` carried (chat commands stay: a message is shared). */
export function prune(builds: readonly BuildRecord[], list: readonly TriggerRecord[], removed: readonly number[]): BuildRecord[] {
  const gone = new Set(removed);
  return builds.filter((b) => {
    if (!privateCell(b)) return true;
    const r = refs(list, b);
    return r.length === 0 || r.some((i) => !gone.has(i));
  });
}

/**
 * The build records in the order the map runs them: hooks and scans by where their
 * trigger sits in the list and their row in it, so two hooks in one trigger fire in the
 * order the rows show; records no trigger carries last. The server runs the hooks of a
 * cycle in the spec's order, which is this one.
 */
export function orderBuilds(builds: readonly BuildRecord[], list: readonly TriggerRecord[]): BuildRecord[] {
  const at = (b: BuildRecord): number => {
    const cell = privateCell(b);
    if (!cell) return -1;
    for (let i = 0; i < list.length; i++) {
      const rows = b.kind === "scan" ? liveConditions(list[i]).findIndex((c) => readsCell(c, cell)) : liveActions(list[i]).findIndex((a) => isFlagAction(a, { cell }));
      if (rows >= 0) return i * 1024 + rows;
    }
    return Number.MAX_SAFE_INTEGER;
  };
  return builds.map((b, i) => ({ b, i, at: at(b) })).sort((x, y) => x.at - y.at || x.i - y.i).map((x) => x.b);
}
