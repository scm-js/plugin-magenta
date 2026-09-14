/**
 * Plugins ▸ Magenta Settings…: the plugin's own settings, kept in its storage rather than
 * the map. For now that is the build server's address.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { DEFAULT_SERVER, serverUrl, setServerUrl } from "./build";

export function openSettingsDialog(api: PluginApi): void {
  const t = api.i18n.t;
  const w = api.ui.widgets;
  const server = w.text({ value: serverUrl(api), placeholder: DEFAULT_SERVER });
  api.ui.dialog({
    title: t("Magenta Settings"),
    size: "sm",
    mount(body) {
      body.append(
        w.form([{ label: t("Build server"), field: server }]),
        w.hint(t("The server that builds EUD maps (⋯ ▸ Build EUD map…). Leave it empty for the scmjs.dev one; a server of your own is the eud-server container.")),
      );
    },
    buttons: [
      { label: t("OK"), primary: true, run: () => setServerUrl(api, server.value) },
      { label: t("Cancel") },
    ],
  });
}
