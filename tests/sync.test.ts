import { describe, expect, it } from "vitest";
import { ActionType, ConditionType, PlayerGroup, emptyAction, emptyCondition, emptyTrigger } from "../vendor/triggers";
import { compareConditions, flagAction, locateRun, markerOf } from "../src/model/expansions";
import { setOwners, fingerprint } from "../src/model/records";
import { clean, sync, type ExpansionRecord } from "../src/model/sync";
import { cycle, getDeaths, newState, setDeaths } from "../src/model/simulate";

const strings: string[] = [""];
const intern = (t: string) => { const i = strings.indexOf(t); if (i >= 0) return i; strings.push(t); return strings.length - 1; };
const text = (i: number) => strings[i] ?? null;
const A = [7, 181] as const, B = [7, 182] as const, FLAG = [0, 183] as const;
const plain = (owner: number, action: number) => setOwners({ ...emptyTrigger(), conditions: [{ ...emptyCondition(), type: ConditionType.Always }], actions: [{ ...emptyAction(), type: action }] }, [owner]);

describe("sync", () => {
  it("puts a copy run after its anchor, takes it out again when the flag action goes, and is idempotent", () => {
    const anchor = setOwners({ ...emptyTrigger(), conditions: [{ ...emptyCondition(), type: ConditionType.Switch, resource: 0, comparison: 2 }], actions: [flagAction({ cell: FLAG }), { ...emptyAction(), type: ActionType.PreserveTrigger }] }, [0]);
    // Harmless actions: the simulator now ends a player's game on Victory, which would stop the run after it.
    const list = [plain(0, ActionType.MinimapPing), anchor, plain(1, ActionType.Defeat)];
    const x: ExpansionRecord = { id: "c1", kind: "copy", from: A, to: B, flag: FLAG, bits: 16 };
    const r1 = sync(list, [x], text, intern);
    expect(r1.list).toHaveLength(3 + 18);
    expect(r1.runs).toEqual([{ id: "c1", start: 2, count: 18, anchor: 1 }]);
    expect(r1.remap).toEqual([0, 1, 20]);
    expect(locateRun(r1.list, "c1", text)).toEqual({ start: 2, count: 18 });
    // Again on the synced list: the same list.
    const r2 = sync(r1.list, r1.expansions, text, intern);
    expect(r2.list.map(fingerprint)).toEqual(r1.list.map(fingerprint));
    // The run works in the simulator.
    const s = newState();
    setDeaths(s, A[0], A[1], 1234);
    s.switches.add(0);
    cycle(r1.list, s);
    expect(getDeaths(s, B[0], B[1])).toBe(1234);
    // Without the flag action the expansion is dropped and the run removed.
    const without = r1.list.map((t) => (t === r1.list[1] ? { ...t, actions: t.actions.filter((a) => a.type !== ActionType.SetDeaths) } : t));
    const r3 = sync(without, r1.expansions, text, intern);
    expect(r3.list).toHaveLength(3);
    expect(r3.expansions).toEqual([]);
    expect(clean(r1.list, text)).toHaveLength(3);
  });

  it("puts a compare run before its anchor and follows the anchor when it moves", () => {
    const x: ExpansionRecord = { id: "k1", kind: "compare", a: A, b: B, scratch: [[1, 183], [2, 183]], bits: 8, anchor: { i: 1, h: "" } };
    const anchor = setOwners({ ...emptyTrigger(), conditions: compareConditions(x, ">"), actions: [{ ...emptyAction(), type: ActionType.Victory }] }, [0]);
    const list = [plain(0, ActionType.Defeat), anchor];
    const r1 = sync(list, [{ ...x, anchor: { i: 1, h: fingerprint(anchor) } }], text, intern);
    expect(r1.runs[0]).toMatchObject({ id: "k1", start: 1, count: 33, anchor: 34 });
    expect(r1.list[34]).toEqual(anchor);
    // Move the anchor to the front (as the panel would, on the clean list): the run follows by fingerprint.
    const moved = [anchor, plain(0, ActionType.Defeat)];
    const r2 = sync(moved, r1.expansions, text, intern);
    expect(r2.runs[0]).toMatchObject({ start: 0, count: 33, anchor: 33 });
    expect(r2.list[33]).toEqual(anchor);
    expect(markerOf(r2.list[0], text)?.edge).toBe("begin");
  });

  it("owns a template's counter run by the template's players", () => {
    const tpl = setOwners({ ...emptyTrigger(), conditions: [{ ...emptyCondition(), type: ConditionType.Always }], actions: [flagAction({ cell: FLAG })] }, [PlayerGroup.AllPlayers]);
    const xs: ExpansionRecord[] = [
      { id: "p2", kind: "forEachPlayer", placeholder: PlayerGroup.CurrentPlayer, players: [2, 3], anchor: { i: 0, h: fingerprint(tpl) } },
      { id: "c2", kind: "copy", from: A, to: B, flag: FLAG, bits: 8 },
    ];
    const r = sync([tpl], xs, text, intern);
    const run = r.runs.find((x) => x.id === "c2")!;
    expect(r.list[run.start].players[2]).toBe(1);
    expect(r.list[run.start].players[3]).toBe(1);
    expect(r.list[run.start].players[0]).toBe(0);
  });

  it("makes per-player copies and silences the template", () => {
    const tpl = setOwners({ ...emptyTrigger(), conditions: [{ ...emptyCondition(), type: ConditionType.Bring, player: PlayerGroup.CurrentPlayer, amount: 1 }], actions: [{ ...emptyAction(), type: ActionType.Victory }] }, [PlayerGroup.AllPlayers]);
    const x: ExpansionRecord = { id: "p1", kind: "forEachPlayer", placeholder: PlayerGroup.CurrentPlayer, players: [0, 1], anchor: { i: 0, h: fingerprint(tpl) } };
    const r = sync([tpl], [x], text, intern);
    expect(r.list).toHaveLength(3);
    expect(r.list[0].players.some(Boolean)).toBe(false);
    expect(r.list[1].conditions[0].player).toBe(0);
    expect(r.list[2].conditions[0].player).toBe(1);
    expect(r.expansions[0]).toMatchObject({ anchor: { i: 0 } });
  });
});
