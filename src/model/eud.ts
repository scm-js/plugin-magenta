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
 */
import { ActionType, Comparison, ConditionType, PLAYER_GROUP_COUNT, SetModifier, emptyAction, emptyCondition, type ActionRecord, type ConditionRecord } from "../../vendor/triggers";
import { ENTRIES, enumerated, offers, type Entry } from "../catalogue";

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

export type EntryArgs = Record<string, number>;

/** One catalogue entry with its arguments filled in: what a row holds and a chip edits. */
export interface EudRow {
  entry: Entry;
  args: EntryArgs;
  /** As typed: hit points, seconds, a choice's value. */
  value: number;
  /** `Comparison` for a condition, `SetModifier` for an action. */
  op: number;
}

/** The byte address an entry and its arguments name. */
export function entryAddress(entry: Entry, args: EntryArgs): number {
  let address = entry.address.base;
  for (const term of entry.address.terms ?? []) address += (args[term.arg] ?? 0) * term.stride;
  return address >>> 0;
}

/** Where the field sits in its dword: the bit offset and the mask, or null for a whole dword. */
export function fieldMask(entry: Entry, args: EntryArgs): { shift: number; mask: number } | null {
  const address = entryAddress(entry, args);
  if (entry.width === "bit") {
    const bit = typeof entry.bit === "number" ? entry.bit : (args[entry.bit?.arg ?? ""] ?? 0);
    return { shift: bit, mask: (1 << bit) >>> 0 };
  }
  if (entry.width === 4) return null;
  const shift = (address & 3) * 8;
  const mask = (((1 << (entry.width * 8)) - 1) << shift) >>> 0;
  return { shift, mask };
}

export const scaleOf = (entry: Entry): number => entry.value?.scale ?? 1;

/** The stored number for a typed value: scaled, and shifted under the mask. */
function stored(entry: Entry, args: EntryArgs, value: number): number {
  const scaled = Math.round(value * scaleOf(entry));
  const fm = fieldMask(entry, args);
  if (!fm) return scaled >>> 0;
  return ((scaled << fm.shift) & fm.mask) >>> 0;
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

/** Solve `address − base = Σ arg × stride` for the arguments; null when it is not in range. */
function solve(entry: Entry, address: number): EntryArgs | null {
  let offset = address - entry.address.base;
  if (offset < 0) return null;
  const args: EntryArgs = {};
  const terms = [...(entry.address.terms ?? [])].sort((a, b) => b.stride - a.stride);
  for (const term of terms) {
    const arg = entry.args.find((a) => a.name === term.arg);
    if (!arg) return null;
    const n = Math.floor(offset / term.stride);
    if (n >= arg.max) return null;
    args[term.arg] = n;
    offset -= n * term.stride;
  }
  return offset === 0 ? args : null;
}

/** A record as a catalogue row, or null when no entry reaches its address with its mask. */
export function recognize(kind: "condition" | "action", player: number, unit: number, mask: number, location: number, amount: number, op: number): EudRow | null {
  const access = accessOf(player, unit, mask, location);
  if (!access) return null;
  for (const entry of ENTRIES) {
    if (!offers(entry, kind)) continue;
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
    if (entry.width === 4) {
      if (access.masked) continue;
      const args = solve(entry, access.dword);
      if (!args) continue;
      return { entry, args, value: amount / scaleOf(entry), op };
    }
    const width = entry.width;
    if (!access.masked || access.mask !== ((((1 << (width * 8)) - 1) << access.shift) >>> 0)) continue;
    const args = solve(entry, access.address);
    if (!args) continue;
    return { entry, args, value: ((amount & access.mask) >>> access.shift) / scaleOf(entry), op };
  }
  return null;
}

export const recognizeCondition = (c: ConditionRecord): EudRow | null =>
  c.type === ConditionType.Deaths ? recognize("condition", c.player, c.unitId, c.mask, c.location, c.amount, c.comparison) : null;

export const recognizeAction = (a: ActionRecord): EudRow | null =>
  a.type === ActionType.SetDeaths ? recognize("action", a.player, a.unitId, a.mask, a.location, a.target, a.modifier) : null;
