/**
 * The add row: an input that searches everything a trigger can hold — the native
 * conditions or actions, and the catalogue — and inserts the pick.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { ACTION_DEFS, CONDITION_DEFS } from "../../vendor/triggerDefs";
import { ConditionType, ActionType } from "../../vendor/triggers";
import { entriesFor, type Entry } from "../catalogue";
import { search, type SearchItem } from "../model/search";
import { parseQuery, type Entity, type ParseNames } from "../model/parse";
import { openPopover, type PopoverHandle } from "./popover";

export type Pick = { kind: "native"; type: number } | { kind: "eud"; entry: Entry } | { kind: "expansion"; what: "copy" | "add" | "subtract" | "compare" } | { kind: "build"; what: "chat" | "text" | "math" | "foreach" | "count" | "read" | "setloc" | "pick" | "scan" | "key" | "click" | "mouseIn" };

const NATIVE_ALIASES: Record<string, string[]> = {
  "Create Unit": ["spawn", "make"], "Kill Unit": ["destroy"], "Kill Unit At Location": ["destroy"], "Remove Unit": ["delete", "vanish"], "Remove Unit At Location": ["delete"],
  "Give Units to Player": ["transfer", "ownership", "change owner"], "Display Text Message": ["print", "say", "message", "text"], "Set Resources": ["minerals", "gas", "money"],
  "Set Deaths": ["counter", "variable", "death count"], "Deaths": ["counter", "variable", "death count"], "Bring": ["at location", "in area"], "Command": ["owns", "has units", "controls"],
  "Move Unit": ["teleport"], "Move Location": ["follow", "attach"], "Set Switch": ["flag", "toggle"], "Switch": ["flag"], "Wait": ["delay", "sleep", "pause"], "Play WAV": ["sound", "audio"],
  "Center View": ["camera", "scroll"], "Set Countdown Timer": ["clock"], "Countdown Timer": ["clock"], "Elapsed Time": ["clock", "game time"], "Set Alliance Status": ["ally", "enemy", "team"],
  "Modify Unit Hit Points": ["hp", "health", "heal"], "Modify Unit Shield Points": ["shields"], "Modify Unit Energy": ["mana"], "Set Invincibility": ["invulnerable", "immortal"],
  "Run AI Script": ["ai", "computer"], "Run AI Script At Location": ["ai", "computer"], "Victory": ["win"], "Defeat": ["lose"], "Preserve Trigger": ["repeat", "loop", "again"],
  "Minimap Ping": ["alert"], "Order": ["move", "attack", "patrol", "command unit"], "Set Mission Objectives": ["objectives"], "Comment": ["title", "name", "note"],
  "Set Doodad State": ["door", "trap"], "Accumulate": ["resources", "minerals", "gas"], "Kill": ["has killed", "kills"], "Score": ["points"], "Opponents": ["players remaining", "enemies left"],
};

export function paletteItems(kind: "condition" | "action"): SearchItem<Pick>[] {
  const items: SearchItem<Pick>[] = [];
  if (kind === "condition") for (const d of CONDITION_DEFS) { if (d.type !== ConditionType.Briefing) items.push({ label: d.name, aliases: NATIVE_ALIASES[d.name], priority: 1, value: { kind: "native", type: d.type } }); }
  else for (const d of ACTION_DEFS) { if (d.type !== ActionType.None) items.push({ label: d.name, aliases: NATIVE_ALIASES[d.name], priority: 1, value: { kind: "native", type: d.type } }); }
  for (const e of entriesFor(kind)) items.push({ label: e.name, aliases: e.aliases, group: e.group, value: { kind: "eud", entry: e } });
  if (kind === "condition") {
    items.push({ label: "Compare two counters", aliases: ["greater", "less", "equal", "variable"], group: "Counters", value: { kind: "expansion", what: "compare" } });
    items.push({ label: "The chat said a command", aliases: ["chat", "typed", "command", "message", "-heal", "-set with a number", "argument"], group: "Build", value: { kind: "build", what: "chat" } });
    items.push({ label: "A player pressed a key (synced)", aliases: ["keyboard", "hotkey", "press", "input"], group: "Build", value: { kind: "build", what: "key" } });
    items.push({ label: "A player clicked (synced)", aliases: ["mouse button", "left click", "right click", "input"], group: "Build", value: { kind: "build", what: "click" } });
    items.push({ label: "A player's mouse is over a location (synced)", aliases: ["hover", "cursor", "pointer", "mouse at"], group: "Build", value: { kind: "build", what: "mouseIn" } });
    items.push({ label: "Any unit of a kind has a stat below or above", aliases: ["hp check", "low health", "any unit", "damaged", "scan", "is attacking", "under attack", "burrowed", "moving", "has a target"], group: "Build", value: { kind: "build", what: "scan" } });
  } else {
    items.push({ label: "Show text with numbers in it", aliases: ["display counter", "print score", "dynamic text", "message with value"], group: "Build", value: { kind: "build", what: "text" } });
    items.push({ label: "Multiply, divide or randomize a counter", aliases: ["times", "random", "modulo", "remainder", "maths"], group: "Build", value: { kind: "build", what: "math" } });
    items.push({ label: "For each unit of a kind", aliases: ["all units", "every unit", "loop", "set hp of all", "give units with colour", "order all", "stun", "stim", "ensnare", "plague", "lockdown", "hold fire", "no-clip", "set minerals of field"], group: "Build", value: { kind: "build", what: "foreach" } });
    items.push({ label: "The weakest, strongest or nearest unit of a kind", aliases: ["pick", "lowest hp", "closest", "nearest", "most kills", "find unit", "one unit"], group: "Build", value: { kind: "build", what: "pick" } });
    items.push({ label: "Count units into a counter", aliases: ["number of", "how many", "tally"], group: "Build", value: { kind: "build", what: "count" } });
    items.push({ label: "Read a unit's stat into a counter", aliases: ["get hp", "read health", "unit's kills", "position into"], group: "Build", value: { kind: "build", what: "read" } });
    items.push({ label: "Move a location to coordinates", aliases: ["set location", "place location", "location xy", "pixels"], group: "Build", value: { kind: "build", what: "setloc" } });
    items.push({ label: "Copy a counter into another", aliases: ["set variable", "assign", "transfer"], group: "Counters", value: { kind: "expansion", what: "copy" } });
    items.push({ label: "Add a counter to another", aliases: ["sum", "plus", "variable"], group: "Counters", value: { kind: "expansion", what: "add" } });
    items.push({ label: "Subtract a counter from another", aliases: ["minus", "difference", "variable"], group: "Counters", value: { kind: "expansion", what: "subtract" } });
  }
  return items;
}

/** What the row hands back: the pick, and what the query named for its chips. */
export interface Picked {
  pick: Pick;
  entities: Entity[];
  query: string;
}

