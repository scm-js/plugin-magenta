/**
 * The panel's state: the trigger list as the map holds it, the sidecar, what is
 * selected, and an undo stack of its own — triggers sit outside the editor's undo model.
 * Every change goes through `commit`, which writes the map, and `reload` brings the
 * state back from the map when something else changed it.
 */
import type { TriggerRecord } from "@scm-js/plugin-api";
import { markerOf } from "../model/expansions";
import { clone, fingerprint } from "../model/records";
import { folderOf, withFolders, type Sidecar } from "../model/sidecar";
import { sync, type SyncResult } from "../model/sync";
import type { Host } from "./host";

interface Snapshot {
  list: TriggerRecord[];
  sidecar: Sidecar;
  label: string;
}

export type Listener = () => void;

export class Store {
  readonly host: Host;
  list: TriggerRecord[] = [];
  sidecar: Sidecar;
  /** Folder id by trigger index. */
  folders = new Map<number, string>();
  selected: number | null = null;
  /** The "In plain words" fold under the open trigger is open (a session setting, not undone). */
  showExplain = false;
  /** Where Magenta's own generated runs sit in the list, as the last sync placed them. */
  runs: SyncResult["runs"] = [];
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<Listener>();
  /** Fingerprints of the list as last read or written, to tell our own "triggers" event from another's. */
  private prints: string[] = [];
  private writing = false;
  private readonly afterCommit?: () => void;

