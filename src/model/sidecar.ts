/**
 * What the map file cannot hold about its triggers — folders, counter names, the map's
 * Magenta settings — kept as one archive member (`magenta\magenta.json`). Triggers are
 * referenced by index and fingerprint: the index is right until another tool moves
 * things, and the fingerprint finds a moved trigger again. A map without the member is a
 * whole map; only names and folders are missing.
 */
import type { TriggerRecord } from "../../vendor/triggers";
import { fingerprint } from "./records";
import type { ExpansionRecord } from "./sync";
import type { BuildRecord, ChatCell } from "./builds";

export const MEMBER = "magenta\\magenta.json";

export interface TriggerRef {
  i: number;
  h: string;
}

export interface Folder {
  id: string;
  name: string;
  /** Collapsed in the list. */
  closed?: boolean;
  triggers: TriggerRef[];
}

export interface CounterName {
  player: number;
  unit: number;
  name: string;
}

export interface Sidecar {
  version: 1;
  folders: Folder[];
  counters: CounterName[];
  settings: { everyFrame?: boolean };
  /** The Tier A+ expansions: what generated each run, and where it hangs. */
  expansions: ExpansionRecord[];
  /** The rows that need a euddraft build: chat commands, text hooks, counter maths, unit passes. */
  builds: BuildRecord[];
  /** The cell the chat plugin writes into; null until the first chat command. */
  chat: ChatCell | null;
}

export const emptySidecar = (): Sidecar => ({ version: 1, folders: [], counters: [], settings: {}, expansions: [], builds: [], chat: null });

export function decodeSidecar(bytes: Uint8Array | null): Sidecar {
  if (!bytes) return emptySidecar();
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Sidecar>;
    if (parsed.version !== 1) return emptySidecar();
    return {
      version: 1,
      folders: Array.isArray(parsed.folders) ? parsed.folders.filter((f) => f && typeof f.id === "string" && typeof f.name === "string").map((f) => ({ ...f, triggers: Array.isArray(f.triggers) ? f.triggers : [] })) : [],
      counters: Array.isArray(parsed.counters) ? parsed.counters.filter((c) => c && typeof c.name === "string" && Number.isInteger(c.player) && Number.isInteger(c.unit)) : [],
      settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
      expansions: Array.isArray(parsed.expansions) ? parsed.expansions.filter((x) => x && typeof x.id === "string" && typeof x.kind === "string") : [],
      builds: Array.isArray(parsed.builds) ? parsed.builds.filter((x) => x && typeof x.id === "string" && typeof x.kind === "string") : [],
      chat: parsed.chat && Array.isArray(parsed.chat.cell) ? { cell: [Number(parsed.chat.cell[0]), Number(parsed.chat.cell[1])] } : null,
    };
  } catch {
    return emptySidecar();
  }
}

export function encodeSidecar(sidecar: Sidecar): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(sidecar, null, 2));
}

/**
 * Which folder each trigger of `list` is in, by index: the ref's index when its
 * fingerprint still matches, else the first unassigned trigger with that fingerprint,
 * else (edited by another tool) the index itself if nothing else claims it.
 */
export function folderOf(list: readonly TriggerRecord[], sidecar: Sidecar): Map<number, string> {
  const prints = list.map(fingerprint);
  const taken = new Set<number>();
  const out = new Map<number, string>();
  const byPrint = new Map<string, number[]>();
  prints.forEach((h, i) => { const arr = byPrint.get(h); if (arr) arr.push(i); else byPrint.set(h, [i]); });
  const fallback: { folder: string; ref: TriggerRef }[] = [];
  for (const folder of sidecar.folders) for (const ref of folder.triggers) {
    if (ref.i < list.length && prints[ref.i] === ref.h && !taken.has(ref.i)) { taken.add(ref.i); out.set(ref.i, folder.id); continue; }
    const candidates = byPrint.get(ref.h)?.filter((i) => !taken.has(i));
    if (candidates && candidates.length) { taken.add(candidates[0]); out.set(candidates[0], folder.id); continue; }
    fallback.push({ folder: folder.id, ref });
  }
  for (const { folder, ref } of fallback) {
    if (ref.i < list.length && !taken.has(ref.i)) { taken.add(ref.i); out.set(ref.i, folder); }
  }
  return out;
}

/** The sidecar's refs rewritten for the list as it stands, from a folder-by-index map. */
export function withFolders(sidecar: Sidecar, list: readonly TriggerRecord[], folders: Map<number, string>): Sidecar {
  const prints = list.map(fingerprint);
  const next = sidecar.folders.map((f) => ({ ...f, triggers: [] as TriggerRef[] }));
  const byId = new Map(next.map((f) => [f.id, f]));
  for (let i = 0; i < list.length; i++) {
    const id = folders.get(i);
    if (id === undefined) continue;
    byId.get(id)?.triggers.push({ i, h: prints[i] });
  }
  return { ...sidecar, folders: next };
}

export const counterName = (sidecar: Sidecar, player: number, unit: number): string | null =>
  sidecar.counters.find((c) => c.player === player && c.unit === unit)?.name ?? null;
