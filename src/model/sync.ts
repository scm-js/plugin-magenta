/**
 * Keeping the generated runs in step with what asked for them. After every change the
 * list is *cleaned* — every run Magenta generated (found by its markers) taken out — the
 * expansions the sidecar records are checked against the clean list (a counter
 * expansion lives while some trigger carries its flag action; a compare or per-player
 * one while its anchor is there), and the runs are generated again and put back: after
 * the anchor for an action expansion, before it for a comparison. The result is what
 * the map holds; the claims fence the runs in the other editors.
 */
import type { TriggerRecord } from "../../vendor/triggers";
import { PlayerGroup } from "../../vendor/triggers";
import type { Cell } from "./counters";
import { beginMarker, compareRun, counterRun, endMarker, forEachPlayerRun, isFlagAction, markerOf, rowMarker, type Markers } from "./expansions";
import { fingerprint, owners, setOwners } from "./records";
import type { TriggerRef } from "./sidecar";

export type ExpansionRecord =
  | { id: string; kind: "copy" | "add" | "subtract"; from: Cell; to: Cell; bits?: number; flag: Cell }
  | { id: string; kind: "compare"; a: Cell; b: Cell; scratch: [Cell, Cell]; bits?: number; anchor: TriggerRef }
  | { id: string; kind: "forEachPlayer"; placeholder: number; players: number[]; anchor: TriggerRef };

export interface SyncResult {
  list: TriggerRecord[];
  expansions: ExpansionRecord[];
  /** Where each run landed, for the claims. */
  runs: { id: string; start: number; count: number; anchor: number }[];
  /** Index in the returned list for each index of the clean list (for folders and the selection). */
  remap: number[];
}

/** The list without any of Magenta's runs. */
export function clean(list: readonly TriggerRecord[], text: (index: number) => string | null): TriggerRecord[] {
  return list.filter((t) => !markerOf(t, text));
}

/** The anchor of a record in the clean list: the ref's index when its fingerprint matches, else the first trigger with that fingerprint, else the index. */
function anchorOf(list: readonly TriggerRecord[], ref: TriggerRef): number {
  if (ref.i < list.length && fingerprint(list[ref.i]) === ref.h) return ref.i;
  const at = list.findIndex((t) => fingerprint(t) === ref.h);
  if (at >= 0) return at;
  return ref.i < list.length ? ref.i : -1;
}

export function sync(list: readonly TriggerRecord[], expansions: readonly ExpansionRecord[], text: (index: number) => string | null, intern: (text: string) => number): SyncResult {
  const base = clean(list, text);
  const kept: ExpansionRecord[] = [];
  const inserts = new Map<number, { before: TriggerRecord[]; after: TriggerRecord[]; ids: { id: string; where: "before" | "after"; count: number }[] }>();
  const slot = (i: number) => { let s = inserts.get(i); if (!s) { s = { before: [], after: [], ids: [] }; inserts.set(i, s); } return s; };
  const markers = (id: string): Markers => ({ row: intern(rowMarker(id)), begin: intern(beginMarker(id)), end: intern(endMarker(id)) });
  const out = [...base];
  // A per-player template owns no player itself; runs hanging off it are owned by its players.
  const perPlayer = new Map<number, number[]>();
  for (const x of expansions) if (x.kind === "forEachPlayer") { const at = anchorOf(base, x.anchor); if (at >= 0) perPlayer.set(at, x.players); }
  const ownersAt = (at: number) => perPlayer.get(at) ?? owners(base[at]);
  for (const x of expansions) {
    if (x.kind === "copy" || x.kind === "add" || x.kind === "subtract") {
      const at = base.findIndex((t) => t.actions.some((a) => isFlagAction(a, { cell: x.flag })));
      if (at < 0) continue;
      const run = counterRun(x, ownersAt(at), { cell: x.flag }, markers(x.id));
      const s = slot(at);
      s.after.push(...run);
      s.ids.push({ id: x.id, where: "after", count: run.length });
      kept.push(x);
    } else if (x.kind === "compare") {
      const at = anchorOf(base, x.anchor);
      if (at < 0) continue;
      const run = compareRun(x, ownersAt(at), markers(x.id));
      const s = slot(at);
      s.before.push(...run);
      s.ids.push({ id: x.id, where: "before", count: run.length });
      kept.push({ ...x, anchor: { i: at, h: fingerprint(base[at]) } });
    } else if (x.kind === "forEachPlayer") {
      const at = anchorOf(base, x.anchor);
      if (at < 0) continue;
      // The anchor is the template and never runs itself.
      if (owners(base[at]).length) out[at] = setOwners(base[at], []);
      const run = forEachPlayerRun(x, base[at], markers(x.id));
      const s = slot(at);
      s.after.push(...run);
      s.ids.push({ id: x.id, where: "after", count: run.length });
      kept.push({ ...x, anchor: { i: at, h: fingerprint(out[at]) } });
    }
  }
  const result: TriggerRecord[] = [];
  const runs: SyncResult["runs"] = [];
  const remap: number[] = [];
  for (let i = 0; i < out.length; i++) {
    const s = inserts.get(i);
    if (s) {
      let pos = result.length;
      for (const id of s.ids) if (id.where === "before") { runs.push({ id: id.id, start: pos, count: id.count, anchor: -1 }); pos += id.count; }
      result.push(...s.before);
    }
    remap.push(result.length);
    result.push(out[i]);
    if (s) {
      let pos = result.length;
      for (const id of s.ids) if (id.where === "after") { runs.push({ id: id.id, start: pos, count: id.count, anchor: remap[i] }); pos += id.count; }
      result.push(...s.after);
      for (const r of runs) if (r.anchor === -1 && r.start < remap[i] && r.start + r.count <= remap[i]) r.anchor = remap[i];
    }
  }
  return { list: result, expansions: kept, runs, remap };
}

/** The players a per-player expansion offers by default: the eight human slots. */
export const HUMAN_PLAYERS: number[] = Array.from({ length: 8 }, (_, i) => i);
export const DEFAULT_PLACEHOLDER = PlayerGroup.CurrentPlayer;