  constructor(host: Host, afterCommit?: () => void) {
    this.host = host;
    this.afterCommit = afterCommit;
    this.sidecar = host.sidecar();
    this.reload();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /** Bring the state back from the map. Keeps the selection by fingerprint where it can. */
  reload(): void {
    if (this.writing) return;
    const list = this.host.triggers();
    const prints = list.map(fingerprint);
    const selectedPrint = this.selected !== null ? this.prints[this.selected] : null;
    this.list = list;
    this.prints = prints;
    this.sidecar = this.host.sidecar();
    this.folders = folderOf(list, this.sidecar);
    this.runs = this.locateRuns(list);
    if (selectedPrint !== null) {
      const at = prints.indexOf(selectedPrint);
      this.selected = at >= 0 ? at : this.selected !== null && this.selected < list.length ? this.selected : null;
    }
    if (this.selected !== null && this.selected >= list.length) this.selected = list.length ? list.length - 1 : null;
    this.notify();
  }

  /** Whether the map's list differs from what we hold. */
  stale(): boolean {
    const list = this.host.triggers();
    if (list.length !== this.prints.length) return true;
    return list.some((t, i) => fingerprint(t) !== this.prints[i]);
  }

  select(index: number | null): void {
    this.selected = index === null ? null : this.anchorOf(index);
    this.notify();
  }

  /** Whether the trigger at `index` is one of Magenta's generated runs. */
  isRun(index: number): boolean {
    const t = this.list[index];
    return !!t && markerOf(t, (i) => this.host.string(i)) !== null;
  }

  /** The index of a trigger in the list without Magenta's runs — how the sidecar's anchors count. */
  cleanIndex(index: number): number {
    let n = 0;
    for (let i = 0; i < index && i < this.list.length; i++) if (!this.isRun(i)) n++;
    return n;
  }

  /** The trigger that asked for the run `index` is in, or `index` itself. */
  anchorOf(index: number): number {
    const run = this.runs.find((r) => index >= r.start && index < r.start + r.count);
    return run && run.anchor >= 0 ? run.anchor : index;
  }

  /** The runs as they sit in `list`, by their markers. */
  private locateRuns(list: readonly TriggerRecord[]): SyncResult["runs"] {
    const text = (i: number) => this.host.string(i);
    const runs: SyncResult["runs"] = [];
    let open: { id: string; start: number } | null = null;
    list.forEach((t, i) => {
      const m = markerOf(t, text);
      if (!m) return;
      if (m.edge === "begin") open = { id: m.id, start: i };
      if (m.edge === "end" && open && open.id === m.id) {
        const x = this.sidecar.expansions.find((e) => e.id === m.id);
        const before = x?.kind === "compare";
        runs.push({ id: m.id, start: open.start, count: i - open.start + 1, anchor: before ? i + 1 : open.start - 1 });
        open = null;
      }
    });
    return runs;
  }

  /**
   * Change the list and/or the sidecar, as one undo step. `build` returns the new list
   * (and may intern strings); `folders` the folder-by-index map for it, when it changes.
   */
  commit(label: string, build: (intern: (text: string) => number, strings: (string | null)[]) => TriggerRecord[], options: { folders?: Map<number, string>; sidecar?: Partial<Sidecar>; select?: number | null } = {}): void {
    this.undoStack.push({ list: clone(this.list), sidecar: clone(this.sidecar), label });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.apply(build, options);
  }

  private apply(build: (intern: (text: string) => number, strings: (string | null)[]) => TriggerRecord[], options: { folders?: Map<number, string>; sidecar?: Partial<Sidecar>; select?: number | null }): void {
    this.writing = true;
    let selected = options.select !== undefined ? options.select : this.selected;
    try {
      let next: TriggerRecord[] = this.list;
      let synced: SyncResult | null = null;
      const merged: Sidecar = { ...this.sidecar, ...options.sidecar };
      const text = (i: number) => this.host.string(i);
      let folders = options.folders ?? this.folders;
      this.host.write((intern, strings) => {
        const built = build(intern, strings);
        // Folders and the selection are kept in terms of the clean list, then mapped back.
        const toClean: number[] = [];
        let c = 0;
        for (const t of built) toClean.push(markerOf(t, (i) => strings[i] ?? text(i)) ? -1 : c++);
        synced = sync(built, merged.expansions, (i) => strings[i] ?? text(i), intern);
        const mapped = new Map<number, string>();
        for (const [i, f] of folders) { const k = toClean[i]; if (k !== undefined && k >= 0) mapped.set(synced.remap[k], f); }
        folders = mapped;
        if (selected !== null) { const k = toClean[selected]; selected = k !== undefined && k >= 0 ? synced.remap[k] : null; }
        next = synced.list;
        return next;
      });
      this.list = next;
      this.prints = next.map(fingerprint);
      merged.expansions = synced ? (synced as SyncResult).expansions : merged.expansions;
      this.runs = synced ? (synced as SyncResult).runs : this.locateRuns(next);
      const sidecar = withFolders(merged, next, folders);
      this.sidecar = sidecar;
      this.folders = folderOf(next, sidecar);
      this.host.saveSidecar(sidecar);
    } finally {
      this.writing = false;
    }
    this.afterCommit?.();
    this.selected = selected;
    if (this.selected !== null && this.selected >= this.list.length) this.selected = this.list.length ? this.list.length - 1 : null;
    this.notify();
  }

  /** Replace one trigger. */
  replace(index: number, trigger: TriggerRecord, label = "Edit trigger"): void {
    this.commit(label, () => this.list.map((t, i) => (i === index ? trigger : t)));
  }

  /** Change the sidecar only (a counter name, a folder rename, a setting). */
  updateSidecar(label: string, patch: Partial<Sidecar>): void {
    this.commit(label, () => this.list, { sidecar: patch });
  }

  canUndo(): string | null { return this.undoStack.at(-1)?.label ?? null; }
  canRedo(): string | null { return this.redoStack.at(-1)?.label ?? null; }

  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push({ list: clone(this.list), sidecar: clone(this.sidecar), label: snap.label });
    this.restore(snap);
  }

  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push({ list: clone(this.list), sidecar: clone(this.sidecar), label: snap.label });
    this.restore(snap);
  }

  private restore(snap: Snapshot): void {
    this.apply(() => snap.list, { folders: folderOf(snap.list, snap.sidecar), sidecar: snap.sidecar });
  }
}
