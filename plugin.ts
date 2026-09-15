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
import { lookupOver, setGameLookup } from "./src/model/eud";
import { liveActions, liveConditions } from "./src/model/records";
import { actionsText, conditionText } from "./src/ui/describe";
import { installClaims } from "./src/claims";
import { Host } from "./src/ui/host";
import { createPanel } from "./src/ui/panel";
import { openSettingsDialog } from "./src/ui/settings";
import { starters, type StarterSubject } from "./src/model/starters";

export function activate(api: PluginApi): () => void {
  let claims: ReturnType<typeof installClaims> | null = null;
  const panel = createPanel(api, { afterCommit: () => claims?.refresh() });
  const t = api.i18n.t;
  // The flingy tables are indexed by flingy, and units.dat says which one a unit type moves as: the
  // speed and looks entries go through it, so they are offered once the game data is in.
  const lookup = () => void api.data.load().then(() => { const units = api.data.units(); setGameLookup(units ? lookupOver(units.flingy) : null); }, () => setGameLookup(null));
  lookup();
  const onData = api.events.on("gameData", lookup);
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
        actions: actionsText(liveActions(tr), namer, extra).map((s) => s.text),
      };
    },
  });
  api.commands.register({ id: "settings", title: "Magenta Settings", run: () => openSettingsDialog(api) });
  api.menu.add("Triggers", { label: t("Magenta…"), shortcut: "Ctrl+Shift+M", icon: "plugin", after: "Text Trigger Editor…", enabled: () => api.document.isOpen(), command: "open" });
  api.menu.add("Plugins", { label: t("Magenta Settings…"), icon: "plugin", command: "settings" });
  api.hotkeys.add("Ctrl+Shift+M", { command: "open" });
  claims = installClaims(api, (index) => panel.open({ index }));

  /* ── Start a trigger from the map ── */
  /** The placed unit under a map pixel (the nearest whose placement box holds it), and the smallest location around it. */
  const under = (ctx: { point: { px: number; py: number } | null; tile: { x: number; y: number } | null }): StarterSubject => {
    // The viewport keeps a pixel only on some layers; the tile's centre stands in on the rest.
    const point = ctx.point ?? (ctx.tile ? { px: ctx.tile.x * 32 + 16, py: ctx.tile.y * 32 + 16 } : null);
    if (!point) return {};
    const host = new Host(api);
    const scn = api.document.scenario();
    const names = api.triggers.names();
    const dat = api.data.units();
    let unit: StarterSubject["unit"] = null;
    let best = Infinity;
    for (const u of host.placedUnits()) {
      const hw = dat && u.unitId < dat.placementWidth.length ? Math.max(16, dat.placementWidth[u.unitId] / 2) : 16;
      const hh = dat && u.unitId < dat.placementHeight.length ? Math.max(16, dat.placementHeight[u.unitId] / 2) : 16;
      if (Math.abs(u.x - point.px) > hw || Math.abs(u.y - point.py) > hh) continue;
      const d = (u.x - point.px) ** 2 + (u.y - point.py) ** 2;
      if (d < best) { best = d; unit = { unitId: u.unitId, owner: u.owner, slot: u.slot, name: names.unit(u.unitId), ownerName: api.names.playerGroup(u.owner) }; }
    }
    let location: StarterSubject["location"] = null;
    let area = Infinity;
    scn?.locations.forEach((l, i) => {
      if (i === 63) return;
      const x0 = Math.min(l.left, l.right), x1 = Math.max(l.left, l.right), y0 = Math.min(l.top, l.bottom), y1 = Math.max(l.top, l.bottom);
      if (x0 === x1 || y0 === y1 || point.px < x0 || point.px >= x1 || point.py < y0 || point.py >= y1) return;
      const a = (x1 - x0) * (y1 - y0);
      if (a < area) { area = a; location = { number: i + 1, name: names.location(i + 1) }; }
    });
    return { unit, location };
  };
  const unitItem = api.contextMenu.add("viewport", {
    label: (ctx) => t("New trigger about this {unit}…", { unit: under(ctx).unit?.name ?? "" }),
    visible: (ctx) => api.document.isOpen() && !!under(ctx).unit,
    run: (ctx) => { const s = under(ctx); panel.start(starters({ unit: s.unit, location: s.location })); },
  });
  const locationItem = api.contextMenu.add("viewport", {
    label: (ctx) => t("New trigger at {location}…", { location: under(ctx).location?.name ?? "" }),
    visible: (ctx) => api.document.isOpen() && !!under(ctx).location,
    run: (ctx) => { const s = under(ctx); panel.start(starters({ location: s.location })); },
  });
  return () => { claims?.dispose(); panel.close(); onData.dispose(); unitItem.dispose(); locationItem.dispose(); setGameLookup(null); };
}
