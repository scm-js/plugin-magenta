/**
 * The left pane: the map's triggers in list order, grouped under their folders, with a
 * title (the Comment action) or a summary, the owners, and badges — EUD, locked, a
 * problem. Drag to reorder or to move into a folder; the keyboard does the same.
 */
import type { PluginApi, TriggerRecord } from "@scm-js/plugin-api";
import { ActionType, ConditionType } from "../../vendor/triggers";
import { check } from "../model/checks";
import { isEud } from "../model/eud";
import { commentIndex, isTriggerDisabled, owners } from "../model/records";
import { needsBuild } from "./buildRows";
import type { Host } from "./host";
import type { Store } from "./store";
import { actionWords, conditionWords } from "./words";

export interface ListDeps {
  api: PluginApi;
  host: Host;
  store: Store;
  /** The search box's text. */
  query: () => string;
  /** Show only triggers with a problem, or only EUD ones. */
  filter: () => "all" | "problems" | "eud";
  onOpenFolderMenu(anchor: HTMLElement, folderId: string): void;
}

export interface ItemInfo {
  index: number;
  title: string;
  summary: string;
  ownersText: string;
  eud: boolean;
  locked: string | null;
  problems: "error" | "warn" | null;
  disabled: boolean;
  /** Triggers Magenta generated for this one. */
  generated: number;
  /** Uses a row that only a euddraft build can do. */
  build: boolean;
}

export function itemInfo(deps: ListDeps, index: number, trigger: TriggerRecord): ItemInfo {
  const { api, host, store } = deps;
  const namer = host.namer(store.sidecar);
  const ci = commentIndex(trigger);
  const conditions = conditionWords(api, host, store, index, trigger).filter(Boolean);
  const actions = actionWords(api, host, store, trigger).filter(Boolean);
  const title = ci >= 0 ? namer.string(trigger.actions[ci].text) ?? "" : "";
  const summary = [conditions.join(", "), actions.join(", ")].filter(Boolean).join(" → ");
  const own = owners(trigger);
  const ownersText = own.length > 4 ? deps.api.i18n.t("{n} groups", { n: own.length }) : own.map((g) => (g < 12 ? `P${g + 1}` : namer.player(g))).join(", ");
  const eud = trigger.conditions.some((c) => c.type === ConditionType.Deaths && isEud(c.player)) || trigger.actions.some((a) => a.type === ActionType.SetDeaths && isEud(a.player));
  const claim = host.claims(store.list).find((c) => index >= c.start && index < c.start + c.count && c.pluginId !== deps.api.plugin.id);
  const template = store.sidecar.expansions.some((x) => x.kind === "forEachPlayer" && x.anchor.i === store.cleanIndex(index));
  const problems = check(trigger, { everyFrame: store.sidecar.settings.everyFrame, locationExists: (n) => host.locationExists(n), stringExists: (i) => host.stringExists(i), template });
  const generated = store.runs.filter((r) => r.anchor === index).reduce((n, r) => n + r.count, 0);
  return {
    generated,
    build: needsBuild(store, trigger),
    index, title: title || summary || deps.api.i18n.t("Empty trigger"), summary: title ? summary : "", ownersText, eud, locked: claim?.badge ?? null,
    problems: problems.some((p) => p.level === "error") ? "error" : problems.some((p) => p.level === "warn") ? "warn" : null,
    disabled: isTriggerDisabled(trigger),
  };
}

