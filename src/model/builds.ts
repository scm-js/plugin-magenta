/**
 * What only a euddraft build can do, described as data: the rows a map maker adds in
 * Magenta that have no record in the game's own trigger set — chat commands, synced
 * input, text with numbers in it, a pass over every unit of a kind, counter maths.
 * Each lives in the sidecar as a `BuildRecord`; in the map it is a private counter cell
 * the trigger sets (an action) or reads (a condition), so the trigger stays an ordinary
 * trigger and every editor can show it. The build server's Magenta plugin (`plugins/magenta.py`
 * in scm-js/eud-server) turns the records into eudplib code that watches the cells:
 * an action hook runs after the map's triggers in the cycle its flag went up and clears
 * it; a scan runs every cycle and leaves its answer in a cell; input arrives through the
 * MSQC plugin, which turns each player's local keys, clicks, mouse and selection into
 * game commands so every client agrees, and lands in per-player cells.
 */
import type { Cell } from "./counters";

/** A piece of a text hook: words, a counter's value, a player's name, or the switch to a player's colour. */
export type TextPart = { text: string } | { counter: Cell } | { player: number } | { color: number };

/** A unit's field a pass can read or test. */
export type UnitField = "hp" | "shields" | "energy" | "kills" | "x" | "y" | "order" | "hasTarget" | "underAttack" | "burrowed" | "inTransport" | "buildTime" | "resources" | "cooldown" | "speed";

/** The fields as the chips show them; `yesNo` fields read 1 or 0 and take an "is / is not" chip instead of a comparison. */
export const UNIT_FIELDS: readonly { field: UnitField; label: string; yesNo?: boolean }[] = [
  { field: "hp", label: "hit points" }, { field: "shields", label: "shields" }, { field: "energy", label: "energy" }, { field: "kills", label: "kills" },
  { field: "x", label: "x" }, { field: "y", label: "y" },
  { field: "order", label: "order id" }, { field: "hasTarget", label: "targeting something", yesNo: true }, { field: "underAttack", label: "under attack", yesNo: true },
  { field: "burrowed", label: "burrowed", yesNo: true }, { field: "inTransport", label: "in a transport", yesNo: true }, { field: "speed", label: "moving", yesNo: true },
  { field: "buildTime", label: "remaining build time" }, { field: "resources", label: "resources" }, { field: "cooldown", label: "weapon cooldown" },
];

/** The spell timers a pass can set. The game counts them down about once per eight frames, so a second at fastest is three ticks. */
export type TimerName = "stim" | "ensnare" | "plague" | "lockdown" | "stasis" | "maelstrom" | "irradiate" | "matrix";
export const TIMERS: readonly { timer: TimerName; label: string }[] = [
  { timer: "stim", label: "stim" }, { timer: "ensnare", label: "ensnare" }, { timer: "plague", label: "plague" }, { timer: "lockdown", label: "lockdown" },
  { timer: "stasis", label: "stasis" }, { timer: "maelstrom", label: "maelstrom" }, { timer: "irradiate", label: "irradiate" }, { timer: "matrix", label: "a defensive matrix" },
];
export const TIMER_TICKS_PER_SECOND = 3;
/** The cooldown a "hold fire" pass writes each cycle: longer than any weapon's, so the unit never gets to fire. */
export const HOLD_FIRE_COOLDOWN = 250;

export type ForEachDo =
  | { set: "hp" | "shields" | "energy" | "kills" | "resources" | "buildTime" | "rank"; value: number }
  | { kill: true }
  | { remove: true }
  | { invincible: boolean }
  | { hallucination: boolean }
  | { speed: boolean }
  /** Give with the colour, selection and control groups following. */
  | { give: number }
  /** Center a location on the unit, so the trigger's other actions can act on it. */
  | { locate: number }
  /** The game's own Order, one unit at a time through a scratch location Magenta keeps for it. */
  | { order: "move" | "patrol" | "attack"; location: number; scratch: number }
  /** A spell timer, in the game's ticks (`TIMER_TICKS_PER_SECOND`). */
  | { timer: TimerName; value: number }
  /** Ground, air and spell cooldowns held at this value; written every cycle it keeps the unit from firing. */
  | { cooldown: number }
  /** Walk through anything. */
  | { status: "noclip"; on: boolean };

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
  /**
   * The one matching unit with the least or greatest field, or the nearest to a location's centre:
   * a small box is centred on it (`locate`), its value goes into a counter (`to`), and a pass verb acts on it (`do`).
   */
  | ({ id: string; kind: "pick"; flag: Cell; by: "min" | "max" | "nearest"; field: UnitField; near: number | null; locate: number | null; to: Cell | null; do: ForEachDo | null } & UnitFilter)
  /** Read a field of the first matching unit into a counter (0 when there is none). */
  | ({ id: string; kind: "read"; flag: Cell; field: UnitField; to: Cell } & UnitFilter)
  /** Move a location by numbers: its top-left to (x, y) map pixels, keeping its size unless one is given. */
  | { id: string; kind: "setloc"; flag: Cell; location: number; x: number; y: number; width: number | null; height: number | null }
  /** Every cycle: 1 in `cell` while some matching unit's field compares so, else 0. A condition reads the cell. */
  | ({ id: string; kind: "scan"; cell: Cell; field: UnitField; cmp: "<" | ">" | "="; value: number } & UnitFilter)
  /**
   * A chat command: the chat plugin writes `value` into the map's chat cell when a message matches.
   * With `arg` "number" the message is a prefix — `-set` matches "-set 250" — and the number lands in
   * the chat args' number cell; the condition then reads the pattern cell instead.
   */
  | { id: string; kind: "chat"; message: string; value: number; arg?: "number" };

