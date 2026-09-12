import { describe, expect, it } from "vitest";
import { ActionType, ConditionType, Comparison, PlayerGroup, SetModifier } from "../vendor/triggers";
import { PLAYER_GROUP_CHOICES } from "../vendor/triggerDefs";
import { UNIT_NAMES } from "../vendor/units";
import { entry } from "../src/catalogue";
import { lowerAction, recognizeAction } from "../src/model/eud";
import { fillAction, fillCondition, fillEud, parseQuery, type ParseNames } from "../src/model/parse";

const names: ParseNames = {
  units: UNIT_NAMES.map((label, value) => ({ value, label })).concat([{ value: 228, label: "Any unit" }]),
  locations: [{ value: 1, label: "Beacon" }, { value: 2, label: "Spawn Point" }, { value: 64, label: "Anywhere" }],
  players: PLAYER_GROUP_CHOICES.map((c) => ({ value: c.value, label: c.label, aliases: c.aliases })),
  weapons: [{ value: 0, label: "Gauss Rifle" }, { value: 3, label: "Fusion Cutter" }],
  switches: [{ value: 0, label: "Door" }],
};
const blankAction = (type: number) => ({ location: 0, text: 0, wav: 0, time: 0, player: 0, target: 0, unitId: 0, type, modifier: 0, flags: 0, padding: 0, mask: 0 });
const blankCondition = (type: number) => ({ location: 0, player: 0, amount: 0, unitId: 0, comparison: 0, type, resource: 0, flags: 0, mask: 0 });

describe("parsing the add row", () => {
  it("picks units, players, locations and numbers out, longest names first", () => {
    const p = parseQuery("give 3 zealots to player 2 at beacon", names);
    expect(p.entities.map((e) => `${e.kind}:${e.value}`)).toEqual(["number:3", "unit:65", "modifier:7", "player:1", "location:1"]);
    expect(p.rest).toBe("give");
    const q = parseQuery("high templar hp 80", names);
    expect(q.entities.map((e) => `${e.kind}:${e.value}`)).toEqual(["unit:67", "number:80"]);
    expect(q.rest).toBe("hp");
  });
  it("knows player words and comparison words", () => {
    const p = parseQuery("current player brings at least 1 marine to spawn point", names);
    expect(p.entities.map((e) => e.kind)).toEqual(["player", "comparison", "number", "unit", "modifier", "location"]);
    expect(p.entities[0].value).toBe(PlayerGroup.CurrentPlayer);
    expect(p.rest).toBe("brings");
  });
  it("fills a native action in argument order", () => {
    const p = parseQuery("give 3 zealots to player 2 at beacon", names);
    const a = fillAction({ ...blankAction(ActionType.GiveUnits), player: 7, target: 13, modifier: 1, location: 64 }, p.entities);
    // Give Units: From, To, Unit, Count, Location — "to player 2" is the To chip; From keeps its default.
    expect(a.player).toBe(7);
    expect(a.target).toBe(1);
    expect(a.unitId).toBe(65);
    expect(a.modifier).toBe(3);
    expect(a.location).toBe(1);
  });
  it("fills a native condition", () => {
    const p = parseQuery("player 1 brings at least 2 marines to beacon", names);
    const c = fillCondition(blankCondition(ConditionType.Bring), p.entities);
    expect(c).toMatchObject({ player: 0, comparison: Comparison.AtLeast, amount: 2, unitId: 0, location: 1 });
  });
  it("fills a catalogue row: the unit, the value, the modifier, a choice word", () => {
    const p = parseQuery("marine max hp 80", names);
    const row = fillEud(entry("unit.maxHp")!, "action", p.entities, "marine max hp 80");
    expect(row.args).toEqual({ unit: 0 });
    expect(row.value).toBe(80);
    expect(row.op).toBe(SetModifier.SetTo);
    expect(recognizeAction(lowerAction(row))?.value).toBe(80);
    const g = parseQuery("gauss rifle damage up by 5", names);
    const gr = fillEud(entry("weapon.damage")!, "action", g.entities, "gauss rifle damage up by 5");
    expect(gr).toMatchObject({ args: { weapon: 0 }, value: 5, op: SetModifier.Add });
    const s = parseQuery("game speed fastest", names);
    expect(fillEud(entry("game.speed")!, "action", s.entities, "game speed fastest").value).toBe(6);
    const k = parseQuery("a key pressed", names);
    expect(fillEud(entry("game.key")!, "condition", k.entities, "a key pressed")).toMatchObject({ args: { key: 0x41 }, value: 1 });
  });
  it("puts 'from player 1 to player 2' where the words say, and a lone player on the first chip", () => {
    const p = parseQuery("give all units from player 1 to player 2", names);
    const a = fillAction({ ...blankAction(ActionType.GiveUnits), player: 7, target: 13 }, p.entities);
    expect([a.player, a.target]).toEqual([0, 1]);
    const m = parseQuery("move 2 marines owned by player 3 from beacon to spawn point", names);
    const mv = fillAction({ ...blankAction(ActionType.MoveUnit), player: 13 }, m.entities);
    expect([mv.player, mv.location, mv.target, mv.modifier, mv.unitId]).toEqual([2, 1, 2, 2, 0]);
    const k = parseQuery("kill all zealots for player 4", names);
    expect(fillAction(blankAction(ActionType.KillUnit), k.entities)).toMatchObject({ player: 3, unitId: 65 });
  });
  it("does not mistake a unit's name for a modifier word, or 'max hp' for a comparison", () => {
    const p = parseQuery("remove all marines for player 1", names);
    expect(p.entities.map((e) => e.kind)).toEqual(["unit", "player"]);
    expect(p.rest).toBe("remove all");
    const c = parseQuery("marine max hp is at least 80", names);
    expect(c.entities.map((e) => e.kind)).toEqual(["unit", "comparison", "number"]);
    expect(fillEud(entry("unit.maxHp")!, "condition", c.entities, "marine max hp is at least 80")).toMatchObject({ value: 80, op: Comparison.AtLeast });
  });
});
