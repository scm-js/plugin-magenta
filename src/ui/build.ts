/**
 * The Build step: the map as it stands, plus the sidecar's build records, handed to the
 * eudplib library plugin (github.com/scm-js/plugin-eudplib — euddraft and eudplib running
 * in this editor, no server), and the built map saved beside the source. The plugin's own
 * euddraft plugin, `python/magenta.py`, goes along as source, so the two halves of the
 * Magenta spec always ship together. The built file is what players get; the source map
 * stays the editor's.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { MAGENTA_PY } from "../generated/magentaPy";
import { composePlugins, DEFAULT_OPTIONS, type BuildOptions } from "../model/builds";
import { orderBuilds } from "../model/ownership";
import { buildFreshness, lastBuildRecord, preflight, sourceRevision, type LastBuild, type PreflightProblem, type Runtime } from "../model/preflight";
import { EUDPLIB_SERVICE, type EudplibService } from "../../vendor/eudplib";
import { needsBuild } from "./buildRows";
import type { Host } from "./host";
import type { Store } from "./store";

const CAMMOVE_LOC = "cammoveLoc";
/** The plugin follows only while a switch of this name is set, so triggers can turn the camera on and off. */
const CAMMOVE_SWITCH = "cammove";

/** The library plugin's service, or null when it is not installed or is off. */
export const eudplib = (api: PluginApi): EudplibService | null => api.services.get<EudplibService>(EUDPLIB_SERVICE);
const runtimeOf = (svc: EudplibService | null): Runtime | null => svc ? { eudplib: svc.versions.eudplib, euddraft: svc.versions.euddraft } : null;

/** Where the map stands against its last build: how many triggers need one, and whether the output is current. */
export function buildStatus(host: Host, store: Store): { triggers: number; freshness: "never" | "fresh" | "stale"; last: LastBuild | null; revision: string } {
  const triggers = store.list.filter((t) => needsBuild(store, t)).length;
  const revision = sourceRevision(store.list, store.sidecar, host.revisionExtra());
  const last = store.sidecar.settings.lastBuild ?? null;
  return { triggers, freshness: buildFreshness(last, revision), last, revision };
}

const timeOf = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(); };

