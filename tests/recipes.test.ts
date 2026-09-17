import { describe, expect, it } from "vitest";
import { ActionType, Comparison, ConditionType, PlayerGroup, SetModifier, emptyCondition } from "../vendor/triggers";
import { entry } from "../src/catalogue";
import { lowerCondition } from "../src/model/eud";
import { actionDef, conditionDef } from "../vendor/triggerDefs";
import { RECIPES, recipeContext } from "../src/model/recipes";
import { describeAction, describeCondition, sentenceText } from "../src/model/sentences";
import { check } from "../src/model/checks";
import { liveActions, liveConditions, owners } from "../src/model/records";
import { testNamer } from "./namer";

describe("recipes", () => {
  const strings: string[] = [""];
  const asked: string[] = [];
  const ctx = recipeContext((t) => { strings.push(t); return strings.length - 1; }, [1, 2], (what, options) => { asked.push(`${what}:${options?.code ?? ""}`); return { ...emptyCondition(), type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: 184, comparison: Comparison.AtLeast, amount: 1 }; });
  const namer = testNamer({ strings, locations: { 1: "Beacon", 2: "Spawn" } });

  it("build titled, owned triggers of known types that read as sentences and pass the checks", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      const triggers = r.build(ctx);
      expect(triggers.length, r.id).toBeGreaterThan(0);
      for (const t of triggers) {
        expect(owners(t).length, r.id).toBeGreaterThan(0);
        expect(t.actions[0].type, r.id).toBe(ActionType.Comment);
        expect(liveConditions(t).length, r.id).toBeGreaterThan(0);
        for (const c of liveConditions(t)) { expect(conditionDef(c.type), r.id).toBeDefined(); expect(sentenceText(describeCondition(c, namer))).not.toMatch(/^Condition \d/); }
        for (const a of liveActions(t)) { expect(actionDef(a.type), r.id).toBeDefined(); expect(sentenceText(describeAction(a, namer))).not.toMatch(/^Action \d/); }
        const problems = check(t, { locationExists: (n) => n <= 2 || n === 64, stringExists: (i) => i < strings.length }).filter((p) => p.level === "error");
        expect(problems, `${r.id}: ${problems.map((p) => p.text).join("; ")}`).toEqual([]);
      }
    }
  });
  it("asks for a synced key for the key recipe, and builds nothing when the map has no room for one", () => {
    const key = RECIPES.find((r) => r.id === "key-minerals")!;
    expect(key.needsBuild).toBe(true);
    expect(key.everyFrame).toBeFalsy();
    asked.length = 0;
    const [t] = key.build(ctx);
    expect(asked).toEqual(["key:77"]);
    expect(t.conditions[0]).toMatchObject({ type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: 184 });
    expect(t.actions.find((a) => a.type === ActionType.SetResources)).toMatchObject({ player: PlayerGroup.CurrentPlayer, modifier: SetModifier.Add, target: 100 });
    expect(key.build(recipeContext(() => 1, [1]))).toEqual([]);
    // The shape it replaced — a local keyboard read feeding minerals — is what the checks now warn about.
    const local = { ...t, conditions: [lowerCondition({ entry: entry("game.key")!, args: { key: 0x4d }, value: 1, op: Comparison.Exactly })] };
    expect(check(local).some((p) => p.text.includes("out of sync"))).toBe(true);
    expect(check(t).some((p) => p.text.includes("out of sync"))).toBe(false);
  });
  it("uses the map's locations where it has them, Anywhere otherwise", () => {
    const give = RECIPES.find((r) => r.id === "beacon-give")!;
    expect(give.build(ctx)[0].conditions[0].location).toBe(1);
    expect(give.build(recipeContext(() => 1, []))[0].conditions[0].location).toBe(64);
    expect(give.build(ctx)[0].conditions[0].type).toBe(ConditionType.Bring);
  });
});
