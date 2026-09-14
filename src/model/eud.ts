/**
 * EUD arithmetic: the deaths table, the player value that reaches an address (EPD), the
 * masked records Remastered added, and lowering a catalogue entry to a record and
 * recognising a record as an entry.
 *
 * A Deaths condition or Set Deaths action reads or writes
 * `DEATHS_TABLE + player × 4 + unit × 48`. With a player past the 27 groups that is an
 * arbitrary address, dword-aligned. Remastered's masked form puts a bitmask in the
 * record's location field and `MASK_MARKER` in its trailing mask word; the game then
 * compares or writes only the bits under the mask, which is how a byte, a word or one
 * bit is reached. 1.16.1 ignores the marker, so masked records are Remastered-only.
 *
 * Two entries need more than arithmetic. A *grouped* entry (`parts`) is one row that
 * writes several records in a row — a unit type's speed is four fields of flingy.dat —
 * and is recognised only when all of them stand together. A *via* term or value goes
 * through a table the game data supplies at run time (`setGameLookup`): the flingy
 * tables are indexed by flingy id, and units.dat says which flingy a unit type uses.
 */
import { ActionType, Comparison, ConditionType, PLAYER_GROUP_COUNT, SetModifier, emptyAction, emptyCondition, type ActionRecord, type ConditionRecord } from "../../vendor/triggers";
import { ENTRIES, enumerated, grouped, needsLookup, offers, type Entry, type EntryPart } from "../catalogue";
import type { EntryAddress } from "../catalogue/types";

export const DEATHS_TABLE = 0x58a364;
/** The trailing word of a masked condition or action (`"SC"`). */
export const MASK_MARKER = 0x4353;
/** The unit stride of the deaths table in bytes: 12 players × 4. */
const UNIT_STRIDE = 48;

/** The player value that reaches `address` (dword-aligned) through the deaths table. */
export const epd = (address: number): number => (((address & ~3) - DEATHS_TABLE) / 4) >>> 0;
/** The address a (player, unit) pair reaches. */
export const addressOf = (player: number, unit = 0): number => (DEATHS_TABLE + player * 4 + unit * UNIT_STRIDE) >>> 0;
/** Whether a record's player field is an address rather than a player group. */
export const isEud = (player: number): boolean => player >= PLAYER_GROUP_COUNT;

/* ── The game data's tables ── */

export interface GameLookup {
  /** The flingy a unit type moves as, or null past the table. */
  flingy(unit: number): number | null;
  /** The unit types that move as a flingy, lowest id first. */
  unitsOfFlingy(flingy: number): number[];
}

let lookup: GameLookup | null = null;

/** Install the game data's tables (units.dat's flingy column); null takes them away again. */
export function setGameLookup(next: GameLookup | null): void {
  lookup = next;
}

/** A lookup over units.dat's flingy column, as the game data or a test supplies it. */
export function lookupOver(flingyOfUnit: ArrayLike<number>): GameLookup {
  const byFlingy = new Map<number, number[]>();
  for (let u = 0; u < flingyOfUnit.length; u++) { const f = flingyOfUnit[u]; (byFlingy.get(f) ?? byFlingy.set(f, []).get(f)!).push(u); }
  return { flingy: (u) => (u < flingyOfUnit.length ? flingyOfUnit[u] : null), unitsOfFlingy: (f) => byFlingy.get(f) ?? [] };
}

/** Whether an entry can be lowered and recognised now: its tables are in, or it needs none. */
export const available = (entry: Entry): boolean => !needsLookup(entry) || lookup !== null;

export type EntryArgs = Record<string, number>;

/** One catalogue entry with its arguments filled in: what a row holds and a chip edits. */
export interface EudRow {
  entry: Entry;
  args: EntryArgs;
  /** As typed: hit points, seconds, a choice's value, a string index. */
  value: number;
  /** `Comparison` for a condition, `SetModifier` for an action. */
  op: number;
}

/** The byte address an address spec and the arguments name; a via term goes through the game data (0 when it is not loaded). */
function addressAt(spec: EntryAddress, args: EntryArgs): number {
  let address = spec.base;
  for (const term of spec.terms ?? []) {
    const v = args[term.arg] ?? 0;
    address += (term.via ? lookup?.flingy(v) ?? 0 : v) * term.stride;
  }
  return address >>> 0;
}

/** The byte address an entry and its arguments name. */
export const entryAddress = (entry: Entry, args: EntryArgs): number => addressAt(entry.address, args);

/** Where a field sits in its dword: the bit offset and the mask, or null for a whole dword. */
function maskAt(address: number, width: 1 | 2 | 4 | "bit", bit: number): { shift: number; mask: number } | null {
  if (width === "bit") return { shift: bit, mask: (1 << bit) >>> 0 };
  if (width === 4) return null;
  const shift = (address & 3) * 8;
  const mask = (((1 << (width * 8)) - 1) << shift) >>> 0;
  return { shift, mask };
}

