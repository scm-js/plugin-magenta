/**
 * What only a euddraft build can do, described as data: the rows a map maker adds in
 * Magenta that have no record in the game's own trigger set — chat commands, synced
 * input, text with numbers in it, a pass over every unit of a kind, counter maths.
 * Each lives in the sidecar as a `BuildRecord`; in the map it is a private counter cell
 * the trigger sets (an action) or reads (a condition), so the trigger stays an ordinary
 * trigger and every editor can show it. The build box's Magenta plugin (`magenta.py` in
 * ai-server's euddraft image) turns the records into eudplib code that watches the cells:
 * an action hook runs after the map's triggers in the cycle its flag went up and clears
 * it; a scan runs every cycle and leaves its answer in a cell; input arrives through the
 * MSQC plugin, which turns each player's local keys, clicks, mouse and selection into
 * game commands so every client agrees, and lands in per-player cells.
 */
import type { Cell } from "./counters";

/** A piece of a text hook: words, or a counter's value. */
export type TextPart = { text: string } | { counter: Cell };

/** A unit's field a pass can read or test. */
export type UnitField = "hp" | "shields" | "energy" | "kills" | "x" | "y";

export type ForEachDo =
  | { set: "hp" | "shields" | "energy" | "kills"; value: number }
  | { kill: true }
  | { remove: true }
  | { invincible: boolean }
  | { hallucination: boolean }
  | { speed: boolean }
  /** Give with the colour, selection and control groups following. */
  | { give: number }
  /** Center a location on the unit, so the trigger's other actions can act on it. */
  | { locate: number };

export interface UnitFilter {
  unit: number | null;
  owner: number | null;
  location: number | null;
}

export type BuildRecord =
  | { id: string; kind: "text"; flag: Cell; parts: TextPart[]; to: number | "all" }
  | { id: string; kind: "math"; flag: Cell; op: "mul" | "div" | "mod" | "rand"; a: Cell; b: Cell | number; to: Cell }
  | ({ id: string; kind: "foreach"; flag: Cell; do: ForEachDo } & UnitFilter)
  /** Count the matching units into a counter. */
  | ({ id: string; kind: "count"; flag: Cell; to: Cell } & UnitFilter)
  /** Read a field of the first matching unit into a counter (0 when there is none). */
  | ({ id: string; kind: "read"; flag: Cell; field: UnitField; to: Cell } & UnitFilter)
  /** Every cycle: 1 in `cell` while some matching unit's field compares so, else 0. A condition reads the cell. */
  | ({ id: string; kind: "scan"; cell: Cell; field: UnitField; cmp: "<" | ">" | "="; value: number } & UnitFilter)
  /** A chat command: the chat plugin writes `value` into the map's chat cell when a message matches. */
  | { id: string; kind: "chat"; message: string; value: number };

/** The map's chat cell, shared by every chat command; allocated with the first one. */
export interface ChatCell { cell: Cell }

/**
 * Synced input through MSQC: one counter *unit* per event, and the pressing player's slot as
 * the cell's player, so a condition reads `deaths(player, unit) ≥ 1`. MSQC needs a unit type
 * of its own, a location of its own, a player slot nobody uses, and one location per human
 * player when the mouse is used; Magenta's hook clears the event cells after each cycle.
 */
export interface Msqc {
  /** The unit type MSQC uses for its command units; must not appear in the map otherwise. Valkyrie by default. */
  qcUnit: number;
  /** 0-based location slot MSQC owns. */
  qcLoc: number;
  /** 0-based player slot MSQC owns (Player 11 by default). */
  qcPlayer: number;
  /** Key code → counter unit id: `deaths(player, unit)` counts that player's presses. */
  keys: Record<string, number>;
  /** "L" / "R" → counter unit id, per click. */
  clicks: Record<string, number>;
  /** First of eight 0-based location slots that follow the players' mice, or null. */
  mouseBase: number | null;
  /** Location number → counter unit id: 1 while that player's mouse is over the location. */
  mouseIn: Record<string, number>;
  /** Counter units for the selected unit: MSQC delivers the pointer, the hook writes the type + 1. */
  select: { ptr: number; type: number } | null;
}

export const DEFAULT_MSQC: Msqc = { qcUnit: 58, qcLoc: 62, qcPlayer: 10, keys: {}, clicks: {}, mouseBase: null, mouseIn: {}, select: null };

/** How a value is sent to the box: `plugins` for `POST /v1/eud/build`. */
export interface BuildPlugins {
  [plugin: string]: Record<string, string | number>;
}

export const MAGENTA_SPEC_VERSION = 2;

export interface MagentaSpec {
  version: number;
  everyFrame: boolean;
  chat: { cell: Cell } | null;
  hooks: Extract<BuildRecord, { flag: Cell }>[];
  scans: Extract<BuildRecord, { kind: "scan" }>[];
  /** MSQC follow-up: the event units to clear each cycle, the mouse-over locations, the selection. */
  msqc: { clear: number[]; mouseBase: number | null; mouseIn: { location: number; unit: number }[]; select: { ptr: number; type: number } | null } | null;
}

