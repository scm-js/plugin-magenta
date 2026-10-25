/**
 * The Build dialog: what of this map TrigScript builds into the saved file — the build rows, the chat commands, the
 * synced input — the map-wide options, and what would go wrong, checked before a save: the rows against the map
 * (`model/preflight.ts`), the rows TrigScript's build cannot render yet, and the rendered file compiled against the map
 * by TrigScript itself (`check`). The build happens on Save, Test Map and export (`contribute.ts`): there is no button
 * to press, and no file saved beside the map.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { DEFAULT_OPTIONS, type BuildOptions } from "../model/builds";
import { preflight, type PreflightProblem } from "../model/preflight";
import { ENTRY } from "../model/trigscript";
import { TRIGSCRIPT_BUILD_SERVICE } from "../../vendor/trigscript";
import { renderForMap, trigscript } from "./contribute";
import { needsBuild } from "./buildRows";
import type { Host } from "./host";
import type { Store } from "./store";

/** Where the map stands: how many triggers carry a row the build adds code for. */
export function buildStatus(store: Store): { triggers: number } {
  return { triggers: store.list.filter((t) => needsBuild(store, t)).length };
}

export function openBuildDialog(api: PluginApi, host: Host, store: Store, everyFrame: boolean): void {
  const t = api.i18n.t;
  const el = api.ui.el;
  const w = api.ui.widgets;
  const options: BuildOptions = { ...DEFAULT_OPTIONS, ...store.sidecar.settings.build };
  const saveOptions = () => store.updateSidecar(t("Build options"), { settings: { ...store.sidecar.settings, build: options } });

  /* ── The map-wide options ── */
  const locations = host.locations().filter((l) => l.value !== 64);
  const cameraOn = w.checkbox(t("The camera follows a location, for everyone"), { value: !!options.camera });
  const cameraLoc = w.select(locations.map((l) => ({ value: l.value, label: l.label })), { value: options.camera?.location ?? locations[0]?.value ?? 0 });
  const inertia = w.number({ value: options.camera?.inertia ?? 5, min: 1, max: 60 });
  const maxspeed = w.number({ value: options.camera?.maxspeed ?? 48, min: 1, max: 999 });
  const readCamera = () => { const loc = locations.find((l) => l.value === Number(cameraLoc.value)); options.camera = cameraOn.input.checked && loc ? { location: loc.value, name: loc.label, inertia: Number(inertia.value) || 5, maxspeed: Number(maxspeed.value) || 48 } : null; };
  const sounds = host.sounds().filter((s) => s.value !== 0);
  const bgmOn = w.checkbox(t("Loop a sound as background music"), { value: !!options.bgm });
  const bgmPath = w.select(sounds.map((s) => ({ value: s.value, label: s.label })), { value: sounds.find((s) => api.names.string(s.value) === options.bgm?.path)?.value ?? sounds[0]?.value ?? 0 });
  const bgmLen = w.number({ value: options.bgm?.length ?? 60, min: 1, max: 3600, step: 0.5 });
  const readBgm = () => {
    if (!bgmOn.input.checked || !sounds.length) { options.bgm = null; return; }
    const path = api.names.string(Number(bgmPath.value)) ?? "";
    options.bgm = { path, length: Number(bgmLen.value) || 60 };
  };
  const noAir = w.checkbox(t("Air units pass through one another"), { value: options.noAirCollision });
  const unlimiter = w.checkbox(t("Lift the sprite and image limits"), { value: options.unlimiter });
  const readAll = () => { readCamera(); readBgm(); options.noAirCollision = noAir.input.checked; options.unlimiter = unlimiter.input.checked; };

  const status = w.statusLine();
  const summaryEl = el("ul", {});
  const problemsEl = el("ul", { className: "mg-preflight" });
  const builderLine = el("div", { className: "hint" });
  let handle: { close(): void } | null = null;

  const renderSummary = () => {
    const r = renderForMap(host);
    summaryEl.replaceChildren(
      el("li", {}, r?.chats ? t("{n, plural, one {# chat command} other {# chat commands}}", { n: r.chats }) : t("No chat commands")),
      el("li", {}, r?.rows ? t("{n, plural, one {# build row} other {# build rows}} (text, maths, unit passes, checks)", { n: r.rows }) : t("No build rows")),
      el("li", {}, r?.inputs ? t("Synced input (keys, clicks, mouse), carried by the build itself") : t("No synced input")),
      el("li", {}, everyFrame || (r && r.rows + r.chats + r.inputs > 0) ? t("Triggers run every frame") : t("Triggers run every two seconds")),
    );
  };
  /** The checks that need no compile, at once; then TrigScript's own compile of the rendered file, when it is there. */
  const renderProblems = async (): Promise<PreflightProblem[]> => {
    readAll();
    saveOptions();
    const r = renderForMap(host);
    const svc = trigscript(api);
    const list = preflight({
      list: store.list, sidecar: store.sidecar, options, locations: host.locationSlots(), soundPresent: (p) => host.soundPresent(p),
      rendered: r?.rendered ?? { unsupported: [], notes: [] }, trigscript: !!svc,
    });
    const show = (problems: PreflightProblem[]) => {
      problemsEl.replaceChildren();
      problemsEl.hidden = !problems.length;
      for (const p of problems) {
        const li = el("li", { className: p.level }, p.text);
        if (p.trigger !== undefined) { const i = p.trigger; li.append(el("button", { type: "button", className: "mg-sim-link", onclick: () => { store.select(i); handle?.close(); } }, t("Show"))); }
        problemsEl.append(li);
      }
    };
    show(list);
    if (svc && r && !r.rendered.unsupported.length && r.rows + r.chats + r.inputs > 0) {
      try {
        const checked = await svc.check({ [ENTRY]: r.rendered.source }, [ENTRY]);
        const more: PreflightProblem[] = checked.problems.map((p) => ({ level: "error", text: t("The rendered rows do not build: {message} ({file}, line {line}). This is Magenta's to fix: say so.", { message: p.message, file: p.file, line: p.line }) }));
        if (more.length) show([...more, ...list]);
        else if (!list.some((p) => p.level === "error")) status.set(t("Checked by TrigScript: the rows build. They go into the map on the next save."), "ok");
      } catch (err) {
        show([{ level: "warn", text: t("TrigScript could not check the rows: {why}", { why: String((err as Error).message ?? err) }) }, ...list]);
      }
    }
    return list;
  };
  const renderBuilder = () => {
    const svc = trigscript(api);
    builderLine.textContent = svc
      ? t("Built into the saved map by TrigScript {version} when the map is saved, tested or exported: nothing to press, nothing downloaded, and the map is built in under a second.", { version: svc.versions.plugin })
      : t("The TrigScript plugin builds the rows into the saved map; it is not running.");
  };
  // TrigScript may arrive or go while the dialog is open (Manage Plugins is a dialog away).
  const watching = api.services.watch(TRIGSCRIPT_BUILD_SERVICE, () => { renderBuilder(); void renderProblems(); });
  for (const box of [cameraOn, bgmOn, noAir, unlimiter]) box.input.addEventListener("change", () => void renderProblems());
  cameraLoc.addEventListener("change", () => void renderProblems());
  bgmPath.addEventListener("change", () => void renderProblems());

  handle = api.ui.dialog({
    title: t("Build"),
    size: "md",
    mount(body) {
      renderSummary();
      renderBuilder();
      void renderProblems();
      body.append(
        w.hint(t("The rows below have no record in the game's own trigger set: TrigScript builds the code for them into the map as it is saved, as it builds the map's own script. Only StarCraft: Remastered plays a built map; keep the source map, and share the saved one.")),
        summaryEl, problemsEl,
        w.group(t("Map-wide"),
          w.column(cameraOn, w.form([{ label: t("Location"), field: cameraLoc }, { label: t("Inertia"), field: inertia }, { label: t("Max speed"), field: maxspeed }])),
          w.column(bgmOn, w.form([{ label: t("Sound"), field: bgmPath }, { label: t("Seconds"), field: bgmLen }])),
          noAir, unlimiter,
          w.hint(t("The camera and the music are built as a program of each human's own. The other two were code patches of euddraft's, which TrigScript's build does not have: a map that ticks one is not built until it is unticked.")),
        ),
        builderLine, status,
      );
      return () => watching.dispose();
    },
    buttons: [{ label: t("Close") }],
  });
}
