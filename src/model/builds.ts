/**
 * What only a euddraft build can do, described as data: the rows a map maker adds in
 * Magenta that have no record in the game's own trigger set — chat commands, text with
 * numbers in it, a pass over every unit of a kind, counter maths beyond add and subtract.
 * Each lives in the sidecar as a `BuildRecord`; in the map it is one private flag cell
 * the trigger sets (an action) or reads (a condition), so the trigger stays an ordinary
 * trigger and every editor can show it. The build box's Magenta plugin (`magenta.py` in
 * ai-server's euddraft image) turns the records into eudplib code that watches the
 * flags: an action hook runs after the map's triggers in the cycle the flag went up and
 * clears it; the chat plugin writes a message's number into the chat cell and Magenta's
 * hook clears it after the triggers have seen it.
 */
import type { Cell } from "./counters";

/** A piece of a text hook: words, or a counter's value. */
export type TextPart = { text: string } | { counter: Cell };

export type BuildRecord =
  | { id: string; kind: "text"; flag: Cell; parts: TextPart[]; /** A player slot, or every human player. */ to: number | "all" }
  | { id: string; kind: "math"; flag: Cell; op: "mul" | "div" | "mod" | "rand"; a: Cell; /** A cell, or a number. */ b: Cell | number; to: Cell }
  | { id: string; kind: "foreach"; flag: Cell; unit: number | null; owner: number | null; location: number | null; do: ForEachDo }
  /** A chat command: the chat plugin writes `value` into the map's chat cell when a message matches. */
  | { id: string; kind: "chat"; message: string; value: number };

export type ForEachDo =
  | { set: "hp" | "shields" | "energy"; value: number }
  | { kill: true }
  | { remove: true }
  | { invincible: boolean };

/** The map's chat cell, shared by every chat command; allocated with the first one. */
export interface ChatCell { cell: Cell }

/** How a value is sent to the box: `plugins` for `POST /v1/eud/build`. */
export interface BuildPlugins {
  [plugin: string]: Record<string, string | number>;
}

export const MAGENTA_SPEC_VERSION = 1;

/** The `[magenta]` spec the box's plugin reads: the hooks, the chat cell to clear, and the flags. */
export interface MagentaSpec {
  version: number;
  everyFrame: boolean;
  chat: { cell: Cell } | null;
  hooks: Exclude<BuildRecord, { kind: "chat" }>[];
}

const cellAddress = (cell: Cell) => 0x58a364 + cell[0] * 4 + cell[1] * 48;

/** The plugin sections for a build: the chat plugin's, Magenta's own, and turbo when the map runs every frame. */
export function composePlugins(builds: BuildRecord[], chat: ChatCell | null, everyFrame: boolean): BuildPlugins {
  const plugins: BuildPlugins = {};
  const chats = builds.filter((b): b is Extract<BuildRecord, { kind: "chat" }> => b.kind === "chat");
  if (chats.length && chat) {
    const section: Record<string, string | number> = { __addr__: `0x${cellAddress(chat.cell).toString(16).toUpperCase()}` };
    for (const c of chats) section[c.message] = c.value;
    plugins.chatEvent = section;
  }
  const hooks = builds.filter((b): b is Exclude<BuildRecord, { kind: "chat" }> => b.kind !== "chat");
  const spec: MagentaSpec = { version: MAGENTA_SPEC_VERSION, everyFrame, chat: chats.length && chat ? { cell: chat.cell } : null, hooks };
  if (hooks.length || spec.chat) plugins.magenta = { spec: JSON.stringify(spec) };
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