const cellAddress = (cell: Cell) => 0x58a364 + cell[0] * 4 + cell[1] * 48;

/** Windows key names MSQC knows, from a virtual-key code. */
export function msqcKeyName(code: number): string {
  if (code >= 0x41 && code <= 0x5a) return String.fromCharCode(code);
  if (code >= 0x30 && code <= 0x39) return String.fromCharCode(code);
  if (code >= 0x70 && code <= 0x7b) return `F${code - 0x6f}`;
  const named: Record<number, string> = { 0x20: "SPACE", 0x0d: "ENTER", 0x1b: "ESC", 0x09: "TAB", 0x10: "SHIFT", 0x11: "LCTRL", 0x12: "LALT", 0x25: "LEFT", 0x26: "UP", 0x27: "RIGHT", 0x28: "DOWN", 0x08: "BACK", 0x2e: "DELETE", 0x2d: "INSERT", 0x24: "HOME", 0x23: "END", 0x21: "PGUP", 0x22: "PGDN" };
  return named[code] ?? `0x${code.toString(16).toUpperCase()}`;
}

/** Whether the map uses MSQC at all. */
export const usesMsqc = (m: Msqc | null): m is Msqc => !!m && (Object.keys(m.keys).length > 0 || Object.keys(m.clicks).length > 0 || Object.keys(m.mouseIn).length > 0 || m.select !== null);

/** The plugin sections for a build: the chat plugin's, MSQC's, Magenta's own, and turbo when the map runs every frame. */
export function composePlugins(builds: BuildRecord[], chat: ChatCell | null, everyFrame: boolean, msqc: Msqc | null = null): BuildPlugins {
  const plugins: BuildPlugins = {};
  const chats = builds.filter((b): b is Extract<BuildRecord, { kind: "chat" }> => b.kind === "chat");
  if (chats.length && chat) {
    const section: Record<string, string | number> = { __addr__: `0x${cellAddress(chat.cell).toString(16).toUpperCase()}` };
    for (const c of chats) section[c.message] = c.value;
    plugins.chatEvent = section;
  }
  let msqcSpec: MagentaSpec["msqc"] = null;
  if (usesMsqc(msqc)) {
    const section: Record<string, string | number> = { QCUnit: msqc.qcUnit, QCLoc: msqc.qcLoc, QCPlayer: msqc.qcPlayer + 1, QCDebug: "false" };
    const clear: number[] = [];
    for (const [code, unit] of Object.entries(msqc.keys)) { section[`KeyPress(${msqcKeyName(Number(code))}); NotTyping`] = `${unit}, 1`; clear.push(unit); }
    for (const [button, unit] of Object.entries(msqc.clicks)) { section[`MouseDown(${button})`] = `${unit}, 1`; clear.push(unit); }
    const mouseIn = Object.entries(msqc.mouseIn).map(([location, unit]) => ({ location: Number(location), unit }));
    if ((mouseIn.length || Object.keys(msqc.clicks).length) && msqc.mouseBase !== null) section["Mouse"] = msqc.mouseBase;
    // The selected unit's pointer, sent when a left click ends — the moment a selection can have changed.
    if (msqc.select) section["MouseUp(L); val, 0x597208"] = String(msqc.select.ptr);
    plugins.MSQC = section;
    msqcSpec = { clear, mouseBase: msqc.mouseBase, mouseIn, select: msqc.select };
  }
  const hooks = builds.filter((b): b is Extract<BuildRecord, { flag: Cell }> => "flag" in b);
  const scans = builds.filter((b): b is Extract<BuildRecord, { kind: "scan" }> => b.kind === "scan");
  const spec: MagentaSpec = { version: MAGENTA_SPEC_VERSION, everyFrame, chat: chats.length && chat ? { cell: chat.cell } : null, hooks, scans, msqc: msqcSpec };
  if (hooks.length || scans.length || spec.chat || msqcSpec) plugins.magenta = { spec: JSON.stringify(spec) };
  if (everyFrame) plugins.eudTurbo = {};
  return plugins;
}

/** The next free chat value: the plugin refuses 0 and 1. */
export function nextChatValue(builds: BuildRecord[]): number {
  let n = 2;
  const used = new Set(builds.filter((b) => b.kind === "chat").map((b) => (b as { value: number }).value));
  while (used.has(n)) n++;
  return n;
}

/** A chat message the chat plugin accepts: up to 78 bytes, no newline, no leading `^` unless it is a pattern the plugin knows. */
export function checkChatMessage(text: string): string | null {
  if (!text.trim()) return "Type the message players will send.";
  if (/[\r\n]/.test(text)) return "One line.";
  if (new TextEncoder().encode(text).length > 78) return "Up to 78 bytes, which is what the game lets a player type.";
  if (/[:=]/.test(text) && !text.startsWith("^")) return "A message cannot contain : or =.";
  return null;
}