export function renderList(deps: ListDeps, root: HTMLElement, onMove: (from: number, to: number, folder: string | null) => void): void {
  const { api, store } = deps;
  const el = api.ui.el;
  const t = api.i18n.t;
  root.replaceChildren();
  const q = deps.query().trim().toLowerCase();
  const infos = store.list.map((tr, i) => (store.isRun(i) ? null : itemInfo(deps, i, tr))).filter((x): x is ItemInfo => x !== null);
  const filter = deps.filter();
  const visible = infos.filter((info) => (!q || `${info.title} ${info.summary} ${info.ownersText}`.toLowerCase().includes(q)) && (filter === "all" || (filter === "eud" ? info.eud : info.problems !== null)));
  if (!visible.length) { root.append(el("div", { className: "mg-empty" }, store.list.length ? t("Nothing matches.") : t("No triggers."))); return; }

  const folderName = (id: string) => store.sidecar.folders.find((f) => f.id === id);
  let lastFolder: string | null | undefined = undefined;
  let dragging: number | null = null;
  const item = (info: ItemInfo, top: boolean) => {
    const row = el("div", { className: `mg-item${top ? " top" : ""}${info.index === store.selected ? " selected" : ""}${info.disabled ? " disabled" : ""}`, draggable: true, "data-index": info.index, title: info.summary || info.title },
      el("span", { className: "mg-title" }, info.title),
      el("span", { className: "mg-badges" },
        info.locked ? el("span", { className: "mg-badge lock" }, info.locked) : null,
        info.eud ? el("span", { className: "mg-badge eud" }, "EUD") : null,
        info.generated ? el("span", { className: "mg-badge", title: t("Triggers Magenta generates for this one") }, `+${info.generated}`) : null,
        info.build ? el("span", { className: "mg-badge eud", title: t("Needs a Build to work in the game") }, "BUILD") : null,
        info.problems ? el("span", { className: `mg-badge ${info.problems}` }, "!") : null,
        el("span", { className: "mg-badge" }, info.ownersText),
      ),
      info.summary ? el("span", { className: "mg-sub" }, info.summary) : null,
    );
    row.addEventListener("click", () => store.select(info.index));
    row.addEventListener("dragstart", (e) => { dragging = info.index; e.dataTransfer?.setData("text/plain", String(info.index)); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; });
    row.addEventListener("dragover", (e) => { if (dragging === null) return; e.preventDefault(); row.classList.add("drop-before"); });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drop-before");
      const from = Number(e.dataTransfer?.getData("text/plain") ?? dragging);
      dragging = null;
      if (!Number.isInteger(from) || from === info.index) return;
      onMove(from, info.index, store.folders.get(info.index) ?? null);
    });
    return row;
  };
  for (const info of visible) {
    const folder = store.folders.get(info.index) ?? null;
    if (folder !== lastFolder) {
      lastFolder = folder;
      if (folder !== null) {
        const f = folderName(folder);
        const count = infos.filter((x) => store.folders.get(x.index) === folder).length;
        const head = el("div", { className: "mg-folder", title: t("Double-click to rename; drop a trigger here to put it in the folder") }, el("span", {}, f?.closed ? "▸" : "▾"), el("span", {}, f?.name ?? folder), el("span", { className: "mg-count" }, String(count)));
        head.addEventListener("click", () => {
          const folders = store.sidecar.folders.map((x) => (x.id === folder ? { ...x, closed: !x.closed } : x));
          store.updateSidecar(t("Fold"), { folders });
        });
        head.addEventListener("dblclick", (e) => { e.preventDefault(); deps.onOpenFolderMenu(head, folder); });
        head.addEventListener("contextmenu", (e) => { e.preventDefault(); deps.onOpenFolderMenu(head, folder); });
        head.addEventListener("dragover", (e) => { if (dragging === null) return; e.preventDefault(); head.classList.add("drop"); });
        head.addEventListener("dragleave", () => head.classList.remove("drop"));
        head.addEventListener("drop", (e) => {
          e.preventDefault();
          head.classList.remove("drop");
          const from = Number(e.dataTransfer?.getData("text/plain") ?? dragging);
          dragging = null;
          if (!Number.isInteger(from)) return;
          // To the end of the folder's block.
          const members = infos.filter((x) => store.folders.get(x.index) === folder).map((x) => x.index);
          const last = members.length ? Math.max(...members) : info.index - 1;
          onMove(from, from < last ? last : last + 1, folder);
        });
        root.append(head);
      }
    }
    if (folder !== null && folderName(folder)?.closed && info.index !== store.selected) continue;
    root.append(item(info, folder === null));
  }
  root.querySelector(".mg-item.selected")?.scrollIntoView({ block: "nearest" });
}
