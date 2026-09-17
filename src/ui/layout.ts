/**
 * Where the panel lives and how it is split, kept in the plugin's storage: floating or
 * docked, the floating size, the list's width (or height, stacked) and whether it is
 * hidden. The panel reads it when it opens and writes it as the user drags.
 */
import type { PluginApi } from "@scm-js/plugin-api";

export interface Layout {
  dock: "float" | "right";
  width: number;
  height: number;
  /** The list's width in a row layout, its height stacked, in CSS pixels. */
  list: number;
  listStacked: number;
  listHidden: boolean;
}

const KEY = "layout";
export const DEFAULT_LAYOUT: Layout = { dock: "float", width: 820, height: 560, list: 240, listStacked: 160, listHidden: false };

export const layout = (api: PluginApi): Layout => ({ ...DEFAULT_LAYOUT, ...api.storage.get<Partial<Layout>>(KEY, {}) });
export const setLayout = (api: PluginApi, patch: Partial<Layout>): void => { api.storage.set(KEY, { ...layout(api), ...patch }); };