export function fieldMask(entry: Entry, args: EntryArgs): { shift: number; mask: number } | null {
  const bit = typeof entry.bit === "number" ? entry.bit : (args[entry.bit?.arg ?? ""] ?? 0);
  return maskAt(entryAddress(entry, args), entry.width, bit);
}

export const scaleOf = (entry: Entry): number => entry.value?.scale ?? 1;

/** The number the record holds for a typed value: scaled, or the unit's flingy for a via value. */
function rawValue(entry: Entry, value: number): number {
  if (entry.value?.via) return lookup?.flingy(value) ?? 0;
  return Math.round(value * scaleOf(entry));
}

/** The stored number for a typed value: scaled, and shifted under the mask. */
function stored(entry: Entry, args: EntryArgs, value: number): number {
  const raw = rawValue(entry, value);
  const fm = fieldMask(entry, args);
  if (!fm) return raw >>> 0;
  return ((raw << fm.shift) & fm.mask) >>> 0;
}

/** The typed value for a raw number: unscaled, or the first unit type that moves as the flingy. */
function typedValue(entry: Entry, raw: number): number {
  if (entry.value?.via) return lookup?.unitsOfFlingy(raw)[0] ?? 0;
  return raw / scaleOf(entry);
}

export function lowerCondition(row: EudRow): ConditionRecord {
  const { entry, args } = row;
  const fm = fieldMask(entry, args);
  return {
    ...emptyCondition(),
    type: ConditionType.Deaths,
    player: epd(entryAddress(entry, args)),
    unitId: 0,
    comparison: enumerated(entry) ? Comparison.Exactly : row.op,
    amount: stored(entry, args, row.value),
    location: fm ? fm.mask : 0,
    mask: fm ? MASK_MARKER : 0,
  };
}

/** The action for a plain entry; for a grouped one, its `value` part alone — `lowerActions` gives the whole group. */
export function lowerAction(row: EudRow): ActionRecord {
  const { entry, args } = row;
  const fm = fieldMask(entry, args);
  return {
    ...emptyAction(),
    type: ActionType.SetDeaths,
    player: epd(entryAddress(entry, args)),
    unitId: 0,
    modifier: enumerated(entry) ? SetModifier.SetTo : row.op,
    target: stored(entry, args, row.value),
    location: fm ? fm.mask : 0,
    mask: fm ? MASK_MARKER : 0,
  };
}

/**
 * The number one part of a grouped entry stores for the row's value. A flingy's
 * acceleration and halt distance follow its top speed the way the game's own tables do:
 * acceleration about a seventeenth of the top speed (the Vulture's 1707 and 100), and
 * the halt distance the braking distance v² / 2a in the same units (the Vulture's
 * 14569 to the number).
 */
export function partValue(entry: Entry, part: EntryPart, value: number): number {
  const raw = rawValue(entry, value);
  switch (part.role) {
    case "value": return raw;
    case "const": return part.const ?? 0;
    case "acceleration": return Math.max(1, Math.round(raw / 17));
    case "halt": return Math.max(1, Math.round((raw * raw) / (2 * Math.max(1, Math.round(raw / 17)))));
  }
}

function partRecord(entry: Entry, part: EntryPart, args: EntryArgs, value: number): ActionRecord {
  const address = addressAt(part.address, args);
  const fm = maskAt(address, part.width, 0);
  const raw = partValue(entry, part, value);
  return {
    ...emptyAction(),
    type: ActionType.SetDeaths,
    player: epd(address),
    unitId: 0,
    modifier: SetModifier.SetTo,
    target: fm ? ((raw << fm.shift) & fm.mask) >>> 0 : raw >>> 0,
    location: fm ? fm.mask : 0,
    mask: fm ? MASK_MARKER : 0,
  };
}

/** Every record a row writes: one for a plain entry, the parts in order for a grouped one. */
export function lowerActions(row: EudRow): ActionRecord[] {
  const parts = row.entry.parts;
  if (!parts?.length) return [lowerAction(row)];
  return parts.map((part) => partRecord(row.entry, part, row.args, row.value));
}

/** What a raw EUD record reaches: the byte address, and the bit field under its mask. */
export interface EudAccess {
  /** The dword the record reaches. */
  dword: number;
  masked: boolean;
  shift: number;
  mask: number;
  /** The byte address of the field's first byte (the dword plus the shift in bytes for a byte or word field). */
  address: number;
}

export function accessOf(player: number, unit: number, mask: number, location: number): EudAccess | null {
  if (!isEud(player)) return null;
  const dword = addressOf(player, unit);
  if (mask !== MASK_MARKER || location === 0) return { dword, masked: false, shift: 0, mask: 0xffffffff, address: dword };
  let shift = 0;
  while (shift < 32 && !((location >>> shift) & 1)) shift++;
  return { dword, masked: true, shift, mask: location >>> 0, address: (dword + (shift >> 3)) >>> 0 };
}

