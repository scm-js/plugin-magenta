/**
 * The claims on Magenta's generated runs, kept whether or not the panel is open: the
 * Classic editor locks the rows and offers Open Magenta on them, TrigEdit fences them.
 * One claim per expansion the sidecar records, found in the list by its markers;
 * refreshed when the map, its members or its triggers change.
 */
import type { PluginApi, TriggerClaimHandle, TriggerRecord } from "@scm-js/plugin-api";
import { locateRun } from "./model/expansions";
import { decodeSidecar, MEMBER } from "./model/sidecar";
import type { ExpansionRecord } from "./model/sync";

export interface ClaimsHandle {
  /** Ask again: after the panel wrote the map and its member. */
  refresh(): void;
  dispose(): void;
}

export function installClaims(api: PluginApi, open: (index: number) => void): ClaimsHandle {
  const handles = new Map<string, TriggerClaimHandle>();
  const text = (i: number) => api.names.string(i);
  const label = (x: ExpansionRecord) => (x.kind === "compare" ? "Magenta's counter comparison" : x.kind === "forEachPlayer" ? "Magenta's per-player copies" : `Magenta's counter ${x.kind}`);

  const refresh = () => {
    const sidecar = api.document.isOpen() ? decodeSidecar(api.document.extras.get(MEMBER)) : null;
    const wanted = new Map((sidecar?.expansions ?? []).map((x) => [x.id, x]));
    for (const [id, h] of handles) if (!wanted.has(id)) { h.remove(); handles.delete(id); }
    for (const [id, x] of wanted) {
      if (handles.has(id)) { handles.get(id)!.refresh(); continue; }
      handles.set(id, api.triggers.claim({
        label: label(x),
        badge: "magenta",
        locate: (list: TriggerRecord[]) => locateRun(list, id, text),
        describe: () => `${label(x)}: generated from the trigger it belongs to. Edit that trigger in Magenta; the run is rebuilt with it.`,
        open: (index) => open(index),
        openLabel: "Open Magenta",
      }));
    }
  };
  refresh();
  const subs = [api.events.on("document", refresh), api.events.on("file", refresh), api.events.on("triggers", refresh)];
  return {
    refresh,
    dispose: () => { for (const s of subs) s.dispose(); for (const h of handles.values()) h.remove(); handles.clear(); },
  };
}
