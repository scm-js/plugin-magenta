/**
 * The catalogue as loaded: addresses parsed, entries by id, and the questions the rest
 * of the plugin asks of an entry (is it enumerated, what slots does its sentence have).
 */
import raw from "./eud.json";
import type { AddressJson, Entry, EntryAddress, EntryJson, EntryKind } from "./types";

export type { Entry, EntryArg, EntryArgKind, EntryKind, EntryPart, Lookup, ValueSpec } from "./types";

const address = (json: AddressJson): EntryAddress => ({ base: Number(json.base), terms: json.terms });

function load(json: EntryJson): Entry {
  return { ...json, address: address(json.address), parts: json.parts?.map((p) => ({ ...p, address: address(p.address) })) };
}

export const GROUPS: readonly string[] = (raw as { groups: string[] }).groups;
export const ENTRIES: readonly Entry[] = (raw as { entries: EntryJson[] }).entries.map(load);
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

export const entry = (id: string): Entry | undefined => BY_ID.get(id);

/** Whether the entry can be used as this kind of record. */
export const offers = (e: Entry, kind: "condition" | "action"): boolean => e.kind === "both" || e.kind === kind;

/** The value is a choice, an id, a bit or a set-only number: no modifier or comparison chip, Set To / Exactly always. */
export const enumerated = (e: Entry): boolean => !!(e.value?.choices || e.value?.kind || e.value?.setOnly || e.width === "bit");

/** The entry writes several records at once. */
export const grouped = (e: Entry): boolean => !!e.parts?.length;

/** The entry needs a table from the game data (a unit's flingy) to find its address or store its value. */
export const needsLookup = (e: Entry): boolean => !!(e.value?.via || e.address.terms?.some((t) => t.via) || e.parts?.some((p) => p.address.terms?.some((t) => t.via)));

/** The entries usable as a condition or an action, in catalogue order. */
export function entriesFor(kind: "condition" | "action"): Entry[] {
  return ENTRIES.filter((e) => offers(e, kind));
}

export function kindLabel(kind: EntryKind): string {
  return kind === "both" ? "condition and action" : kind;
}

/** The three races the supply tables are kept by. */
export const RACES: { value: number; label: string }[] = [{ value: 0, label: "Zerg" }, { value: 1, label: "Terran" }, { value: 2, label: "Protoss" }];
