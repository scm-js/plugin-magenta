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
