import { describe, expect, it } from "vitest";
import { ActionType, Comparison, ConditionType, PlayerGroup, emptyAction, emptyCondition, emptyTrigger, type TriggerRecord } from "../vendor/triggers";
import type { BuildRecord } from "../src/model/builds";
import type { Cell } from "../src/model/counters";
import { flagAction, isFlagAction } from "../src/model/expansions";
import { detach, orderBuilds, prune, refs, sharedElsewhere } from "../src/model/ownership";
import { setOwners } from "../src/model/records";
import type { ExpansionRecord } from "../src/model/sync";

const scanCondition = (cell: Cell) => ({ ...emptyCondition(), type: ConditionType.Deaths, player: cell[0], unitId: cell[1], comparison: Comparison.Exactly, amount: 1 });
const trig = (conditions: ReturnType<typeof emptyCondition>[], actions: ReturnType<typeof emptyAction>[]): TriggerRecord => setOwners({ ...emptyTrigger(), conditions, actions }, [PlayerGroup.AllPlayers]);

const heal: BuildRecord = { id: "b1", kind: "foreach", flag: [0, 181], unit: 0, owner: 0, location: 1, do: { adjust: "hp", delta: 20 } };
const low: BuildRecord = { id: "s1", kind: "scan", cell: [1, 181], unit: 0, owner: 0, location: null, field: "hp", cmp: "<", value: 20 };
const chat: BuildRecord = { id: "c1", kind: "chat", message: "-heal", value: 2 };
const step: ExpansionRecord = { id: "x1", kind: "copy", from: [2, 181], to: [3, 181], flag: [4, 181] };

describe("ownership", () => {
  const original = trig([scanCondition(low.cell)], [{ ...emptyAction(), type: ActionType.Comment, text: 1 }, flagAction({ cell: heal.flag }), flagAction({ cell: step.flag }), { ...emptyAction(), type: ActionType.PreserveTrigger }]);
  let next = 190;
  const alloc = (): Cell => [0, next++];

  it("finds the triggers that carry a record, and only private records", () => {
    const list = [original, trig([], [{ ...emptyAction(), type: ActionType.Victory }])];
    expect(refs(list, heal)).toEqual([0]);
    expect(refs(list, low)).toEqual([0]);
    expect(refs(list, step)).toEqual([0]);
    expect(refs(list, chat)).toEqual([]);
    expect(sharedElsewhere(list, heal, 0)).toBe(false);
    expect(sharedElsewhere([original, structuredClone(original)], heal, 0)).toBe(true);
  });

  it("gives a duplicate build rows and counter steps of its own, on fresh cells, and leaves the original alone", () => {
    const d = detach(structuredClone(original), [heal, low, chat], [step], alloc);
    expect(d.moved).toBe(3);
    expect(d.stuck).toBe(0);
    // Three new records, the old three kept.
    expect(d.builds).toHaveLength(5);
    expect(d.expansions).toHaveLength(2);
    const [heal2, low2] = d.builds.slice(3);
    const step2 = d.expansions[1];
    expect(heal2.kind).toBe("foreach");
    expect(heal2.id).not.toBe(heal.id);
    expect((heal2 as typeof heal).flag).not.toEqual(heal.flag);
    expect((heal2 as typeof heal).do).toEqual(heal.do);
    expect((low2 as typeof low).cell).not.toEqual(low.cell);
    expect((step2 as typeof step).flag).not.toEqual(step.flag);
    expect(step2.id).not.toBe(step.id);
    // The copy's records point at the new cells and no longer at the old ones.
    expect(d.trigger.actions.some((a) => isFlagAction(a, { cell: (heal2 as typeof heal).flag }))).toBe(true);
    expect(d.trigger.actions.some((a) => isFlagAction(a, { cell: heal.flag }))).toBe(false);
    expect(d.trigger.actions.some((a) => isFlagAction(a, { cell: (step2 as typeof step).flag }))).toBe(true);
    expect(d.trigger.conditions[0]).toMatchObject({ player: (low2 as typeof low).cell[0], unitId: (low2 as typeof low).cell[1] });
    expect(original.actions.some((a) => isFlagAction(a, { cell: heal.flag }))).toBe(true);
    // Editing the copy's row is editing its own record.
    expect(refs([original, d.trigger], heal)).toEqual([0]);
    expect(refs([original, d.trigger], heal2)).toEqual([1]);
  });

  it("leaves a trigger from another map as it is, and counts the rows it could not move", () => {
    const foreign = trig([], [{ ...emptyAction(), type: ActionType.SetDeaths, player: 5, unitId: 200, modifier: 7, target: 1 }]);
    const d = detach(foreign, [heal], [step], alloc);
    expect(d.moved).toBe(0);
    expect(d.builds).toEqual([heal]);
    const none = detach(structuredClone(original), [heal], [], () => null);
    expect(none.stuck).toBe(1);
    expect(none.builds).toEqual([heal]);
    expect(none.trigger.actions.some((a) => isFlagAction(a, { cell: heal.flag }))).toBe(true);
  });

  it("prunes the records only a deleted trigger carried, keeping shared ones and chat commands", () => {
    const copy = structuredClone(original);
    const list = [original, copy];
    expect(prune([heal, low, chat], list, [0])).toEqual([heal, low, chat]);
    expect(prune([heal, low, chat], [original], [0])).toEqual([chat]);
    // A record nothing carries is not touched here.
    const orphan: BuildRecord = { ...heal, id: "b9", flag: [9, 181] };
    expect(prune([orphan], [original], [0])).toEqual([orphan]);
  });

  it("orders the records as the list runs them: by trigger, then by row; stray ones last", () => {
    const text: BuildRecord = { id: "t", kind: "text", flag: [6, 181], parts: [{ text: "hi" }], to: "all" };
    const first = trig([], [flagAction({ cell: text.flag }), flagAction({ cell: heal.flag })]);
    const orphan: BuildRecord = { ...heal, id: "b9", flag: [9, 181] };
    const ordered = orderBuilds([orphan, heal, chat, text, low], [first, original]);
    expect(ordered.map((b) => b.id)).toEqual(["c1", "t", "b1", "s1", "b9"]);
  });
});
