/**
 * What the Build dialog checks before a map goes to the server, and how it tells whether
 * the built map is still the map: a *source revision* — a hash over everything the build
 * consumes — kept with the result in the sidecar, so "built from this revision" and
 * "stale" are answers rather than guesses. The checks are pure over plain data the host
 * hands in; each names the trigger it is about so the dialog can jump there.
 */
import { ActionType, type TriggerRecord } from "../../vendor/triggers";
import { checkChatMessage, MAGENTA_SPEC_VERSION, usesMsqc, type BuildOptions, type BuildPlugins } from "./builds";
import { refs } from "./ownership";
import { fingerprint, liveActions, owners } from "./records";
import type { Sidecar } from "./sidecar";

/** What /health answers. */
export interface ServerHealth {
  ok?: boolean;
  eudplib?: string;
  euddraft?: string;
  plugins?: string[];
  maxMapBytes?: number;
  /** The newest Magenta spec the server's plugin reads; missing on a server from before it said. */
  magentaSpec?: number | null;
}

/** The record of the last build, kept in `sidecar.settings.lastBuild`. */
export interface LastBuild {
  revision: string;
  /** ISO time. */
  at: string;
  file: string | null;
  spec: number;
  server: string;
  eudplib?: string;
  euddraft?: string;
}

export interface PreflightProblem {
  level: "error" | "warn" | "info";
  text: string;
  /** The trigger it is about, when it is one trigger's. */
  trigger?: number;
}

export interface PreflightInput {
  list: readonly TriggerRecord[];
  sidecar: Sidecar;
  options: BuildOptions;
  /** `PlayerType` per 0-based slot (0 is Inactive). */
  playerTypes: readonly number[];
  playerTypeName(slot: number): string;
  playerName(slot: number): string;
  unitName(id: number): string;
  placedUnitIds: ReadonlySet<number>;
  /** Slots that own at least one placed unit. */
  placedOwners: ReadonlySet<number>;
  /** Per 0-based location slot: whether it is empty (zero size) and whether it has a name of its own. */
  locations: readonly { empty: boolean; named: boolean }[];
  soundPresent(path: string): boolean;
  /** The plugin sections the build will send. */
  plugins: BuildPlugins;
  health?: ServerHealth | null;
  /** The map file's size, when known. */
  mapBytes?: number;
}

const PLAYER_INACTIVE = 0;

const hex = (h: number) => (h >>> 0).toString(16).padStart(8, "0");