/** The add row's element; `onPick` inserts. `names` lets the query carry arguments ("marine hp 80"). */
export function addRow(api: PluginApi, kind: "condition" | "action", onPick: (picked: Picked) => void, options: { recent?: (pick: Pick) => number; names?: () => ParseNames } = {}): HTMLElement {
  const el = api.ui.el;
  const items = paletteItems(kind);
  let entities: Entity[] = [];
  const input = el("input", { className: "input", type: "text", placeholder: kind === "condition" ? api.i18n.t("Add a condition…") : api.i18n.t("Add an action…") }) as HTMLInputElement;
  let pop: PopoverHandle | null = null;
  let active = 0;
  let hits: SearchItem<Pick>[] = [];
  const close = () => { pop?.close(); pop = null; };
  const choose = (item: SearchItem<Pick>) => { const query = input.value; onPick({ pick: item.value, entities, query }); input.value = ""; entities = []; close(); input.focus(); };
  const render = () => {
    const browsing = !input.value.trim();
    let query = input.value;
    entities = [];
    if (!browsing && options.names) {
      const parsed = parseQuery(input.value, options.names());
      entities = parsed.entities;
      // With everything named taken out, what is left finds the row; a query that is all names browses.
      if (parsed.rest) query = parsed.rest;
    }
    hits = browsing ? items : search(items, query, { limit: 14, recent: options.recent }).map((h) => h.item);
    if (!hits.length) { close(); return; }
    active = 0;
    if (!pop) {
      pop = openPopover(input, (h) => { const list = el("div", { className: "mg-options" }); h.root.dataset.role = "hits"; return list; }, { width: Math.max(260, input.offsetWidth), returnFocus: false, onClose: () => { pop = null; } });
    }
    const list = pop.root.querySelector(".mg-options")!;
    let lastGroup: string | null = null;
    list.replaceChildren(...hits.flatMap((item, i) => {
      const eud = item.value.kind === "eud";
      const rows: HTMLElement[] = [];
      if (browsing) {
        const group = eud ? `EUD · ${item.group}` : item.value.kind === "expansion" ? api.i18n.t("Counters") : item.value.kind === "build" ? api.i18n.t("Needs a build") : kind === "condition" ? api.i18n.t("Conditions") : api.i18n.t("Actions");
        if (group !== lastGroup) { lastGroup = group; rows.push(el("div", { className: "mg-option group" }, group)); }
      }
      const named = entities.length ? entities.map((e) => e.text).join(" · ") : "";
      const row = el("button", { type: "button", className: `mg-option${i === active ? " active" : ""}`, title: eud ? (item.value as { entry: Entry }).entry.note ?? "" : "" },
        el("span", { className: "grow" }, item.label, named ? el("span", { className: "hint" }, `  ${named}`) : null),
        el("span", { className: `mg-hit-group${eud ? " eud" : ""}` }, eud ? `EUD · ${item.group}` : item.value.kind === "expansion" ? api.i18n.t("Counters") : item.value.kind === "build" ? api.i18n.t("Build") : ""),
      ) as HTMLButtonElement;
      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("click", () => choose(item));
      rows.push(row);
      return rows;
    }));
  };
  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("click", () => { if (!pop) render(); });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!pop) { render(); return; }
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
      pop.root.querySelectorAll(".mg-option:not(.group)").forEach((r, i) => r.classList.toggle("active", i === active));
      (pop.root.querySelectorAll(".mg-option:not(.group)")[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!pop) render();
      if (hits[active]) choose(hits[active]);
    } else if (e.key === "Escape" && pop) { e.stopPropagation(); close(); }
  });
  return el("div", { className: "mg-add" }, input);
}
