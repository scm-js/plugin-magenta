/**
 * The shape of `eud.json`: one entry per EUD condition or action Magenta offers as if it
 * were the game's own. An entry names a memory address by a base and the arguments that
 * index into it (`terms`), how wide the field is, how the stored number relates to the
 * one the map maker types (`scale`), and whether StarCraft: Remastered lets a trigger
 * read and write it. `lower.ts` turns an entry and its arguments into a Deaths or Set
 * Deaths record; `recognize.ts` goes the other way.
 */

export type EntryKind = "condition" | "action" | "both";

/** The kinds an entry's index argument can take; each has a chip of its own in the UI. */
export type EntryArgKind = "unit" | "weapon" | "upgrade" | "tech" | "player" | "unitIndex" | "key" | "number" | "race";

/** A table the game data supplies at run time: the argument's value goes through it before the stride. */
export type Lookup = "flingy";

export interface EntryArg {
  /** The slot name in the sentence: `{unit}`. */
  name: string;
  kind: EntryArgKind;
  label: string;
  /** One past the highest value (228 unit ids, 130 weapons, 12 players, 1700 unit slots). */
  max: number;
}

export interface AddressTerm {
  /** The argument whose value multiplies `stride`. */
  arg: string;
  stride: number;
  /** The argument names a unit type, but the table is indexed by its flingy: `units.dat` maps one to the other. */
  via?: Lookup;
}

export interface EntryAddress {
  /** Hex string in the JSON (`"0x662350"`), a number once loaded. */
  base: number;
  terms?: AddressTerm[];
}

/** What the map maker types for the value, and how the record stores it. */
export interface ValueSpec {
  /** Stored = typed × scale; 256 for hit points. 1 when omitted. */
  scale?: number;
  /** A word after the number: `HP`, `s`, `tiles`. */
  unit?: string;
  /** The value is one of these rather than a number. */
  choices?: { value: number; label: string }[];
  /** The value is an id of this kind (a weapon, a unit type, a player) rather than a number, or one of the map's strings. */
  kind?: "unit" | "weapon" | "player" | "string";
  /** A unit-type value stored as the unit's flingy id (`units.dat` maps one to the other). */
  via?: Lookup;
  /** A number the row only ever sets (no add or subtract): the other parts of a grouped entry are derived from the whole value. */
  setOnly?: boolean;
  min?: number;
  max?: number;
}

/**
 * One record of a grouped entry: an action that has to write several addresses at once
 * (a unit type's speed is four fields of flingy.dat). `value` holds the row's number;
 * `const` a fixed byte; any other role a number derived from the row's value in `eud.ts`.
 */
export interface EntryPart {
  role: "value" | "const" | "acceleration" | "halt";
  const?: number;
  address: EntryAddress;
  width: 1 | 2 | 4;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  /** The palette's category: `Units`, `Weapons`, `Players`, `Game`, `Placed units`. */
  group: string;
  /** The short name the palette shows and searches. */
  name: string;
  aliases?: string[];
  /** Templates with `{argName}`, `{value}` and, for a condition, `{cmp}` or, for an action, `{mod}`. */
  sentence: { condition?: string; action?: string };
  args: EntryArg[];
  /** For a grouped entry, the `value` part's address. */
  address: EntryAddress;
  /** Bytes; `"bit"` for one bit of a dword, at `bit` (a number) or the value of an argument. */
  width: 1 | 2 | 4 | "bit";
  /** A grouped entry: one row, these records in this order (actions only). */
  parts?: EntryPart[];
  bit?: number | { arg: string };
  value?: ValueSpec;
  remastered: { read: boolean; write: boolean };
  /** The value is each computer's own (the keyboard, the mouse, the local player): a trigger that reads it and changes the game can put the players out of sync. */
  local?: boolean;
  /** Where the address came from. */
  source: string;
  /** Anything the hover should say — what is unverified, what the number means. */
  note?: string;
  /** Played and seen working in StarCraft: Remastered. */
  verified?: boolean;
}

/** The JSON as it is on disk (addresses as hex strings). */
export type AddressJson = { base: string; terms?: AddressTerm[] };
export type EntryJson = Omit<Entry, "address" | "parts"> & { address: AddressJson; parts?: (Omit<EntryPart, "address"> & { address: AddressJson })[] };