/** Solve `address − base = Σ arg × stride` for the arguments; null when it is not in range. A via term maps the index back to the first unit type that uses it. */
function solveAt(spec: EntryAddress, entry: Entry, address: number): EntryArgs | null {
  let offset = address - spec.base;
  if (offset < 0) return null;
  const args: EntryArgs = {};
  const terms = [...(spec.terms ?? [])].sort((a, b) => b.stride - a.stride);
  for (const term of terms) {
    const arg = entry.args.find((a) => a.name === term.arg);
    if (!arg) return null;
    const n = Math.floor(offset / term.stride);
    if (term.via) {
      const units = lookup?.unitsOfFlingy(n) ?? [];
      if (!units.length) return null;
      args[term.arg] = units[0];
    } else {
      if (n >= arg.max) return null;
      args[term.arg] = n;
    }
    offset -= n * term.stride;
  }
  return offset === 0 ? args : null;
}

const solve = (entry: Entry, address: number): EntryArgs | null => solveAt(entry.address, entry, address);

/** Whether a record's access matches a plain field of this width at an address the spec can solve; the arguments when it does. */
function matchField(access: EudAccess, width: 1 | 2 | 4, spec: EntryAddress, entry: Entry): EntryArgs | null {
  if (width === 4) return access.masked ? null : solveAt(spec, entry, access.dword);
  if (!access.masked || access.mask !== ((((1 << (width * 8)) - 1) << access.shift) >>> 0)) return null;
  return solveAt(spec, entry, access.address);
}

/** A record as a catalogue row, or null when no entry reaches its address with its mask. Grouped entries are found by `recognizeActionGroup`. */
export function recognize(kind: "condition" | "action", player: number, unit: number, mask: number, location: number, amount: number, op: number): EudRow | null {
  const access = accessOf(player, unit, mask, location);
  if (!access) return null;
  for (const entry of ENTRIES) {
    if (!offers(entry, kind) || grouped(entry) || !available(entry)) continue;
    if (entry.width === "bit") {
      if (!access.masked || (access.mask & (access.mask - 1)) !== 0) continue;
      const args = solve(entry, access.dword);
      if (!args) continue;
      if (typeof entry.bit === "number") { if (entry.bit !== access.shift) continue; }
      else {
        const bitName = typeof entry.bit === "object" ? entry.bit.arg : "";
        const bitArg = entry.args.find((a) => a.name === bitName);
        if (!bitArg || access.shift >= bitArg.max) continue;
        args[bitArg.name] = access.shift;
      }
      return { entry, args, value: (amount >>> access.shift) & 1, op };
    }
    const args = matchField(access, entry.width, entry.address, entry);
    if (!args) continue;
    const raw = entry.width === 4 ? amount : (amount & access.mask) >>> access.shift;
    return { entry, args, value: typedValue(entry, raw), op };
  }
  return null;
}

export const recognizeCondition = (c: ConditionRecord): EudRow | null =>
  c.type === ConditionType.Deaths ? recognize("condition", c.player, c.unitId, c.mask, c.location, c.amount, c.comparison) : null;

export const recognizeAction = (a: ActionRecord): EudRow | null =>
  a.type === ActionType.SetDeaths ? recognize("action", a.player, a.unitId, a.mask, a.location, a.target, a.modifier) : null;

/** A grouped entry standing at `at` in the action list — every part in order, on one set of arguments — with how many records it spans. */
export function recognizeActionGroup(actions: readonly ActionRecord[], at: number): { row: EudRow; count: number } | null {
  for (const entry of ENTRIES) {
    const parts = entry.parts;
    if (!parts?.length || !offers(entry, "action") || !available(entry)) continue;
    if (at + parts.length > actions.length) continue;
    let args: EntryArgs | null = null;
    let value = 0;
    let ok = true;
    for (let i = 0; i < parts.length && ok; i++) {
      const a = actions[at + i];
      const part = parts[i];
      if (a.type !== ActionType.SetDeaths || a.modifier !== SetModifier.SetTo) { ok = false; break; }
      const access = accessOf(a.player, a.unitId, a.mask, a.location);
      if (!access) { ok = false; break; }
      const got = matchField(access, part.width, part.address, entry);
      if (!got) { ok = false; break; }
      if (args && Object.keys(args).some((k) => args![k] !== got[k])) { ok = false; break; }
      args = got;
      if (part.role === "value") value = typedValue(entry, part.width === 4 ? a.target : (a.target & access.mask) >>> access.shift);
    }
    if (ok && args) return { row: { entry, args, value, op: SetModifier.SetTo }, count: parts.length };
  }
  return null;
}

/** The action list as rows: each plain record on its own, each grouped entry as one row spanning its records. */
export function actionSpans(actions: readonly ActionRecord[]): { at: number; count: number; group: EudRow | null }[] {
  const out: { at: number; count: number; group: EudRow | null }[] = [];
  for (let i = 0; i < actions.length;) {
    const g = actions[i].type === ActionType.SetDeaths && isEud(actions[i].player) ? recognizeActionGroup(actions, i) : null;
    if (g) { out.push({ at: i, count: g.count, group: g.row }); i += g.count; }
    else { out.push({ at: i, count: 1, group: null }); i++; }
  }
  return out;
}
