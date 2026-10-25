/**
 * Magenta's part in TrigScript's build (2026-10-25: TrigScript is the library). The rows that need code in the map are
 * rendered as TrigScript (`model/trigscript.ts`) from the map's Magenta data as it is, and *contributed* to the
 * `trigscript.build` service (`vendor/trigscript.ts`): on Save, Test Map and an export, TrigScript compiles the file with
 * the map's own script and lays every program out into the saved map. Nothing is saved beside the map any more, and
 * nothing of the rows enters the archive but Magenta's own member. The Build dialog (`build.ts`) shows the same
 * rendering's problems before a save.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { DEFAULT_OPTIONS, type BuildOptions } from "../model/builds";
import { orderBuilds } from "../model/ownership";
import { ENTRY, renderScript, type Rendered } from "../model/trigscript";
import { TRIGSCRIPT_BUILD_SERVICE, type TrigScriptBuildService } from "../../vendor/trigscript";
import type { Host } from "./host";
import { t } from "../i18n";

const PLAYER_HUMAN = 6, PLAYER_COMPUTER = 5;

/** The TrigScript plugin's build service, or null when it is not installed or is off. */
export const trigscript = (api: PluginApi): TrigScriptBuildService | null => api.services.get<TrigScriptBuildService>(TRIGSCRIPT_BUILD_SERVICE);

/** The map's rows rendered as TrigScript, from the map's Magenta data as it is now, with what went into the rendering. */
export function renderForMap(host: Host): { rendered: Rendered; options: BuildOptions; rows: number; chats: number; inputs: number } | null {
  if (!host.isOpen()) return null;
  const sidecar = host.sidecar();
  const list = host.triggers();
  const builds = orderBuilds(sidecar.builds, list);
  const options: BuildOptions = { ...DEFAULT_OPTIONS, ...sidecar.settings.build };
  const types = host.playerTypes();
  const humans = types.flatMap((type, slot) => (slot < 8 && type === PLAYER_HUMAN ? [slot] : []));
  const owner = humans[0] ?? types.findIndex((type, slot) => slot < 8 && type === PLAYER_COMPUTER);
  const msqc = sidecar.msqc;
  const inputs = msqc ? Object.keys(msqc.keys).length + Object.keys(msqc.clicks).length + Object.keys(msqc.mouseIn).length + (msqc.select ? 1 : 0) : 0;
  const rendered = renderScript({ builds, chat: sidecar.chat, msqc, options, humans, owner: Math.max(0, owner), bounds: (n) => host.locationBounds(n) });
  return { rendered, options, rows: builds.filter((b) => b.kind !== "chat").length, chats: builds.filter((b) => b.kind === "chat").length, inputs };
}

/** Whether the map has anything for the build: a build row, a chat command, synced input, or a map-wide option. */
export function hasWork(host: Host): boolean {
  const r = renderForMap(host);
  return !!r && (r.rows + r.chats + r.inputs > 0 || !!r.options.camera || !!r.options.bgm || r.options.noAirCollision || r.options.unlimiter);
}

/**
 * Stand ready to contribute the map's rows to every build of TrigScript's while the plugin runs, whenever the TrigScript
 * plugin is there. The contribution applies when the map has anything for the build; `collect` renders the rows as they
 * are and refuses, in the user's words, when a row cannot be rendered yet — the save's notice says so, and saves the rest.
 */
export function installContribution(api: PluginApi, host: Host): { dispose(): void } {
  let mine: { dispose(): void } | null = null;
  const watching = api.services.watch<TrigScriptBuildService>(TRIGSCRIPT_BUILD_SERVICE, (svc) => {
    mine?.dispose();
    mine = svc?.contribute({
      id: "magenta",
      label: "Magenta",
      applies: () => hasWork(host),
      collect: async () => {
        const r = renderForMap(host);
        if (!r) throw new Error(t("No map is open."));
        if (r.rendered.unsupported.length) {
          const first = r.rendered.unsupported[0];
          throw new Error(r.rendered.unsupported.length === 1
            ? t("{why}. The map's Build dialog (⋯ ▸ Build…) lists it.", { why: first.why })
            : t("{why}, and {n, plural, one {# more row} other {# more rows}} the same. The map's Build dialog (⋯ ▸ Build…) lists them.", { why: first.why, n: r.rendered.unsupported.length - 1 }));
        }
        return { files: { [ENTRY]: r.rendered.source }, entries: [ENTRY] };
      },
    }) ?? null;
  });
  return { dispose: () => { mine?.dispose(); watching.dispose(); } };
}