export function openBuildDialog(api: PluginApi, host: Host, store: Store, everyFrame: boolean): void {
  const t = api.i18n.t;
  const el = api.ui.el;
  const w = api.ui.widgets;
  // In list order, so the hooks of a cycle run in the order the rows show.
  const builds = orderBuilds(store.sidecar.builds, store.list);
  const chats = builds.filter((b) => b.kind === "chat").length;
  const hooks = builds.length - chats;
  const options: BuildOptions = { ...DEFAULT_OPTIONS, ...store.sidecar.settings.build };
  const saveOptions = () => store.updateSidecar(t("Build options"), { settings: { ...store.sidecar.settings, build: options } });
  const plugins = () => composePlugins(builds, store.sidecar.chat, everyFrame, store.sidecar.msqc, options, options.camera ? 0 : null);

  /* ── The map-wide options ── */
  // cammove finds its target by name, so only locations with a name of their own are offered.
  const locations = host.locations().filter((l) => l.value !== 64 && l.named);
  const cameraOn = w.checkbox(t("The camera follows a location, for everyone"), { value: !!options.camera });
  const cameraLoc = w.select(locations.map((l) => ({ value: l.value, label: l.label })), { value: options.camera?.location ?? locations[0]?.value ?? 0 });
  const inertia = w.number({ value: options.camera?.inertia ?? 5, min: 1, max: 60 });
  const maxspeed = w.number({ value: options.camera?.maxspeed ?? 48, min: 1, max: 999 });
  const cameraStart = w.checkbox(t("Start following at once (a trigger sets the cammove switch)"), { value: true });
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
  bgmPath.addEventListener("change", () => { const path = api.names.string(Number(bgmPath.value)) ?? ""; const secs = host.wavSeconds(path); if (secs) bgmLen.value = String(Math.round(secs * 2) / 2); });
  const noAir = w.checkbox(t("Air units pass through one another"), { value: options.noAirCollision });
  const unlimiter = w.checkbox(t("Lift the sprite and image limits"), { value: options.unlimiter });
  const readAll = () => { readCamera(); readBgm(); options.noAirCollision = noAir.input.checked; options.unlimiter = unlimiter.input.checked; };
  const info = api.document.info();
  const stem = (info?.fileName ?? "map").replace(/\.(scx|scm|chk)$/i, "");

  const status = w.statusLine();
  const log = el("textarea", { className: "textarea", rows: 10, readOnly: true, spellcheck: false, style: "font-family: var(--font-mono); font-size: var(--fs-xs); display: none" }) as HTMLTextAreaElement;
  const summary = el("ul", {},
    el("li", {}, chats ? t("{n, plural, one {# chat command} other {# chat commands}}", { n: chats }) : t("No chat commands")),
    el("li", {}, hooks ? t("{n, plural, one {# build row} other {# build rows}} (text, maths, unit passes, checks)", { n: hooks }) : t("No build rows")),
    el("li", {}, plugins().MSQC ? t("Synced input (keys, clicks, mouse) through MSQC") : t("No synced input")),
    el("li", {}, everyFrame ? t("Triggers run every frame (turbo)") : t("Triggers run every two seconds")),
  );
  const nothing = !Object.keys(plugins()).length;

  /* ── Freshness, the runtime, and the preflight ── */
  const fresh = el("div", { className: "mg-build-fresh" });
  const runtimeLine = el("div", { className: "hint" });
  const problemsEl = el("ul", { className: "mg-preflight" });
  let handle: { close(): void } | null = null;
  const renderFresh = () => {
    const st = buildStatus(host, store);
    fresh.replaceChildren();
    if (st.freshness === "never") fresh.append(el("span", {}, t("This map has not been built yet.")));
    else if (st.freshness === "fresh") fresh.append(el("span", {}, t("Built from the map as it is now, {when}{file}.", { when: timeOf(st.last!.at), file: st.last!.file ? ` (${st.last!.file})` : "" })));
    else fresh.append(el("span", { style: "color: var(--warn)" }, t("The map changed since its last build, {when}{file}: that output is stale.", { when: timeOf(st.last!.at), file: st.last!.file ? ` (${st.last!.file})` : "" })));
  };
  const problems = (): PreflightProblem[] => {
    readAll();
    return preflight({
      list: store.list, sidecar: store.sidecar, options, plugins: plugins(), runtime: runtimeOf(eudplib(api)),
      playerTypes: host.playerTypes(), playerTypeName: (s) => host.playerTypeName(s), playerName: (s) => api.names.playerGroup(s), unitName: (id) => api.triggers.names().unit(id),
      placedUnitIds: host.placedUnitIds(), placedOwners: host.placedOwners(), locations: host.locationSlots(), soundPresent: (p) => host.soundPresent(p),
    });
  };
  const renderProblems = () => {
    const list = problems();
    problemsEl.replaceChildren();
    problemsEl.hidden = !list.length;
    for (const p of list) {
      const li = el("li", { className: p.level }, p.text);
      if (p.trigger !== undefined) { const i = p.trigger; li.append(el("button", { type: "button", className: "mg-sim-link", onclick: () => { store.select(i); handle?.close(); } }, t("Show"))); }
      problemsEl.append(li);
    }
    return list;
  };
  const renderRuntime = () => {
    const svc = eudplib(api);
    if (!svc) { runtimeLine.textContent = ""; return; }
    const state = svc.state();
    const where = state === "ready" ? t("ready in this editor") : state === "installing" ? t("being downloaded") : t("downloaded on the first build, {mb} MB", { mb: Math.round(svc.downloadBytes / 1e5) / 10 });
    runtimeLine.textContent = t("Builds run with eudplib {eudplib} and euddraft {euddraft}, {where}.", { eudplib: svc.versions.eudplib, euddraft: svc.versions.euddraft, where });
  };
  // The library may arrive or go while the dialog is open (Manage Plugins is a dialog away).
  const watching = api.services.watch(EUDPLIB_SERVICE, () => { renderRuntime(); renderProblems(); });
  for (const box of [cameraOn, bgmOn]) box.input.addEventListener("change", () => renderProblems());
  cameraLoc.addEventListener("change", () => renderProblems());
  bgmPath.addEventListener("change", () => renderProblems());

  handle = api.ui.dialog({
    title: t("Build EUD map"),
    size: "md",
    mount(body) {
      renderFresh();
      renderRuntime();
      renderProblems();
      body.append(
        w.hint(t("euddraft adds the code for the rows below to the map as it stands, here in the editor, and the built map is saved as a file. Nothing leaves this machine. Only StarCraft: Remastered plays the result. Keep this map as the source: the built one is the compiled output, the way a program is.")),
        summary, fresh, problemsEl,
        w.group(t("Map-wide"),
          w.column(cameraOn, w.form([{ label: t("Location"), field: cameraLoc }, { label: t("Inertia"), field: inertia }, { label: t("Max speed"), field: maxspeed }]), cameraStart),
          w.column(bgmOn, w.form([{ label: t("Sound"), field: bgmPath }, { label: t("Seconds"), field: bgmLen }])),
          noAir, unlimiter,
          w.hint(t("The camera follows a location by its name, so only named locations are offered. It follows while a switch named cammove is set, so a trigger can turn it on and off; the switch and a helper location named cammoveLoc are made in this map at build time. A looped sound needs its length; a plain WAV's is read from the file.")),
        ),
        runtimeLine, status, log,
      );
      if (nothing && !locations.length) status.set(t("Nothing in this map needs a build; a plain save is all it takes."), "warn");
      return () => watching.dispose();
    },
    buttons: [
      { label: t("Build…"), primary: true, closes: false, run: async () => {
        readAll();
        const errors = renderProblems().filter((p) => p.level === "error").length;
        if (errors) { status.set(t("{n, plural, one {Fix the problem above first.} other {Fix the # problems above first.}}", { n: errors }), "error"); return; }
        saveOptions();
        let cammove: number | null = null;
        if (options.camera) {
          cammove = host.ensureLocation(CAMMOVE_LOC);
          if (cammove === null) { status.set(t("The camera needs one free location slot for its helper location."), "error"); return; }
          const sw = host.ensureSwitch(CAMMOVE_SWITCH);
          if (sw === null) { status.set(t("The camera needs one free switch to turn it on and off."), "error"); return; }
          store.reload();
          const sets = store.list.some((tr) => tr.actions.some((a) => a.type === 13 && a.target === sw));
          if (cameraStart.input.checked && !sets) {
            store.commit(t("Start the camera"), (intern) => {
              const tr = api.triggers.newTrigger([17]);
              tr.conditions = [api.triggers.newCondition(22)];
              tr.actions = [{ ...api.triggers.newAction(47), text: intern("Camera: start following") }, { ...api.triggers.newAction(13), target: sw, modifier: 4 }];
              return [...store.list, tr];
            });
          }
        }
        const plugins = composePlugins(builds, store.sidecar.chat, everyFrame, store.sidecar.msqc, options, cammove);
        // The revision the output is of: taken now, before anything else moves.
        const revision = buildStatus(host, store).revision;
        const file = await api.document.export();
        if (!file) { status.set(t("No map is open."), "error"); return; }
        const svc = eudplib(api);
        if (!svc) { status.set(t("The eudplib plugin is not running; install or turn it on under Plugins ▸ Manage Plugins…"), "error"); return; }
        const ready = await svc.ensure({ reason: t("Magenta needs it to build this map.") });
        renderRuntime();
        if (!ready) { status.set(t("Not built: the build runtime was not installed."), "warn"); return; }
        status.busy(t("Building…"));
        log.style.display = "none";
        log.value = "";
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await svc.build({ map: bytes, plugins, sources: { magenta: MAGENTA_PY } }, { onLog: (line) => { log.value += line + "\n"; } });
          const out = result.map;
          const saved = await api.ui.saveFile(out, `${stem}-eud.scx`);
          status.set(saved ? t("Built: {name}, {kb} KB in {s} s.", { name: saved.fileName, kb: Math.round(out.length / 1024), s: Math.round(result.ms / 100) / 10 }) : t("Built, but not saved."), saved ? "ok" : "warn");
          if (result.log) { log.value = result.log; log.style.display = ""; }
          // What the output is of, kept with the map, so the panel can say when it has gone stale.
          store.updateSidecar(t("Build"), { settings: { ...store.sidecar.settings, lastBuild: lastBuildRecord(revision, saved?.fileName ?? null, runtimeOf(svc)) } });
          renderFresh();
        } catch (err) {
          status.set(t("The build failed: {why}. The map is unchanged.", { why: String((err as Error).message ?? err) }), "error");
          if (log.value) log.style.display = "";
        }
      } },
      { label: t("Close") },
    ],
  });
}