/** FNV-1a over a string. */
function fnv(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * The source revision: the triggers by content, the sidecar's build-facing parts, and
 * whatever else of the map the host says a build reads (locations, placed units, strings),
 * as strings. The last-build record itself is left out, so recording a build does not
 * move the revision it records.
 */
export function sourceRevision(list: readonly TriggerRecord[], sidecar: Sidecar, extra: readonly string[] = []): string {
  const settings: Record<string, unknown> = { ...sidecar.settings };
  delete settings.lastBuild;
  let h = 0x811c9dc5;
  for (const t of list) h = fnv(fingerprint(t), h);
  h = fnv(JSON.stringify({ builds: sidecar.builds, chat: sidecar.chat, msqc: sidecar.msqc, expansions: sidecar.expansions, settings }), h);
  let g = 0x811c9dc5;
  for (const s of extra) g = fnv(s, g);
  return hex(h) + hex(g);
}

/** "never" (no record), "fresh" (the record's revision is the map's), or "stale". */
export function buildFreshness(last: LastBuild | null | undefined, revision: string): "never" | "fresh" | "stale" {
  if (!last) return "never";
  return last.revision === revision ? "fresh" : "stale";
}

/** The problems a build would run into, errors first. */
export function preflight(input: PreflightInput): PreflightProblem[] {
  const out: PreflightProblem[] = [];
  const { list, sidecar, options } = input;
  const locExists = (n: number) => n === 64 || (n >= 1 && n <= 63 && input.locations[n - 1] !== undefined && !input.locations[n - 1].empty);
  const free = (slot: number) => { const l = input.locations[slot]; return !!l && l.empty && !l.named; };

  /* ── MSQC's own things ── */
  const m = sidecar.msqc;
  if (usesMsqc(m)) {
    const p = m.qcPlayer;
    if ((input.playerTypes[p] ?? PLAYER_INACTIVE) !== PLAYER_INACTIVE) out.push({ level: "error", text: `Synced input needs ${input.playerName(p)} for itself, and the slot is set to ${input.playerTypeName(p)}. Make it inactive in Scenario ▸ Players, or free another slot and remove the input rows to let Magenta pick again.` });
    if (input.placedOwners.has(p)) out.push({ level: "error", text: `Synced input needs ${input.playerName(p)} for itself, and units on the map belong to it.` });
    list.forEach((t, i) => { if (owners(t).includes(p)) out.push({ level: "warn", text: `Synced input owns ${input.playerName(p)}; this trigger runs for it too.`, trigger: i }); });
    if (input.placedUnitIds.has(m.qcUnit)) out.push({ level: "error", text: `Synced input uses the ${input.unitName(m.qcUnit)} type for its own command units, and the map has some placed. Remove them, or pick another unit type in the map's settings.` });
    list.forEach((t, i) => {
      if (liveActions(t).some((a) => (a.type === ActionType.CreateUnit || a.type === ActionType.CreateUnitWithProperties) && a.unitId === m.qcUnit)) out.push({ level: "error", text: `This trigger creates a ${input.unitName(m.qcUnit)}, the type synced input keeps for itself.`, trigger: i });
    });
    if (!free(m.qcLoc)) out.push({ level: "error", text: `Synced input's own location slot (${m.qcLoc + 1}) is no longer empty: a location was made there. Free it, or remove the input rows and add them again to pick another.` });
    if (m.mouseBase !== null) {
      const taken: number[] = [];
      for (let k = 0; k < 8; k++) if (!free(m.mouseBase - 1 + k)) taken.push(m.mouseBase + k);
      if (taken.length) out.push({ level: "error", text: `The eight location slots the players' mice use (${m.mouseBase}–${m.mouseBase + 7}) must stay empty; ${taken.length === 1 ? "slot" : "slots"} ${taken.join(", ")} ${taken.length === 1 ? "is" : "are"} in use.` });
    }
  }

  /* ── The rows ── */
  const seenChat = new Map<string, number>();
  for (const b of sidecar.builds) {
    const carriers = refs(list, b);
    const at = carriers[0];
    if (b.kind === "chat") {
      const bad = checkChatMessage(b.message);
      if (bad) out.push({ level: "error", text: `The chat command "${b.message}": ${bad}` });
      const key = b.message.toLowerCase();
      if (seenChat.has(key)) out.push({ level: "warn", text: `Two chat commands say "${b.message}"; the second never fires on its own.` });
      seenChat.set(key, 1);
      continue;
    }
    if (!carriers.length) { out.push({ level: "info", text: `A ${b.kind === "scan" ? "unit check" : "build row"} no trigger uses is still in the map's Magenta data; it is sent, and never fires.` }); continue; }
    if ("location" in b && b.location !== null && !locExists(b.location)) out.push({ level: "error", text: `A build row names location ${b.location}, which the map no longer has.`, trigger: at });
    if (b.kind === "foreach" || b.kind === "pick") {
      const d = b.do;
      if (d && "order" in d) {
        if (!locExists(d.scratch)) out.push({ level: "error", text: `The order row's scratch location (${d.scratch}) is gone; pick the order again to make one.`, trigger: at });
        if (!locExists(d.location)) out.push({ level: "error", text: `The order row's target location (${d.location}) is gone.`, trigger: at });
      }
      if (d && "locate" in d && !locExists(d.locate)) out.push({ level: "error", text: `The row centres location ${d.locate} on the unit, and the map no longer has it.`, trigger: at });
    }
    if (b.kind === "pick") {
      if (b.locate !== null && !locExists(b.locate)) out.push({ level: "error", text: `The pick row centres location ${b.locate} on the unit, and the map no longer has it.`, trigger: at });
      if (typeof b.near === "number" && !locExists(b.near)) out.push({ level: "error", text: `The pick row measures from location ${b.near}, which the map no longer has.`, trigger: at });
    }
  }

  /* ── The map-wide options ── */
  if (options.camera) {
    const l = input.locations[options.camera.location - 1];
    if (!l || l.empty) out.push({ level: "error", text: `The camera follows location ${options.camera.location}, which the map no longer has.` });
    else if (!l.named) out.push({ level: "error", text: `The camera finds its location by name, and location ${options.camera.location} has none of its own.` });
  }
  if (options.bgm && !input.soundPresent(options.bgm.path)) out.push({ level: "error", text: `The background music ${options.bgm.path.split("\\").pop()} is not in the map archive.` });

  /* ── The server ── */
  const h = input.health;
  if (h) {
    const needed = Object.keys(input.plugins);
    const missing = h.plugins ? needed.filter((n) => !h.plugins!.includes(n)) : [];
    if (missing.length) out.push({ level: "error", text: `The build server does not have the ${missing.join(", ")} plugin${missing.length > 1 ? "s" : ""} this map needs.` });
    if (input.plugins.magenta) {
      if (typeof h.magentaSpec === "number" && h.magentaSpec < MAGENTA_SPEC_VERSION) out.push({ level: "error", text: `The build server's Magenta plugin reads spec ${h.magentaSpec}; this map's rows are written as spec ${MAGENTA_SPEC_VERSION}. Update the server (scm-js/eud-server), or build on scmjs.dev.` });
      else if (h.magentaSpec === undefined || h.magentaSpec === null) out.push({ level: "info", text: "The build server does not say which Magenta spec it reads; an older one fails the build with a message rather than here." });
    }
    if (input.mapBytes !== undefined && h.maxMapBytes && input.mapBytes > h.maxMapBytes) out.push({ level: "error", text: `The map is ${Math.round(input.mapBytes / 1024)} KB and the server takes up to ${Math.round(h.maxMapBytes / 1024)} KB.` });
  }

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** A record of a build that just succeeded. */
export function lastBuildRecord(revision: string, file: string | null, server: string, health: ServerHealth | null | undefined): LastBuild {
  return { revision, at: new Date().toISOString(), file, spec: MAGENTA_SPEC_VERSION, server, ...(health?.eudplib ? { eudplib: health.eudplib } : {}), ...(health?.euddraft ? { euddraft: health.euddraft } : {}) };
}
