/**
 * The panel: the list beside the editor, the search box, New, the ⋯ menu, the
 * keyboard, and the events that keep it in step with the map.
 */
import type { PluginApi, TriggerRecord } from "@scm-js/plugin-api";
import { ActionType, ConditionType, PlayerGroup, SetModifier } from "../../vendor/triggers";
import { entry } from "../catalogue";
import { lowerAction } from "../model/eud";
import { clone, fingerprint as fingerprintOf, isTriggerDisabled, setTriggerDisabled } from "../model/records";
import { isFrameTrigger } from "./frame";
import type { Folder } from "../model/sidecar";
import { setOwners } from "../model/records";
import { DEFAULT_PLACEHOLDER, HUMAN_PLAYERS } from "../model/sync";
import { RECIPES, recipeContext, type RecipeContext } from "../model/recipes";
import { detach, prune } from "../model/ownership";
import type { Sidecar } from "../model/sidecar";
import { newInput } from "./buildRows";
import { freeCell } from "./expansionRows";
import type { Starter } from "../model/starters";
import { openBuildDialog } from "./build";
import { pickChoice } from "./chips";
import { renderEditor } from "./editor";
import { Host } from "./host";
import { renderList } from "./list";
import { openSettingsDialog } from "./settings";
import { createSimulator } from "./simulate";
import { closePopover, openPopover } from "./popover";
import { Store } from "./store";
import { STYLE } from "./styles";

const PANEL_WIDTH = 820;
const PANEL_HEIGHT = 560;

export interface PanelController {
  open(options?: { index?: number }): void;
  /** Open the panel and offer these whole triggers to start from; the one picked is inserted after the selection. */
  start(starters: Starter[]): void;
  close(): void;
  isOpen(): boolean;
}

