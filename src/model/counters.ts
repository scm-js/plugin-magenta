/**
 * Death counters as variables: which cells of the deaths table the map's triggers already
 * touch, which units are safe to count with, and the lowest free cell for a new counter.
 *
 * A cell is `(player, unit)`; the game keeps the table `[unit][player]`, twelve players
 * per unit. A player group in a record stands for every slot it can resolve to, so
 * `All Players` reserves all twelve of that unit and `Current Player` the trigger's
 * owners. A player past the 27 groups is an EUD address, not a cell. Deaths of a unit
 * *class* (`Any unit`, `Men`, …) are a sum the game computes and reserve nothing.
 * TrigScript's programs reserve the same way, so the two allocators never collide on a
 * map that carries both.
 */
import { ActionType, ConditionType, PLAYER_GROUP_COUNT, PlayerGroup, type TriggerRecord } from "../../vendor/triggers";
import { owners } from "./records";

export type Cell = readonly [player: number, unit: number];
export const PLAYER_SLOTS = 12;
const UNIT_CLASS_FIRST = 228;

export const cellKey = (player: number, unit: number): number => unit * PLAYER_SLOTS + player;
export const cellOf = (key: number): Cell => [key % PLAYER_SLOTS, Math.floor(key / PLAYER_SLOTS)];

/** The slots a player field can mean, given the trigger's owners; empty for None, and for an EUD address. */
export function playerSlots(player: number, triggerOwners: readonly number[]): number[] {
  if (player < PLAYER_SLOTS) return [player];
  if (player >= PLAYER_GROUP_COUNT) return [];
  if (player === PlayerGroup.None) return [];
  if (player === PlayerGroup.CurrentPlayer) {
    const out = new Set<number>();
    for (const o of triggerOwners) for (const p of playerSlots(o, [])) out.add(p);
    return [...out].sort((a, b) => a - b);
  }
  return Array.from({ length: PLAYER_SLOTS }, (_, i) => i);
}

/** Every death-counter cell (as `cellKey`) and switch the list reads or writes. */
export function usage(list: readonly TriggerRecord[]): { cells: Set<number>; switches: Set<number> } {
  const cells = new Set<number>();
  const switches = new Set<number>();
  for (const t of list) {
    const own = owners(t);
    for (const c of t.conditions) {
      if (c.type === ConditionType.Deaths && c.unitId < UNIT_CLASS_FIRST) for (const p of playerSlots(c.player, own)) cells.add(cellKey(p, c.unitId));
      if (c.type === ConditionType.Switch) switches.add(c.resource);
    }
    for (const a of t.actions) {
      if (a.type === ActionType.SetDeaths && a.unitId < UNIT_CLASS_FIRST) for (const p of playerSlots(a.player, own)) cells.add(cellKey(p, a.unitId));
      if (a.type === ActionType.SetSwitch) switches.add(a.target);
    }
  }
  return { cells, switches };
}

/**
 * Units whose deaths nothing in a game increments: the ones that cannot be built or
 * placed and die (the unused buildings and critters of units.dat, the markers and
 * beacons), in the order a new counter takes them. Anything placed on the map is
 * skipped by the allocator whatever this list says.
 */
export const COUNTER_UNITS: readonly number[] = [
  181, 182, 179, 180, 183, 184, 185, 186, 187, 204, 91, 92, 119, 121, 145, 153, 158, 161,
  191, 192, 193, 194, 195, 196, 197, 198, 199, 215, 216, 217, 219, 128, 129, 173, 101, 214,
];

/** The lowest free cell: the first counter unit not placed on the map, its lowest unused player. */
export function allocate(used: ReadonlySet<number>, placedUnitIds: ReadonlySet<number> = new Set()): Cell | null {
  for (const unit of COUNTER_UNITS) {
    if (placedUnitIds.has(unit)) continue;
    for (let player = 0; player < PLAYER_SLOTS; player++) {
      if (!used.has(cellKey(player, unit))) return [player, unit];
    }
  }
  return null;
}
