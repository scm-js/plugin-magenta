/**
 * The add row: an input that searches everything a trigger can hold — the native
 * conditions or actions, and the catalogue — and inserts the pick.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { ACTION_DEFS, CONDITION_DEFS } from "../../vendor/triggerDefs";
import { ConditionType, ActionType } from "../../vendor/triggers";
import { entriesFor, RACES, type Entry } from "../catalogue";
import { available } from "../model/eud";
import { search, type SearchItem } from "../model/search";
import { parseQuery, type Entity, type ParseNames } from "../model/parse";
import { openPopover, type PopoverHandle } from "./popover";
import { ACTION_TEMPLATES, CONDITION_TEMPLATES } from "../model/sentences";
import { msg, translate } from "../i18n";

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

/** A template's words without its placeholders. */
const wordsOf = (template: string): string => template.replace(/\{[^}]+\}/g, " ").replace(/\s+/g, " ").trim();

/** The same text in the editor's language, when it has one: a query in either language finds the row. */
const both = (english: string): string[] => { const shown = translate(english); return shown === english ? [english] : [english, shown]; };

function entryAliases(e: Entry, kind: "condition" | "action"): string[] {
  const sentence = (kind === "condition" ? e.sentence.condition : e.sentence.action) ?? "";
  const shown = translate(e.name);
  return [
    ...(e.aliases ?? []), ...(shown !== e.name ? [e.name] : []), ...(sentence ? both(sentence).map(wordsOf) : []),
    ...(e.value?.choices?.flatMap((c) => both(c.label)) ?? []), ...(e.args.some((a) => a.kind === "race") ? RACES.flatMap((r) => both(r.label)) : []),
  ];
}

/** The English label as a search word, when the label shows in another language. */
const english = (label: string): string[] => (translate(label) === label ? [] : [label]);

/** A native condition's or action's search words: its name's aliases, and its sentence in the editor's language (the name itself is the game's, and stays English). */
function nativeAliases(name: string, template: string | undefined): string[] | undefined {
  const shown = template ? translate(template) : "";
  const extra = shown && shown !== template ? [wordsOf(shown)] : [];
  const list = [...(NATIVE_ALIASES[name] ?? []), ...extra];
  return list.length ? list : undefined;
}

/** Magenta's own rows, in English here and shown in the editor's language. */
const OWN_LABELS = {
  compare: msg("Compare two counters"), chat: msg("The chat said a command"), key: msg("A player pressed a key (synced)"), click: msg("A player clicked (synced)"),
  mouseIn: msg("A player's mouse is over a location (synced)"), scan: msg("Any unit of a kind has a stat below or above"),
  text: msg("Show text with numbers in it"), math: msg("Multiply, divide or randomize a counter"), foreach: msg("For each unit of a kind"),
  pick: msg("The weakest, strongest, nearest or a random unit of a kind"), count: msg("Count units into a counter"), read: msg("Read a unit's stat into a counter"),
  setloc: msg("Move a location to coordinates or by an offset"), copy: msg("Copy a counter into another"), add: msg("Add a counter to another"), subtract: msg("Subtract a counter from another"),
};
const COUNTERS = msg("Counters");
const BUILD = msg("Build");

