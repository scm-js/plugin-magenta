/**
 * Plugins ▸ Magenta Settings…: the plugin's own settings, kept in its storage rather than
 * the map: where the panel lives.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { layout, setLayout } from "./layout";

export function openSettingsDialog(api: PluginApi, onLayoutChange?: () => void): void {
  const t = api.i18n.t;
  const w = api.ui.widgets;
  const dock = w.select([{ value: "float", label: t("Floating over the map") }, { value: "right", label: t("Docked on the right") }], { value: layout(api).dock });
  api.ui.dialog({
    title: t("Magenta Settings"),
    size: "sm",
    mount(body) {
      body.append(
        w.form([{ label: t("Panel"), field: dock }]),
        w.hint(t("A floating panel is dragged about and resized from its corner; a docked one sits in the right dock with the Layers and Properties panels and stacks the list over the trigger.")),
      );
    },
    buttons: [
      { label: t("OK"), primary: true, run: () => {
        const next = dock.value === "right" ? "right" : "float";
        if (next !== layout(api).dock) { setLayout(api, { dock: next }); onLayoutChange?.(); }
      } },
      { label: t("Cancel") },
    ],
  });
}
