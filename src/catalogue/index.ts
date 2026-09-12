/**
 * The catalogue as loaded: addresses parsed, entries by id, and the questions the rest
 * of the plugin asks of an entry (is it enumerated, what slots does its sentence have).
 */
import raw from "./eud.json";
import type { Entry, EntryJson, EntryKind } from "./types";

export type { Entry, EntryArg, EntryArgKind, EntryKind, ValueSpec } from "./types";

function load(json: EntryJson): Entry {
  return { ...json, address: { base: Number(json.address.base), terms: json.address.terms } };
}

export const GROUPS: readonly string[] = (raw as { groups: string[] }).groups;
export const ENTRIES: readonly Entry[] = (raw as { entries: EntryJson[] }).entries.map(load);
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

export const entry = (id: string): Entry | undefined => BY_ID.get(id);

/** Whether the entry can be used as this kind of record. */
export const offers = (e: Entry, kind: "condition" | "action"): boolean => e.kind === "both" || e.kind === kind;

/** The value is a choice, an id or a bit rather than a number: no modifier or comparison chip, Set To / Exactly always. */
export const enumerated = (e: Entry): boolean => !!(e.value?.choices || e.value?.kind || e.width === "bit");

/** The entries usable as a condition or an action, in catalogue order. */
export function entriesFor(kind: "condition" | "action"): Entry[] {
  return ENTRIES.filter((e) => offers(e, kind));
}

export function kindLabel(kind: EntryKind): string {
  return kind === "both" ? "condition and action" : kind;
}