export function paletteItems(kind: "condition" | "action"): SearchItem<Pick>[] {
  const items: SearchItem<Pick>[] = [];
  if (kind === "condition") for (const d of CONDITION_DEFS) { if (d.type !== ConditionType.Briefing) items.push({ label: d.name, aliases: nativeAliases(d.name, CONDITION_TEMPLATES[d.type]), priority: 1, value: { kind: "native", type: d.type } }); }
  else for (const d of ACTION_DEFS) { if (d.type !== ActionType.None) items.push({ label: d.name, aliases: nativeAliases(d.name, ACTION_TEMPLATES[d.type]), priority: 1, value: { kind: "native", type: d.type } }); }
  // An entry that goes through the game data's tables is offered once they are loaded. Its sentence's
  // words, its choices and its race argument search too, so "make marine a detector", "colour yellow"
  // and "terran supply cap" find their rows with the words a map maker would type.
  for (const e of entriesFor(kind)) if (available(e)) items.push({ label: translate(e.name), aliases: entryAliases(e, kind), group: translate(e.group), value: { kind: "eud", entry: e } });
  if (kind === "condition") {
    items.push({ label: translate(OWN_LABELS.compare), aliases: ["greater", "less", "equal", "variable", ...english(OWN_LABELS.compare)], group: translate(COUNTERS), value: { kind: "expansion", what: "compare" } });
    items.push({ label: translate(OWN_LABELS.chat), aliases: ["chat", "typed", "command", "message", "-heal", "-set with a number", "argument", ...english(OWN_LABELS.chat)], group: translate(BUILD), value: { kind: "build", what: "chat" } });
    items.push({ label: translate(OWN_LABELS.key), aliases: ["keyboard", "hotkey", "press", "input", ...english(OWN_LABELS.key)], group: translate(BUILD), value: { kind: "build", what: "key" } });
    items.push({ label: translate(OWN_LABELS.click), aliases: ["mouse button", "left click", "right click", "input", ...english(OWN_LABELS.click)], group: translate(BUILD), value: { kind: "build", what: "click" } });
    items.push({ label: translate(OWN_LABELS.mouseIn), aliases: ["hover", "cursor", "pointer", "mouse at", ...english(OWN_LABELS.mouseIn)], group: translate(BUILD), value: { kind: "build", what: "mouseIn" } });
    items.push({ label: translate(OWN_LABELS.scan), aliases: ["hp check", "low health", "any unit", "damaged", "scan", "is attacking", "under attack", "burrowed", "moving", "has a target", "percent", "below 30%", "hp %", ...english(OWN_LABELS.scan)], group: translate(BUILD), value: { kind: "build", what: "scan" } });
  } else {
    items.push({ label: translate(OWN_LABELS.text), aliases: ["display counter", "print score", "dynamic text", "message with value", ...english(OWN_LABELS.text)], group: translate(BUILD), value: { kind: "build", what: "text" } });
    items.push({ label: translate(OWN_LABELS.math), aliases: ["times", "random", "modulo", "remainder", "maths", ...english(OWN_LABELS.math)], group: translate(BUILD), value: { kind: "build", what: "math" } });
    items.push({ label: translate(OWN_LABELS.foreach), aliases: ["all units", "every unit", "loop", "set hp of all", "give units with colour", "order all", "stun", "stim", "ensnare", "plague", "lockdown", "hold fire", "no-clip", "set minerals of field", "damage", "heal", "drain", "take hit points", "restore shields", "damage zone", ...english(OWN_LABELS.foreach)], group: translate(BUILD), value: { kind: "build", what: "foreach" } });
    items.push({ label: translate(OWN_LABELS.pick), aliases: ["pick", "lowest hp", "closest", "nearest", "most kills", "find unit", "one unit", "random unit", "lottery", "under the mouse", "clicked unit", "unit at the cursor", ...english(OWN_LABELS.pick)], group: translate(BUILD), value: { kind: "build", what: "pick" } });
    items.push({ label: translate(OWN_LABELS.count), aliases: ["number of", "how many", "tally", ...english(OWN_LABELS.count)], group: translate(BUILD), value: { kind: "build", what: "count" } });
    items.push({ label: translate(OWN_LABELS.read), aliases: ["get hp", "read health", "unit's kills", "position into", "what unit is at", "unit type at", "owner of", ...english(OWN_LABELS.read)], group: translate(BUILD), value: { kind: "build", what: "read" } });
    items.push({ label: translate(OWN_LABELS.setloc), aliases: ["set location", "place location", "location xy", "pixels", "move by", "shift location", "slide", "scroll location", ...english(OWN_LABELS.setloc)], group: translate(BUILD), value: { kind: "build", what: "setloc" } });
    items.push({ label: translate(OWN_LABELS.copy), aliases: ["set variable", "assign", "transfer", ...english(OWN_LABELS.copy)], group: translate(COUNTERS), value: { kind: "expansion", what: "copy" } });
    items.push({ label: translate(OWN_LABELS.add), aliases: ["sum", "plus", "variable", ...english(OWN_LABELS.add)], group: translate(COUNTERS), value: { kind: "expansion", what: "add" } });
    items.push({ label: translate(OWN_LABELS.subtract), aliases: ["minus", "difference", "variable", ...english(OWN_LABELS.subtract)], group: translate(COUNTERS), value: { kind: "expansion", what: "subtract" } });
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
    // A weapon, upgrade, technology or key named in the query points at the rows that take one: "lockdown energy" is the technology's energy cost, not a placed unit's.
    const named = new Set(entities.map((e) => e.kind));
    const prefer = (v: Pick) => (v.kind === "eud" ? v.entry.args.filter((a) => (a.kind === "weapon" || a.kind === "upgrade" || a.kind === "tech" || a.kind === "key") && named.has(a.kind)).length * 12 : 0);
    hits = browsing ? items : search(items, query, { limit: 14, recent: options.recent, prefer }).map((h) => h.item);
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
