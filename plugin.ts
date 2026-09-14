/**
 * Magenta — a trigger editor for map makers, a plugin for the scmJS map editor
 * (https://github.com/scm-js/scm-js).
 *
 * Triggers ▸ Magenta… (Ctrl+Shift+M) opens a panel beside the map: every trigger as a
 * sentence with its parameters as chips, one search box that adds any condition or
 * action, the map as the picker, and a catalogue of Remastered EUD conditions and
 * actions that read and edit like the game's own (`src/catalogue/eud.json`).
 *
 * The map's TRIG is the only source of truth: Magenta recognises records into sentences
 * and lowers edits back one record at a time (`src/model/`). Folders and counter names
 * live in one archive member, `magenta\magenta.json` (`src/model/sidecar.ts`).
 *
 * Other plugins reach it through `magenta.open` (`{ index?: number }`) and
 * `magenta.describe` (a trigger record → its sentences as text).
 */
import type { PluginApi, TriggerRecord } from "@scm-js/plugin-api";
import { liveActions, liveConditions } from "./src/model/records";
import { actionText, conditionText } from "./src/ui/describe";
import { installClaims } from "./src/claims";
import { Host } from "./src/ui/host";
import { createPanel } from "./src/ui/panel";
import { openSettingsDialog } from "./src/ui/settings";

export function activate(api: PluginApi): () => void {
  let claims: ReturnType<typeof installClaims> | null = null;
  const panel = createPanel(api, { afterCommit: () => claims?.refresh() });
  const t = api.i18n.t;
  api.commands.register({ id: "open", title: "Magenta", enabled: () => api.document.isOpen(), run: (options) => panel.open(options && typeof options === "object" && typeof (options as { index?: unknown }).index === "number" ? { index: (options as { index: number }).index } : {}) });
  api.commands.register({
    id: "describe", title: "Magenta: describe a trigger",
    run: (trigger) => {
      const tr = trigger as TriggerRecord;
      const host = new Host(api);
      const namer = host.namer(host.sidecar());
      const extra = host.extra();
      return {
        conditions: liveConditions(tr).map((c) => conditionText(c, namer, extra)),
        actions: liveActions(tr).map((a) => actionText(a, namer, extra)),
      };
    },
  });
  api.commands.register({ id: "settings", title: "Magenta Settings", run: () => openSettingsDialog(api) });
  api.menu.add("Triggers", { label: t("Magenta…"), shortcut: "Ctrl+Shift+M", icon: "plugin", after: "Text Trigger Editor…", enabled: () => api.document.isOpen(), command: "open" });
  api.menu.add("Plugins", { label: t("Magenta Settings…"), icon: "plugin", command: "settings" });
  api.hotkeys.add("Ctrl+Shift+M", { command: "open" });
  claims = installClaims(api, (index) => panel.open({ index }));
  return () => { claims?.dispose(); panel.close(); };
}
