/**
 * Magenta's page in Edit ▸ Preferences (under Plugins): the plugin's own settings, kept in
 * its storage rather than the map — where the panel lives. The panel's ⋯ ▸ Settings… opens
 * the page. The choice is written on OK or Apply, so Cancel leaves the panel where it was.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { layout, setLayout } from "./layout";

/** The page id `api.ui.open("preferences", { page })` takes. */
export const PREFERENCES_PAGE = "plugin:magenta";

export function registerPreferencesPage(api: PluginApi, onLayoutChange?: () => void): void {
  const t = api.i18n.t;
  const w = api.ui.widgets;
  let dock: HTMLSelectElement | null = null;
  api.ui.preferencesPage({
    mount(body) {
      dock = w.select([{ value: "float", label: t("Floating over the map") }, { value: "right", label: t("Docked on the right") }], { value: layout(api).dock });
      body.append(
        w.form([{ label: t("Panel"), field: dock }]),
        w.hint(t("A floating panel is dragged about and resized from its corner; a docked one sits in the right dock with the Layers and Properties panels and stacks the list over the trigger.")),
      );
      return () => { dock = null; };
    },
    apply() {
      if (!dock) return;
      const next = dock.value === "right" ? "right" : "float";
      if (next !== layout(api).dock) { setLayout(api, { dock: next }); onLayoutChange?.(); }
    },
    reset() {
      if (dock) dock.value = "float";
    },
  });
}

/** Open the page — the panel's ⋯ ▸ Settings… and the "settings" command. */
export function openSettings(api: PluginApi): void {
  api.ui.open("preferences", { page: PREFERENCES_PAGE });
}
