/**
 * What the Build dialog checks, and what the save's build will refuse: the rows against the map as it is (a location a
 * row names must still be there, a chat message must be one the language takes), the rows and options TrigScript's
 * build cannot render yet (`trigscript.ts`'s `unsupported`), and whether TrigScript is there to build at all. The
 * checks are pure over plain data the host hands in; each names the trigger it is about so the dialog can jump there.
 * A build happens on every save (TrigScript's), so there is no "stale" any more: the saved map is the map.
 */
import { t } from "../i18n";
import type { TriggerRecord } from "../../vendor/triggers";
import { checkChatMessage, type BuildOptions } from "./builds";
import { refs } from "./ownership";
import type { Sidecar } from "./sidecar";
import type { Rendered } from "./trigscript";

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
  /** Per 0-based location slot: whether it is empty (zero size) and whether it has a name of its own. */
  locations: readonly { empty: boolean; named: boolean }[];
  soundPresent(path: string): boolean;
  /** The rows as TrigScript: which it could not render, and which in part. */
  rendered: Pick<Rendered, "unsupported" | "notes">;
  /** Whether the TrigScript plugin is running, with its build service. */
  trigscript: boolean;
}

export function preflight(input: PreflightInput): PreflightProblem[] {
  const out: PreflightProblem[] = [];
  const { list, sidecar, options } = input;
  const locExists = (n: number) => n === 64 || (n >= 1 && n <= 63 && input.locations[n - 1] !== undefined && !input.locations[n - 1].empty);
  const triggerOf = (id: string | null): number | undefined => {
    const b = id === null ? undefined : sidecar.builds.find((x) => x.id === id);
    return b ? refs(list, b)[0] : undefined;
  };

  /* ── The rows ── */
  const seenChat = new Map<string, number>();
  for (const b of sidecar.builds) {
    const carriers = refs(list, b);
    const at = carriers[0];
    if (b.kind === "chat") {
      const bad = checkChatMessage(b.message);
      if (bad) out.push({ level: "error", text: t("The chat command \"{message}\": {problem}", { message: b.message, problem: bad }) });
      const key = b.message.toLowerCase();
      if (seenChat.has(key)) out.push({ level: "warn", text: t("Two chat commands say \"{message}\"; the second never fires on its own.", { message: b.message }) });
      seenChat.set(key, 1);
      continue;
    }
    if (!carriers.length) { out.push({ level: "info", text: b.kind === "scan" ? t("A unit check no trigger uses is still in the map's Magenta data; it is built, and never fires.") : t("A build row no trigger uses is still in the map's Magenta data; it is built, and never runs.") }); continue; }
    if ("location" in b && b.location !== null && !locExists(b.location)) out.push({ level: "error", text: t("A build row names location {n}, which the map no longer has.", { n: b.location }), trigger: at });
    if (b.kind === "foreach" || b.kind === "pick") {
      const d = b.do;
      if (d && "order" in d) {
        if (!locExists(d.location)) out.push({ level: "error", text: t("The order row's target location ({n}) is gone.", { n: d.location }), trigger: at });
      }
      if (d && "locate" in d && !locExists(d.locate)) out.push({ level: "error", text: t("The row centres location {n} on the unit, and the map no longer has it.", { n: d.locate }), trigger: at });
    }
    if (b.kind === "pick") {
      if (b.locate !== null && !locExists(b.locate)) out.push({ level: "error", text: t("The pick row centres location {n} on the unit, and the map no longer has it.", { n: b.locate }), trigger: at });
      if (typeof b.near === "number" && !locExists(b.near)) out.push({ level: "error", text: t("The pick row measures from location {n}, which the map no longer has.", { n: b.near }), trigger: at });
    }
  }

  /* ── What TrigScript's build cannot take yet ── */
  for (const u of input.rendered.unsupported) {
    const at = triggerOf(u.id);
    out.push({ level: "error", text: t("Not built: {why}.", { why: u.why }), ...(at !== undefined ? { trigger: at } : {}) });
  }
  for (const n of input.rendered.notes) {
    const at = triggerOf(n.id);
    out.push({ level: "warn", text: t("Built in part: {note}.", { note: n.note }), ...(at !== undefined ? { trigger: at } : {}) });
  }

  /* ── The map-wide options ── */
  if (options.camera) {
    const l = input.locations[options.camera.location - 1];
    if (!l || l.empty) out.push({ level: "error", text: t("The camera follows location {n}, which the map no longer has.", { n: options.camera.location }) });
  }
  if (options.bgm && !input.soundPresent(options.bgm.path)) out.push({ level: "error", text: t("The background music {file} is not in the map archive.", { file: options.bgm.path.split("\\").pop() ?? "" }) });

  /* ── The builder ── */
  if (!input.trigscript) out.push({ level: "error", text: t("The TrigScript plugin is not running: it is what builds the rows into the map. Install or turn it on under Plugins ▸ Manage Plugins…") });

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
