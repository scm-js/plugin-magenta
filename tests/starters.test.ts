import { describe, expect, it } from "vitest";
import { ActionType, ConditionType, PlayerGroup, UnitClass } from "../vendor/triggers";
import { starters } from "../src/model/starters";
import { owners } from "../src/model/records";
import { recognizeAction } from "../src/model/eud";

const strings: string[] = [""];
const intern = (t: string) => { strings.push(t); return strings.length - 1; };

describe("starters", () => {
  it("offers the unit's and the location's triggers, with the map's objects in the chips", () => {
    const list = starters({ unit: { unitId: 7, owner: 2, slot: 1699, name: "SCV", ownerName: "Player 3" }, location: { number: 5, name: "Base" } });
    expect(list.map((s) => s.id)).toEqual(["unit-dies", "unit-brought", "unit-give", "unit-hp", "loc-comes", "loc-create", "loc-clear"]);
    const dies = list[0].build(intern)[0];
    expect(owners(dies)).toEqual([2]);
    expect(dies.conditions[0]).toMatchObject({ type: ConditionType.Deaths, player: 2, unitId: 7, amount: 1 });
    expect(strings[dies.actions[0].text]).toBe("When the SCV dies");
    const brought = list[1].build(intern)[0];
    expect(brought.conditions[0]).toMatchObject({ type: ConditionType.Bring, player: 2, unitId: 7, location: 5 });
    const give = list[2].build(intern)[0];
    expect(owners(give)).toEqual([PlayerGroup.AllPlayers]);
    expect(give.actions[1]).toMatchObject({ type: ActionType.GiveUnits, player: 2, target: PlayerGroup.CurrentPlayer, unitId: 7, location: 5 });
    const hp = list[3].build(intern)[0];
    const row = recognizeAction(hp.actions[1]);
    expect(row?.entry.id).toBe("cunit.hp");
    expect(row?.args.index).toBe(1699);
    const comes = list[4].build(intern)[0];
    expect(comes.conditions[0]).toMatchObject({ type: ConditionType.Bring, player: PlayerGroup.CurrentPlayer, unitId: UnitClass.Any, location: 5 });
    expect(list[6].build(intern)[0].actions[1]).toMatchObject({ type: ActionType.KillUnitAt, player: PlayerGroup.AllPlayers, location: 5 });
  });

  it("gives a neutral unit's trigger to Player 1 and leaves the location items out without one", () => {
    const list = starters({ unit: { unitId: 0, owner: 11, slot: 0, name: "Marine", ownerName: "Player 12" }, location: null });
    expect(list.map((s) => s.id)).toEqual(["unit-dies", "unit-give", "unit-hp"]);
    expect(owners(list[0].build(intern)[0])).toEqual([PlayerGroup.Player1]);
    expect(list[0].build(intern)[0].conditions[0].player).toBe(11);
    expect(starters({})).toEqual([]);
  });
});