export function createPanel(api: PluginApi, hooks: { afterCommit?: () => void } = {}): PanelController {
  let handle: { close(): void; isOpen(): boolean } | null = null;
  let store: Store | null = null;
  let host: Host | null = null;
  let pendingIndex: number | null = null;
  let pendingStart: Starter[] | null = null;
  let offerStart: ((starters: Starter[]) => void) | null = null;

  const open = (options: { index?: number } = {}) => {
    if (!api.document.isOpen()) { api.ui.toast({ kind: "info", title: api.i18n.t("Open a map first") }); return; }
    if (handle?.isOpen() && store) {
      if (options.index !== undefined) store.select(options.index);
      return;
    }
    pendingIndex = options.index ?? null;
    handle = api.ui.panel({
      title: "Magenta",
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      resizable: true,
      mount: (body, panel) => mount(body, () => panel.close()),
      onClose: () => { closePopover(); store = null; host = null; },
    });
  };

  function mount(body: HTMLElement, close: () => void): () => void {
    const el = api.ui.el;
    const t = api.i18n.t;
    const w = api.ui.widgets;
    host = new Host(api);
    store = new Store(host, { afterCommit: hooks.afterCommit, onBlocked: () => api.ui.toast({ kind: "error", title: t("Magenta cannot change this map yet"), detail: t("Its Magenta data could not be read. Start over from the notice at the top of the panel, or update Magenta.") }) });
    const s = store, h = host;
    const sim = createSimulator(api, h, s, () => everyFrame());
    if (pendingIndex !== null) s.selected = s.anchorOf(pendingIndex);
    else if (s.selected === null && s.list.length) s.selected = 0;

    const search = el("input", { className: "input", type: "text", placeholder: t("Search triggers…") }) as HTMLInputElement;
    let filter: "all" | "problems" | "eud" = "all";
    const newButton = w.button(t("New"), { primary: true, title: t("A new trigger after the selected one (Ctrl+N)"), onClick: () => newTrigger() });
    const recipeButton = w.button(t("Recipes…"), { title: t("Start from a whole trigger: a beacon shop, a countdown, a respawn…"), onClick: () => recipes(recipeButton) });
    const menuButton = w.button("⋯", { ghost: true, title: t("More"), onClick: () => menu(menuButton) });
    const listEl = el("div", { className: "mg-list", tabIndex: 0 });
    const editorEl = el("div", { className: "mg-editor" });
    const notice = el("div", { className: "mg-notice", hidden: true });
    const root = el("div", { className: "mg" }, el("style", {}, STYLE), el("div", { className: "mg-head" }, search, newButton, recipeButton, menuButton), notice, el("div", { className: "mg-split" }, listEl, editorEl));
    body.append(root);

    /** The member could not be read: say so, and offer to write over it — nothing is written until then. */
    const renderNotice = () => {
      const problem = h.sidecarProblem();
      notice.hidden = !problem;
      notice.replaceChildren();
      if (!problem) return;
      const what = problem.kind === "newer"
        ? t("This map's Magenta data was written by a newer Magenta (version {v}). Its folders, counter names and build rows are hidden, and the triggers cannot be changed here until Magenta is updated or the data is dropped.", { v: problem.version ?? "?" })
        : t("This map's Magenta data could not be read ({detail}). Its folders, counter names and build rows are hidden, and the triggers cannot be changed here until the data is dropped.", { detail: problem.detail ?? "" });
      notice.append(el("span", {}, what), w.button(t("Drop it and start over"), { onClick: () => {
        void api.ui.confirm(t("Every build row's sentence, every folder and every counter name in it is lost; the triggers themselves stay as they are in the map. Continue?"), { title: t("Drop Magenta's data") }).then((ok) => {
          if (!ok) return;
          h.discardSidecar();
          s.reload();
          render();
        });
      } }));
    };

    const render = () => {
      root.classList.toggle("narrow", root.clientWidth < 560);
      renderNotice();
      renderList({ api, host: h, store: s, query: () => search.value, filter: () => filter, onOpenFolderMenu: folderMenu }, listEl, moveTrigger);
      renderEditor({ api, host: h, store: s }, editorEl);
    };
    const unsubscribe = s.subscribe(render);
    search.addEventListener("input", render);
    render();
    offerStart = (starters) => {
      // The labels carry the objects' names; the hints would crowd them out of the row.
      const items = starters.map((st, i) => ({ value: i, label: st.label }));
      pickChoice(api, newButton, items, (i) => insertTriggers(t("New trigger from the map"), (intern) => starters[i].build(intern)), { width: 320, placeholder: t("Start from…") });
    };
    if (pendingStart) { const st = pendingStart; pendingStart = null; setTimeout(() => offerStart?.(st), 0); }

    /* ── Changes from elsewhere ── */
    const offTriggers = api.events.on("triggers", () => { if (s.stale()) s.reload(); });
    const offFile = api.events.on("file", () => { if (s.sidecar !== h.sidecar()) s.reload(); });
    const offDoc = api.events.on("document", () => { if (!api.document.isOpen()) close(); else { s.forget(); s.reload(); } });
    const offLang = api.events.on("language", render);
    const resize = new ResizeObserver(() => root.classList.toggle("narrow", root.clientWidth < 560));
    resize.observe(root);

    /* ── The list's verbs ── */
    function newTrigger(): void {
      const at = s.selected === null ? s.list.length : s.selected + 1;
      const fresh = api.triggers.newTrigger([PlayerGroup.Player1]);
      const folder = s.selected !== null ? s.folders.get(s.selected) : undefined;
      const folders = new Map<number, string>();
      for (const [i, f] of s.folders) folders.set(i >= at ? i + 1 : i, f);
      if (folder !== undefined) folders.set(at, folder);
      s.commit(t("New trigger"), () => [...s.list.slice(0, at), fresh, ...s.list.slice(at)], { folders, select: at });
      setTimeout(() => (editorEl.querySelector("input") as HTMLInputElement | null)?.focus(), 0);
    }
    /** Insert whole triggers after the selection, in its folder, and select the first; `sidecar` is asked after `make` has run once. */
    function insertTriggers(label: string, make: (intern: (text: string) => number) => TriggerRecord[], sidecar?: () => Partial<Sidecar>): boolean {
      const at = s.selected === null ? s.list.length : s.selected + 1;
      const folder = s.selected !== null ? s.folders.get(s.selected) : undefined;
      // How many are coming, so the folders after the insertion point can be shifted first.
      const count = make(() => 0).length;
      if (!count) return false;
      const folders = new Map<number, string>();
      for (const [i, f] of s.folders) folders.set(i >= at ? i + count : i, f);
      if (folder !== undefined) for (let i = 0; i < count; i++) folders.set(at + i, folder);
      s.commit(label, (intern) => [...s.list.slice(0, at), ...make(intern), ...s.list.slice(at)], { folders, select: at, sidecar: sidecar?.() });
      return true;
    }
    function recipes(anchor: HTMLElement): void {
      const items = RECIPES.map((r, i) => ({ value: i, label: r.label, hint: r.needsBuild ? "BUILD" : r.everyFrame ? "EUD" : undefined }));
      pickChoice(api, anchor, items, (i) => {
        const r = RECIPES[i];
        const locations = h.locations().map((l) => l.value).filter((n) => n !== 64);
        // Synced input a recipe asks for is allocated once, whichever call of `build` asks first, and the MSQC bookkeeping goes in with the triggers.
        let msqc = s.sidecar.msqc;
        const memo = new Map<string, ReturnType<RecipeContext["input"]>>();
        const input: RecipeContext["input"] = (what, options = {}) => {
          const key = `${what}:${options.code ?? ""}:${options.button ?? ""}`;
          if (memo.has(key)) return memo.get(key)!;
          const made = newInput(h, { ...s, sidecar: { ...s.sidecar, msqc } } as Store, what, options);
          if (made) msqc = made.msqc;
          memo.set(key, made?.condition ?? null);
          return made?.condition ?? null;
        };
        const ok = insertTriggers(t("Add recipe"), (intern) => r.build(recipeContext(intern, locations, input)), () => (msqc !== s.sidecar.msqc ? { msqc } : {}));
        if (!ok) { api.ui.toast({ kind: "error", title: t("No room for synced input"), detail: t("It needs a free counter unit and a free location slot.") }); return; }
        api.ui.toast({ kind: "info", title: r.label, detail: r.description + (r.everyFrame && !everyFrame() ? " " + t("Turn on Run triggers every frame in the ⋯ menu for this one.") : "") });
      }, { width: 300, searchable: true, placeholder: t("Recipe…") });
    }
    function moveTrigger(from: number, to: number, folder: string | null): void {
      const list = [...s.list];
      const [moved] = list.splice(from, 1);
      const dest = from < to ? to - 1 : to;
      list.splice(dest, 0, moved);
      const folders = new Map<number, string>();
      const old = [...s.folders];
      const order = list.map((tr) => s.list.indexOf(tr));
      order.forEach((oldIndex, newIndex) => { const f = old.find(([i]) => i === oldIndex)?.[1]; if (f !== undefined) folders.set(newIndex, f); });
      if (folder === null) folders.delete(dest); else folders.set(dest, folder);
      s.commit(t("Move trigger"), () => list, { folders, select: dest });
    }
    /** The triggers with build rows and counter steps of their own, and the sidecar lists grown by the copies. */
    function detachAll(triggers: TriggerRecord[]): { triggers: TriggerRecord[]; sidecar: Partial<Sidecar>; stuck: number } {
      let builds = s.sidecar.builds, expansions = s.sidecar.expansions, stuck = 0;
      const out = triggers.map((tr) => {
        const d = detach(tr, builds, expansions, (taken) => freeCell({ ...s, sidecar: { ...s.sidecar, builds, expansions } } as Store, h, taken));
        builds = d.builds; expansions = d.expansions; stuck += d.stuck;
        return d.trigger;
      });
      return { triggers: out, sidecar: builds !== s.sidecar.builds || expansions !== s.sidecar.expansions ? { builds, expansions } : {}, stuck };
    }
    function duplicate(): void {
      if (s.selected === null) return;
      const i = s.selected;
      const folders = new Map<number, string>();
      for (const [k, f] of s.folders) folders.set(k > i ? k + 1 : k, f);
      const f = s.folders.get(i);
      if (f !== undefined) folders.set(i + 1, f);
      const d = detachAll([clone(s.list[i])]);
      if (d.stuck) api.ui.toast({ kind: "error", title: t("No free counter cell for the copy's build rows"), detail: t("{n, plural, one {# row is} other {# rows are}} shared with the original: editing it in one changes the other.", { n: d.stuck }) });
      s.commit(t("Duplicate trigger"), () => [...s.list.slice(0, i + 1), ...d.triggers, ...s.list.slice(i + 1)], { folders, select: i + 1, sidecar: d.sidecar });
    }
    function remove(): void {
      if (s.selected === null) return;
      const i = s.selected;
      const folders = new Map<number, string>();
      for (const [k, f] of s.folders) if (k !== i) folders.set(k > i ? k - 1 : k, f);
      // Its own build rows go with it; the counter steps' sync drops theirs.
      const builds = prune(s.sidecar.builds, s.list, [i]);
      s.commit(t("Delete trigger"), () => s.list.filter((_, k) => k !== i), { folders, select: Math.min(i, s.list.length - 2) < 0 ? null : Math.min(i, s.list.length - 2), sidecar: builds.length !== s.sidecar.builds.length ? { builds } : {} });
    }
    function toggleDisabled(): void {
      if (s.selected === null) return;
      const tr = s.list[s.selected];
      s.replace(s.selected, setTriggerDisabled(tr, !isTriggerDisabled(tr)), t("Toggle trigger"));
    }
    function move(delta: number): void {
      if (s.selected === null) return;
      const to = s.selected + delta;
      if (to < 0 || to >= s.list.length) return;
      moveTrigger(s.selected, delta > 0 ? to + 1 : to, s.folders.get(to) ?? null);
    }
    async function copyText(): Promise<void> {
      if (s.selected === null) return;
      await navigator.clipboard.writeText(api.triggers.text.one(s.list[s.selected]));
      api.ui.toast({ kind: "info", title: t("Copied as text") });
    }
    async function pasteText(): Promise<void> {
      let text = "";
      try { text = await navigator.clipboard.readText(); } catch { api.ui.toast({ kind: "error", title: t("The browser did not allow reading the clipboard") }); return; }
      let parsed: { trigger: TriggerRecord }[];
      try { parsed = api.triggers.text.parse(text); } catch (e) { api.ui.toast({ kind: "error", title: t("That is not trigger text"), detail: String((e as Error).message ?? e) }); return; }
      if (!parsed.length) return;
      const at = s.selected === null ? s.list.length : s.selected + 1;
      const folders = new Map<number, string>();
      for (const [i, f] of s.folders) folders.set(i >= at ? i + parsed.length : i, f);
      // Text copied from this map names its build rows' cells: the paste gets rows of its own.
      const d = detachAll(parsed.map((p) => p.trigger));
      s.commit(t("Paste triggers"), () => [...s.list.slice(0, at), ...d.triggers, ...s.list.slice(at)], { folders, select: at, sidecar: d.sidecar });
    }
    function newFolder(): void {
      void api.ui.prompt(t("Folder name"), { title: t("New folder") }).then((name) => {
        if (!name?.trim()) return;
        const folder: Folder = { id: `f${Date.now().toString(36)}`, name: name.trim(), triggers: [] };
        const folders = new Map(s.folders);
        if (s.selected !== null) folders.set(s.selected, folder.id);
        s.commit(t("New folder"), () => s.list, { folders, sidecar: { folders: [...s.sidecar.folders, folder] } });
      });
    }
    function folderMenu(anchor: HTMLElement, id: string): void {
      const f = s.sidecar.folders.find((x) => x.id === id);
      if (!f) return;
      openPopover(anchor, (p) => [
        el("button", { type: "button", className: "mg-menu-item", onclick: () => { p.close(); void api.ui.prompt(t("Folder name"), { title: t("Rename folder"), value: f.name }).then((name) => { if (name?.trim()) s.updateSidecar(t("Rename folder"), { folders: s.sidecar.folders.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)) }); }); } }, t("Rename…")),
        el("button", { type: "button", className: "mg-menu-item", onclick: () => { p.close(); const folders = new Map(s.folders); for (const [i, x] of s.folders) if (x === id) folders.delete(i); s.commit(t("Remove folder"), () => s.list, { folders, sidecar: { folders: s.sidecar.folders.filter((x) => x.id !== id) } }); } }, t("Remove folder (keep triggers)")),
      ], { width: 200, menu: true });
    }

    /* ── The every-frame switch ── */
    const timerEntry = entry("game.triggerTimer")!;
    function everyFrame(): boolean { return s.list.some(isFrameTrigger); }
    function setEveryFrame(on: boolean): void {
      if (on === everyFrame()) return;
      if (on) {
        s.commit(t("Run triggers every frame"), (intern) => {
          const tr = api.triggers.newTrigger([PlayerGroup.AllPlayers]);
          tr.conditions = [api.triggers.newCondition(ConditionType.Always)];
          tr.actions = [{ ...api.triggers.newAction(ActionType.Comment), text: intern("Magenta: run triggers every frame") }, lowerAction({ entry: timerEntry, args: {}, value: 0, op: SetModifier.SetTo }), api.triggers.newAction(ActionType.PreserveTrigger)];
          return [...s.list, tr];
        }, { sidecar: { settings: { ...s.sidecar.settings, everyFrame: true } } });
        void api.ui.alert(t("A trigger at the end of the list now sets the trigger timer to 0 every cycle, so the whole list runs every frame instead of every two seconds. Every Wait and every preserved trigger in the map now runs on that clock: a counter that added 1 per cycle adds 24 a second."), { title: t("Triggers run every frame") });
      } else {
        const folders = new Map<number, string>();
        let removed = 0;
        s.list.forEach((tr, i) => { if (isFrameTrigger(tr)) removed++; else { const f = s.folders.get(i); if (f !== undefined) folders.set(i - removed, f); } });
        s.commit(t("Run triggers every two seconds"), () => s.list.filter((tr) => !isFrameTrigger(tr)), { folders, sidecar: { settings: { ...s.sidecar.settings, everyFrame: false } } });
      }
    }

    /* ── ⋯ ── */
    function menu(anchor: HTMLElement): void {
      const item = (label: string, run: () => void, options: { shortcut?: string; disabled?: boolean; checked?: boolean } = {}) => {
        const b = el("button", { type: "button", className: "mg-menu-item", disabled: options.disabled ?? false }, el("span", { className: "label" }, options.checked !== undefined ? (options.checked ? "☑ " : "☐ ") : "", label), options.shortcut ? el("span", { className: "shortcut" }, options.shortcut) : null) as HTMLButtonElement;
        b.addEventListener("click", () => { closePopover(); run(); });
        return b;
      };
      const sep = () => el("div", { className: "mg-menu-sep" });
      openPopover(anchor, () => [
        item(t("Undo {what}", { what: s.canUndo() ?? "" }), () => s.undo(), { shortcut: "Ctrl+Z", disabled: !s.canUndo() }),
        item(t("Redo {what}", { what: s.canRedo() ?? "" }), () => s.redo(), { shortcut: "Ctrl+Y", disabled: !s.canRedo() }),
        sep(),
        item(t("Duplicate trigger"), duplicate, { shortcut: "Ctrl+D", disabled: s.selected === null }),
        item(t("Disable / enable trigger"), toggleDisabled, { shortcut: "Ctrl+/", disabled: s.selected === null }),
        item(t("Delete trigger"), remove, { shortcut: "Del", disabled: s.selected === null }),
        item(t("New folder…"), newFolder),
        sep(),
        item(t("Copy trigger as text"), () => void copyText(), { shortcut: "Ctrl+C", disabled: s.selected === null }),
        item(t("Paste triggers from text"), () => void pasteText(), { shortcut: "Ctrl+V" }),
        sep(),
        perPlayerItem(),
        sep(),
        item(t("Run triggers every frame"), () => setEveryFrame(!everyFrame()), { checked: everyFrame() }),
        item(t("Counters…"), () => countersDialog()),
        sep(),
        item(t("Dry run…"), () => sim.open()),
        item(t("Build EUD map…"), () => openBuildDialog(api, h, s, everyFrame())),
        item(t("Settings…"), () => openSettingsDialog(api)),
        sep(),
        item(t("Show every trigger"), () => { filter = "all"; render(); }, { checked: filter === "all" }),
        item(t("Show only triggers with a problem"), () => { filter = "problems"; render(); }, { checked: filter === "problems" }),
        item(t("Show only EUD triggers"), () => { filter = "eud"; render(); }, { checked: filter === "eud" }),
      ], { width: 260, menu: true });
    }
    function perPlayerItem(): HTMLElement {
      const i = s.selected;
      const existing = i === null ? null : s.sidecar.expansions.find((x) => x.kind === "forEachPlayer" && x.anchor.i === s.cleanIndex(i));
      const b = el("button", { type: "button", className: "mg-menu-item", disabled: i === null }, existing ? t("Stop running for each player") : t("Run this trigger for each player…")) as HTMLButtonElement;
      b.addEventListener("click", () => {
        closePopover();
        if (i === null) return;
        if (existing && existing.kind === "forEachPlayer") {
          s.commit(t("Stop running for each player"), () => s.list.map((tr, k) => (k === i ? setOwners(tr, existing.players) : tr)), { sidecar: { expansions: s.sidecar.expansions.filter((x) => x.id !== existing.id) } });
          return;
        }
        const boxes = HUMAN_PLAYERS.map((p) => w.checkbox(api.names.playerGroup(p), { value: true }));
        const placeholder = w.select(api.names.playerGroups().filter((g) => g.value >= 12).map((g) => ({ value: g.value, label: g.label })), { value: DEFAULT_PLACEHOLDER });
        api.ui.dialog({
          title: t("Run for each player"),
          size: "sm",
          mount(body) {
            body.append(w.hint(t("One copy of this trigger per player ticked, owned by that player, with the group below replaced by the player in every condition and action. This trigger becomes the template and stops running itself.")), w.column(...boxes), w.form([{ label: t("Stands for the player"), field: placeholder }]));
          },
          buttons: [
            { label: t("OK"), primary: true, run: () => {
              const players = HUMAN_PLAYERS.filter((_, k) => boxes[k].input.checked);
              if (!players.length) return;
              const tr = s.list[i];
              s.commit(t("Run for each player"), () => s.list, { sidecar: { expansions: [...s.sidecar.expansions, { id: `p${Date.now().toString(36)}`, kind: "forEachPlayer", placeholder: Number(placeholder.value), players, anchor: { i: s.cleanIndex(i), h: fingerprintOf(tr) } }] } });
            } },
            { label: t("Cancel") },
          ],
        });
      });
      return b;
    }
    function countersDialog(): void {
      const rows = s.sidecar.counters;
      const namer = h.namer(s.sidecar);
      api.ui.dialog({
        title: t("Named counters"),
        size: "md",
        mount(body) {
          if (!rows.length) { body.append(w.hint(t("No counter has a name yet. Name one from a Deaths row's name… chip, or from a counter chip's New counter…"))); return; }
          body.append(w.list(rows.map((c) => ({ label: c.name, value: c, hint: `${namer.player(c.player)} · ${namer.unit(c.unit)}` }))));
        },
      });
    }

    /* ── Keys ── */
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { if (typing) return; e.preventDefault(); s.undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { if (typing) return; e.preventDefault(); s.redo(); }
      else if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); newTrigger(); }
      else if (mod && e.key.toLowerCase() === "d" && !typing) { e.preventDefault(); duplicate(); }
      else if (mod && e.key === "/" && !typing && listEl.contains(target)) { e.preventDefault(); toggleDisabled(); }
      else if (mod && e.key.toLowerCase() === "c" && listEl.contains(target) && !typing) { e.preventDefault(); void copyText(); }
      else if (mod && e.key.toLowerCase() === "v" && listEl.contains(target) && !typing) { e.preventDefault(); void pasteText(); }
      else if (e.key === "Delete" && listEl.contains(target) && !typing) { e.preventDefault(); remove(); }
      else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && listEl.contains(target)) { e.preventDefault(); move(e.key === "ArrowUp" ? -1 : 1); }
      else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && listEl.contains(target) && !typing) {
        e.preventDefault();
        const items = [...listEl.querySelectorAll<HTMLElement>(".mg-item")].map((x) => Number(x.dataset.index));
        const pos = s.selected === null ? -1 : items.indexOf(s.selected);
        const next = items[Math.max(0, Math.min(items.length - 1, pos + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next !== undefined) s.select(next);
      }
      else if (e.key === "Escape" && !typing) { /* the popover took it */ }
    };
    root.addEventListener("keydown", onKey);

    return () => {
      offerStart = null;
      unsubscribe();
      offTriggers.dispose();
      offFile.dispose();
      offDoc.dispose();
      offLang.dispose();
      resize.disconnect();
      closePopover();
      sim.close();
    };
  }

  return {
    open,
    start: (starters) => {
      if (!starters.length) return;
      if (handle?.isOpen() && offerStart) { offerStart(starters); return; }
      pendingStart = starters;
      open();
    },
    close: () => handle?.close(),
    isOpen: () => handle?.isOpen() ?? false,
  };
}
