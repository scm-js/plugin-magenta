/**
 * Arguments typed into the add row: "marine hp 80", "give 3 zealots to player 2 at beacon".
 * The map's names (units, locations, switches, weapons, upgrades, techs), the player
 * groups, numbers, comparison and modifier words are picked out of the query, what is
 * left finds the condition, action or catalogue entry, and the entities fill its
 * arguments in order of kind — a unit chip takes the first unit named, a location chip
 * the first location, a number chip the first number.
 */
import { Comparison, SetModifier } from "../../vendor/triggers";
import type { ActionRecord, ConditionRecord } from "../../vendor/triggers";
import { actionDef, conditionDef, type ArgKind } from "../../vendor/triggerDefs";
import type { Entry } from "../catalogue";
import { enumerated } from "../catalogue";
import { lowerAction, lowerActions, lowerCondition, type EudRow } from "./eud";
import { KEYS } from "./eudSentence";

export interface Named {
  value: number;
  label: string;
  aliases?: string[];
}

export interface ParseNames {
  units: Named[];
  locations: Named[];
  switches?: Named[];
  weapons?: Named[];
  upgrades?: Named[];
  techs?: Named[];
  /** The 27 player groups, and any names the map gives its players. */
  players: Named[];
}

export type EntityKind = "unit" | "location" | "player" | "number" | "switch" | "weapon" | "upgrade" | "tech" | "key" | "comparison" | "modifier";

export interface Entity {
  kind: EntityKind;
  value: number;
  /** The words matched, as typed. */
  text: string;
  start: number;
  end: number;
  /** The little word before it — "to player 2", "from player 1", "at beacon" — which says which chip it is for. */
  prep?: string;
}

export interface Parsed {
  /** The query with the entities taken out — what finds the item. */
  rest: string;
  entities: Entity[];
}

const RACES = ["terran ", "zerg ", "protoss "];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Spellings a name answers to: the whole name, the name without its race, and their plurals. */
function spellings(label: string, aliases: string[] = []): string[] {
  const out = new Set<string>();
  const add = (s: string) => { const n = norm(s); if (n) { out.add(n); out.add(`${n}s`); if (n.endsWith("s")) out.add(n.slice(0, -1)); } };
  add(label);
  for (const r of RACES) if (label.toLowerCase().startsWith(r)) add(label.slice(r.length));
  // "Siege Tank (Tank Mode)" → "siege tank".
  add(label.replace(/\s*\(.*\)\s*/g, " "));
  for (const a of aliases) add(a);
  return [...out].filter((s) => s.length >= 2);
}

interface Candidate { kind: EntityKind; value: number; spelling: string }

function candidates(names: ParseNames): Candidate[] {
  const out: Candidate[] = [];
  const push = (kind: EntityKind, list: Named[] | undefined) => { for (const n of list ?? []) for (const s of spellings(n.label, n.aliases)) out.push({ kind, value: n.value, spelling: s }); };
  push("unit", names.units);
  push("location", names.locations);
  push("switch", names.switches);
  push("weapon", names.weapons);
  push("upgrade", names.upgrades);
  push("tech", names.techs);
  push("player", names.players);
  for (const k of KEYS) { out.push({ kind: "key", value: k.code, spelling: `${k.label.toLowerCase()} key` }); out.push({ kind: "key", value: k.code, spelling: `key ${k.label.toLowerCase()}` }); }
  // Longest spelling first, so "high templar" beats "templar"; on a tie the map's own names
  // (a location called Beacon) beat the game's (the Zerg Beacon unit), and a spell's name is
  // the technology before the weapon of the same name ("lockdown energy" is the research's cost).
  const rank: Record<EntityKind, number> = { location: 0, switch: 1, player: 2, tech: 3, upgrade: 4, weapon: 5, key: 6, unit: 7, number: 8, comparison: 9, modifier: 10 };
  out.sort((a, b) => b.spelling.length - a.spelling.length || rank[a.kind] - rank[b.kind]);
  return out;
}

