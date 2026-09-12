/**
 * Which slot of the game's unit table a placed unit takes. Verified in StarCraft:
 * Remastered (2026-09-12): the first unit of the map's UNIT section takes slot 0, and
 * every later one is handed out from the top of the 1700-slot table downwards — the
 * second placed unit is slot 1699, the third 1698, and so on. Start locations are not
 * units in a Use Map Settings game and are skipped; whether a unit the game removes at
 * load (an absent player's) still consumes a slot is not yet known.
 */
export const UNIT_SLOTS = 1700;
const START_LOCATION = 214;

/** The slot for the n-th unit created (0-based, in section order). */
export const slotOfCreated = (n: number): number => (n === 0 ? 0 : UNIT_SLOTS - n);

/** The created-order position for a slot, or -1 when no placed unit takes it. */
export const createdOfSlot = (slot: number): number => (slot === 0 ? 0 : slot >= 1 && slot < UNIT_SLOTS ? UNIT_SLOTS - slot : -1);

/** The slot of each record of a UNIT section, or -1 for a start location. */
export function slotsOf(unitIds: readonly number[]): number[] {
  let n = 0;
  return unitIds.map((id) => (id === START_LOCATION ? -1 : slotOfCreated(n++)));
}
