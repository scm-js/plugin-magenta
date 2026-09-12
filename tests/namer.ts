/** A `Namer` over tables, for the tests: StarEdit's unit names, `Location N`, `Switch N`, a small string table. */
import { PLAYER_GROUP_COUNT } from "../vendor/triggers";
import { aiScriptName, choiceLabel, PLAYER_GROUP_CHOICES, type ArgKind } from "../vendor/triggerDefs";
import { unitName } from "../vendor/units";
import type { Namer } from "../src/model/names";

export interface NamerTables {
  strings?: (string | null)[];
  locations?: Record<number, string>;
  switches?: Record<number, string>;
  counters?: Record<string, string>;
}

export function testNamer(tables: NamerTables = {}): Namer {
  return {
    unit: (id) => unitName(id),
    location: (n) => tables.locations?.[n] ?? (n === 64 ? "Anywhere" : n === 0 ? "No location" : `Location ${n}`),
    switch: (i) => tables.switches?.[i] ?? `Switch ${i + 1}`,
    string: (i) => tables.strings?.[i] ?? null,
    player: (v) => (v >= PLAYER_GROUP_COUNT ? `memory at 0x${(0x58a364 + v * 4).toString(16).toUpperCase()}` : PLAYER_GROUP_CHOICES.find((c) => c.value === v)?.label ?? `Player ${v + 1}`),
    aiScript: (code) => aiScriptName(code),
    wav: (i) => (i === 0 ? "no sound" : tables.strings?.[i] ?? `sound ${i}`),
    choice: (kind, value) => choiceLabel(kind as ArgKind, value),
    counter: (player, unit) => tables.counters?.[`${player}:${unit}`] ?? null,
  };
}
