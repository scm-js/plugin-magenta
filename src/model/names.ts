/**
 * What a sentence needs to turn numbers into words: the map's names and the game's. The
 * plugin builds one over the editor's API (`api.triggers.names()`, `api.names`, the
 * player settings); the tests build one from tables.
 */
export interface Namer {
  unit(id: number): string;
  location(number: number): string;
  switch(index: number): string;
  string(index: number): string | null;
  /** A `PlayerGroup` value, or an EUD player past the 27 groups (`memory at 0x…`). */
  player(value: number): string;
  /** The player's colour as CSS, for the chip; null for a group. */
  playerColor?(value: number): string | null;
  aiScript(code: number): string;
  wav(index: number): string;
  /** The label of an enumerated argument (`comparison`, `modifier`, …). */
  choice(kind: string, value: number): string | undefined;
  /** A named death counter for a (player, unit) cell, when the map names one. */
  counter?(player: number, unit: number): string | null;
}

/**
 * Unit ids. The game has 228 unit types (0–227); 228 is "None" and 229–232 are the trigger
 * classes (Any unit, Men, Buildings, Factories). A mod's data set with more types numbers
 * the rest from 233, so a value past 232 is a unit of the mod's, never a class.
 */
export const GAME_UNIT_TYPES = 228;
export const isUnitClass = (id: number): boolean => id >= GAME_UNIT_TYPES && id <= 232;

/**
 * A unit picker's two lists: the classes (when asked for) and the unit types, each in the
 * order given. `max` stops the types at the game's own tables where a feature is tied to
 * them (the EUD catalogue's unit fields are 1.16.1's arrays of 228); without it every type
 * the data set has is offered.
 */
export function unitChoices<T extends { value: number }>(units: readonly T[], options: { classes?: boolean; max?: number } = {}): { classes: T[]; units: T[] } {
  const classes = options.classes === false ? [] : units.filter((u) => isUnitClass(u.value));
  const max = options.max ?? Infinity;
  return { classes, units: units.filter((u) => !isUnitClass(u.value) && u.value < max) };
}
