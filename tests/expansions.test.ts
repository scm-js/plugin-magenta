import { describe, expect, it } from "vitest";
import { ActionType, ConditionType, PlayerGroup, emptyAction, emptyCondition, emptyTrigger } from "../vendor/triggers";
import { compareConditions, compareRun, counterRun, flagAction, forEachPlayerRun, locateRun, markerOf, type CompareExpansion, type CounterExpansion } from "../src/model/expansions";
import { cycle, getDeaths, newState, setDeaths } from "../src/model/simulate";
import { setOwners } from "../src/model/records";

const strings = ["", "magenta:begin:x", "magenta:end:x", "magenta:x", "magenta:begin:cmp", "magenta:end:cmp", "magenta:cmp"];
const text = (i: number) => strings[i] ?? null;
const markers = { begin: 1, end: 2, row: 3 };
const A = [7, 181] as const, B = [7, 182] as const, FLAG = { cell: [0, 183] as const };
const rand = (bits: number) => Math.floor(Math.random() * 2 ** bits) >>> 0;

/** An anchor owned by Player 1 that fires when switch 0 is set, and asks for its expansions. */
const anchor = () => setOwners({ ...emptyTrigger(), conditions: [{ ...emptyCondition(), type: ConditionType.Switch, resource: 0, comparison: 2 }], actions: [flagAction(FLAG), { ...emptyAction(), type: ActionType.PreserveTrigger }] }, [0]);

describe("counter expansions", () => {
  it("copies A to B in one cycle, for random values, and is found again by its markers", () => {
    const x: CounterExpansion = { id: "x", kind: "copy", from: A, to: B };
    const run = counterRun(x, [0], FLAG, markers);
    expect(run).toHaveLength(34);
    const list = [anchor(), ...run];
    for (let n = 0; n < 20; n++) {
      const s = newState();
      const a = rand(32);
      setDeaths(s, A[0], A[1], a);
      setDeaths(s, B[0], B[1], rand(32));
      s.switches.add(0);
      cycle(list, s);
      expect(getDeaths(s, B[0], B[1])).toBe(a);
      expect(getDeaths(s, A[0], A[1])).toBe(a);
      expect(getDeaths(s, FLAG.cell[0], FLAG.cell[1])).toBe(0);
    }
    expect(locateRun(list, "x", text)).toEqual({ start: 1, count: 34 });
    expect(markerOf(run[0], text)).toEqual({ id: "x", edge: "begin" });
    expect(markerOf(run[5], text)).toEqual({ id: "x", edge: null });
  });

  it("does nothing while the anchor does not fire", () => {
    const run = counterRun({ id: "x", kind: "copy", from: A, to: B }, [0], FLAG, markers);
    const s = newState();
    setDeaths(s, A[0], A[1], 5);
    setDeaths(s, B[0], B[1], 9);
    cycle([anchor(), ...run], s);
    expect(getDeaths(s, B[0], B[1])).toBe(9);
  });

  it("adds and subtracts, with 16 bits when asked", () => {
    for (const kind of ["add", "subtract"] as const) {
      const run = counterRun({ id: "x", kind, from: A, to: B, bits: 16 }, [0], FLAG, markers);
      expect(run).toHaveLength(17);
      const s = newState();
      const a = rand(16), b = rand(16);
      setDeaths(s, A[0], A[1], a);
      setDeaths(s, B[0], B[1], b);
      s.switches.add(0);
      cycle([anchor(), ...run], s);
      expect(getDeaths(s, B[0], B[1])).toBe(kind === "add" ? a + b : Math.max(0, b - a));
    }
  });
});

describe("compare expansion", () => {
  it("answers every relation, every cycle, before the anchor", () => {
    const x: CompareExpansion = { id: "cmp", kind: "compare", a: A, b: B, scratch: [[1, 183], [2, 183]], bits: 16 };
    const run = compareRun(x, [0], { begin: 4, end: 5, row: 6 });
    for (const [a, b] of [[5, 3], [3, 5], [4, 4], [0, 0], [65535, 0]]) {
      for (const rel of [">", ">=", "==", "<", "<="] as const) {
        const t = setOwners({ ...emptyTrigger(), conditions: compareConditions(x, rel), actions: [{ ...emptyAction(), type: ActionType.SetDeaths, player: 3, unitId: 183, modifier: 7, target: 1 }] }, [0]);
        const s = newState();
        setDeaths(s, A[0], A[1], a);
        setDeaths(s, B[0], B[1], b);
        cycle([...run, t], s);
        const expected = { ">": a > b, ">=": a >= b, "==": a === b, "<": a < b, "<=": a <= b }[rel];
        expect(getDeaths(s, 3, 183) === 1, `${a} ${rel} ${b}`).toBe(expected);
      }
    }
    expect(locateRun(run, "cmp", text)).toEqual({ start: 0, count: run.length });
  });
});

describe("for each player", () => {
  it("makes one owned copy per player with the placeholder swapped, Give Units' target included", () => {
    const base = setOwners({ ...emptyTrigger(), conditions: [{ ...emptyCondition(), type: ConditionType.Bring, player: PlayerGroup.CurrentPlayer, amount: 1 }], actions: [{ ...emptyAction(), type: ActionType.GiveUnits, player: 7, target: PlayerGroup.CurrentPlayer }, { ...emptyAction(), type: ActionType.Comment, text: 9 }] }, [PlayerGroup.AllPlayers]);
    const run = forEachPlayerRun({ id: "x", kind: "forEachPlayer", placeholder: PlayerGroup.CurrentPlayer, players: [0, 1, 2] }, base, markers);
    expect(run).toHaveLength(3);
    expect(run[1].conditions[0].player).toBe(1);
    expect(run[1].actions[0].target).toBe(1);
    expect(run[1].players.filter(Boolean)).toHaveLength(1);
    expect(run[1].players[1]).toBe(1);
    expect(run.map((t) => t.actions.at(-1)!.text)).toEqual([1, 3, 2]);
    expect(run[0].actions.some((a) => a.text === 9)).toBe(false);
  });
});