/** The cells the chat plugin fills for a pattern: the message's pointer and length, the pattern's value, and the number Magenta's hook parses out. */
export interface ChatArgs { ptr: Cell; len: Cell; pattern: Cell; number: Cell }

/** The map's chat cell, shared by every chat command; allocated with the first one. `args` come with the first pattern. */
export interface ChatCell { cell: Cell; args?: ChatArgs | null }

export type ChatRecord = Extract<BuildRecord, { kind: "chat" }>;

/** Whether the chat plugin sees this command as a pattern (its own `^…$` form, or a prefix followed by a number). */
export const isChatPattern = (c: ChatRecord): boolean => c.arg === "number" || (c.message.startsWith("^") && c.message.endsWith("$"));

/**
 * The key the chat plugin gets. It takes a pattern only as `^start.*middle.*end$` — exactly two `.*` —
 * so a typed `^-give .*$` gains its second, and a prefix with a number becomes `^-set .*.*$`.
 */
export function chatKey(c: ChatRecord): string {
  if (c.arg === "number") return `^${c.message} .*.*$`;
  if (c.message.startsWith("^") && c.message.endsWith("$")) {
    const parts = c.message.slice(1, -1).split(".*");
    if (parts.length === 2) return `^${parts[0]}.*.*${parts[1]}$`;
    return c.message;
  }
  return c.message;
}

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
  /** The location number MSQC keeps Player 1's mouse in — 1-based, like a trigger's — with the next seven for the other players; null until the mouse is used. */
  mouseBase: number | null;
  /** Location number → counter unit id: 1 while that player's mouse is over the location. */
  mouseIn: Record<string, number>;
  /** Counter units for the selected unit: MSQC delivers the pointer, the hook writes the type + 1. */
  select: { ptr: number; type: number } | null;
}

/** Map-wide things a build can add, chosen in the Build dialog. */
export interface BuildOptions {
  /** The camera glides after this location for everyone (the cammove plugin, which finds it by name); the helper location it needs is made at build time. */
  camera: { location: number; name: string; inertia: number; maxspeed: number } | null;
  /** A sound in the map, looped (the bgmplayer plugin): its string index and length in seconds. */
  bgm: { path: string; length: number } | null;
  /** Air units pass through one another (the noAirCollision plugin). */
  noAirCollision: boolean;
  /** Lift the sprite and image limits (the unlimiter plugin). */
  unlimiter: boolean;
}

export const DEFAULT_OPTIONS: BuildOptions = { camera: null, bgm: null, noAirCollision: false, unlimiter: false };

export const DEFAULT_MSQC: Msqc = { qcUnit: 58, qcLoc: 62, qcPlayer: 10, keys: {}, clicks: {}, mouseBase: null, mouseIn: {}, select: null };

/** How a value is sent to the build server: `plugins` for `POST /build`. */
export interface BuildPlugins {
  [plugin: string]: Record<string, string | number>;
}

export const MAGENTA_SPEC_VERSION = 3;

export interface MagentaSpec {
  version: number;
  everyFrame: boolean;
  chat: { cell: Cell; args?: ChatArgs | null } | null;
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
export function composePlugins(builds: BuildRecord[], chat: ChatCell | null, everyFrame: boolean, msqc: Msqc | null = null, options: BuildOptions = DEFAULT_OPTIONS, cammoveLoc: number | null = null): BuildPlugins {
  const plugins: BuildPlugins = {};
  if (options.camera && cammoveLoc !== null) plugins.cammove = { targetloc: options.camera.name, inertia: options.camera.inertia, maxspeed: options.camera.maxspeed };
  if (options.bgm) plugins.bgmplayer = { path: options.bgm.path, length: options.bgm.length };
  if (options.noAirCollision) plugins.noAirCollision = {};
  if (options.unlimiter) plugins.unlimiter = {};
  const chats = builds.filter((b): b is ChatRecord => b.kind === "chat");
  if (chats.length && chat) {
    const section: Record<string, string | number> = { __addr__: `0x${cellAddress(chat.cell).toString(16).toUpperCase()}` };
    if (chat.args && chats.some(isChatPattern)) {
      section.__patternAddr__ = `0x${cellAddress(chat.args.pattern).toString(16).toUpperCase()}`;
      section.__ptrAddr__ = `0x${cellAddress(chat.args.ptr).toString(16).toUpperCase()}`;
      section.__lenAddr__ = `0x${cellAddress(chat.args.len).toString(16).toUpperCase()}`;
    }
    for (const c of chats) section[chatKey(c)] = c.value;
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
  const spec: MagentaSpec = { version: MAGENTA_SPEC_VERSION, everyFrame, chat: chats.length && chat ? { cell: chat.cell, args: chats.some(isChatPattern) ? chat.args ?? null : null } : null, hooks, scans, msqc: msqcSpec };
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

/** A chat message the chat plugin accepts: up to 78 bytes, no newline, no `:` or `=`, and a `^…$` pattern with one or two `.*` in it. */
export function checkChatMessage(text: string): string | null {
  if (!text.trim()) return "Type the message players will send.";
  if (/[\r\n]/.test(text)) return "One line.";
  if (new TextEncoder().encode(text).length > 78) return "Up to 78 bytes, which is what the game lets a player type.";
  if (/[:=]/.test(text)) return "A message cannot contain : or =.";
  if (text.startsWith("^") && text.endsWith("$")) {
    const n = text.slice(1, -1).split(".*").length - 1;
    if (n < 1 || n > 2) return "A pattern is ^start.*end$ or ^start.*middle.*end$.";
  }
  return null;
}