const WORDS: [RegExp, EntityKind, number][] = [
  [/\b(at least|atleast)\b/, "comparison", Comparison.AtLeast],
  [/\b(at most|atmost)\b/, "comparison", Comparison.AtMost],
  [/\b(exactly|equal to|equals)\b/, "comparison", Comparison.Exactly],
  [/\b(up by|increase|add|plus)\b/, "modifier", SetModifier.Add],
  [/\b(down by|decrease|subtract|minus)\b/, "modifier", SetModifier.Subtract],
  [/\b(set to|setto|to)\b/, "modifier", SetModifier.SetTo],
];

/** Pick the entities out of a query. */
export function parseQuery(query: string, names: ParseNames): Parsed {
  const q = norm(query);
  const taken: boolean[] = Array.from({ length: q.length }, () => false);
  const entities: Entity[] = [];
  const claim = (start: number, end: number, kind: EntityKind, value: number) => {
    for (let i = start; i < end; i++) if (taken[i]) return false;
    for (let i = start; i < end; i++) taken[i] = true;
    entities.push({ kind, value, text: q.slice(start, end), start, end });
    return true;
  };
  const atWord = (start: number, end: number) => (start === 0 || q[start - 1] === " ") && (end === q.length || q[end] === " ");
  // Player references by number: "player 2", "p2".
  for (const m of q.matchAll(/\b(?:player|p)\s?(\d{1,2})\b/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 12) claim(m.index!, m.index! + m[0].length, "player", n - 1);
  }
  for (const c of candidates(names)) {
    let from = 0;
    while (from <= q.length) {
      const at = q.indexOf(c.spelling, from);
      if (at < 0) break;
      const end = at + c.spelling.length;
      if (atWord(at, end)) claim(at, end, c.kind, c.value);
      from = at + 1;
    }
  }
  for (const [re, kind, value] of WORDS) {
    const m = re.exec(q);
    if (m && m.index !== undefined) claim(m.index, m.index + m[0].length, kind, value);
  }
  for (const m of q.matchAll(/\b\d+(?:\.\d+)?\b/g)) claim(m.index!, m.index! + m[0].length, "number", Number(m[0]));
  entities.sort((a, b) => a.start - b.start);
  for (const e of entities) {
    const before = q.slice(0, e.start).trimEnd();
    const m = /(?:^|\s)(owned by|to|from|for|at|in|into|of|by)$/.exec(before);
    if (m) e.prep = m[1];
  }
  // What is left, minus little words that only joined the entities.
  let rest = "";
  for (let i = 0; i < q.length; i++) rest += taken[i] ? " " : q[i];
  rest = rest.replace(/\b(a|an|the|of|for|at|in|on|from|with|and|is|has|to|by)\b/g, " ").replace(/\s+/g, " ").trim();
  return { rest, entities };
}

/** The entities of one kind, in order, handed out one at a time; a preposition can ask for a particular one first. */
function taker(entities: Entity[]) {
  const used = new Set<Entity>();
  return (kinds: EntityKind[], preps: string[] = []): Entity | undefined => {
    const e = (preps.length ? entities.find((x) => !used.has(x) && kinds.includes(x.kind) && x.prep !== undefined && preps.includes(x.prep)) : undefined)
      ?? entities.find((x) => !used.has(x) && kinds.includes(x.kind) && (!preps.length || x.prep === undefined || !CLAIMING_PREPS.has(x.prep)));
    if (e) used.add(e);
    return e;
  };
}

/** Prepositions that mark an entity as some other chip's ("to player 2" is not the From player). */
const CLAIMING_PREPS = new Set(["to", "from", "owned by", "into"]);

/** Which prepositions name a native argument, by its label. */
function prepsFor(label: string): string[] {
  switch (label) {
    case "To": case "Move": return ["to", "into"];
    case "From": return ["from", "owned by", "of"];
    case "Unit at": return ["at"];
    default: return [];
  }
}

/** Which entity kinds can fill a native argument kind. */
function kindsFor(arg: ArgKind): EntityKind[] {
  switch (arg) {
    case "player": return ["player"];
    case "unit": return ["unit"];
    case "location": return ["location"];
    case "switch": return ["switch", "number"];
    case "comparison": return ["comparison"];
    case "modifier": return ["modifier"];
    case "amount": case "number": case "count": case "duration": case "percent": return ["number"];
    default: return [];
  }
}

/** A native condition filled from the entities; the record is StarEdit's default where nothing was named. */
export function fillCondition(record: ConditionRecord, entities: Entity[]): ConditionRecord {
  const def = conditionDef(record.type);
  if (!def) return record;
  const take = taker(entities);
  const out = { ...record };
  for (const arg of def.args) {
    const e = take(kindsFor(arg.kind), prepsFor(arg.label));
    if (!e) continue;
    let value = e.value;
    if (arg.kind === "switch" && e.kind === "number") value = Math.max(0, Math.min(255, value - 1));
    (out as Record<string, number>)[arg.field] = value;
  }
  return out;
}

export function fillAction(record: ActionRecord, entities: Entity[]): ActionRecord {
  const def = actionDef(record.type);
  if (!def) return record;
  const take = taker(entities);
  const out = { ...record };
  // "give 3 zealots to player 2": the player after "to" is the To chip, whatever order the chips come in.
  for (const arg of def.args) {
    const e = take(kindsFor(arg.kind), prepsFor(arg.label));
    if (!e) continue;
    let value = e.value;
    if (arg.kind === "switch" && e.kind === "number") value = Math.max(0, Math.min(255, value - 1));
    (out as Record<string, number>)[arg.field] = value;
  }
  return out;
}

/** A catalogue row filled from the entities: its index arguments by kind, the value from a number or a choice word, the op from a word. */
export function fillEud(entry: Entry, kind: "condition" | "action", entities: Entity[], query: string): EudRow {
  const take = taker(entities);
  const args: Record<string, number> = {};
  const q = norm(query);
  for (const a of entry.args) {
    if (a.kind === "race") { args[a.name] = /\bzerg\b/.test(q) ? 0 : /\bprotoss\b/.test(q) ? 2 : 1; continue; }
    const e = take(a.kind === "unit" ? ["unit"] : a.kind === "player" ? ["player"] : a.kind === "weapon" ? ["weapon"] : a.kind === "upgrade" ? ["upgrade"] : a.kind === "tech" ? ["tech"] : a.kind === "key" ? ["key"] : ["number"]);
    args[a.name] = e ? e.value : 0;
  }
  let value = entry.value?.choices ? entry.value.choices[0].value : entry.value?.min ?? 0;
  if (entry.value?.choices) {
    // The longest label that appears wins: "not a detector" over "a detector".
    const hits = entry.value.choices.filter((c) => new RegExp(`\\b${norm(c.label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q));
    const hit = hits.sort((a, b) => b.label.length - a.label.length)[0];
    if (hit) value = hit.value;
  } else if (entry.value?.kind === "unit") { const e = take(["unit"]); if (e) value = e.value; }
  else if (entry.value?.kind === "player") { const e = take(["player"]); if (e) value = e.value; }
  else if (entry.value?.kind === "weapon") { const e = take(["weapon"]); if (e) value = e.value; }
  else { const e = take(["number"]); if (e) value = e.value; }
  const opWord = take([kind === "condition" ? "comparison" : "modifier"]);
  const op = enumerated(entry) ? (kind === "condition" ? Comparison.Exactly : SetModifier.SetTo) : opWord ? opWord.value : kind === "condition" ? Comparison.AtLeast : SetModifier.SetTo;
  return { entry, args, value, op };
}

export const fillEudCondition = (entry: Entry, entities: Entity[], query: string): ConditionRecord => lowerCondition(fillEud(entry, "condition", entities, query));
export const fillEudAction = (entry: Entry, entities: Entity[], query: string): ActionRecord => lowerAction(fillEud(entry, "action", entities, query));
/** Every record the filled row writes: one, or a grouped entry's parts. */
export const fillEudActions = (entry: Entry, entities: Entity[], query: string): ActionRecord[] => lowerActions(fillEud(entry, "action", entities, query));
