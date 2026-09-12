import { describe, expect, it } from "vitest";
import { ActionType, ConditionType } from "../vendor/triggers";
import { actionDef, conditionDef } from "../vendor/triggerDefs";
import { RECIPES, recipeContext } from "../src/model/recipes";
import { describeAction, describeCondition, sentenceText } from "../src/model/sentences";
import { check } from "../src/model/checks";
import { liveActions, liveConditions, owners } from "../src/model/records";
import { testNamer } from "./namer";

describe("recipes", () => {
  const strings: string[] = [""];
  const ctx = recipeContext((t) => { strings.push(t); return strings.length - 1; }, [1, 2]);
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
  it("uses the map's locations where it has them, Anywhere otherwise", () => {
    const give = RECIPES.find((r) => r.id === "beacon-give")!;
    expect(give.build(ctx)[0].conditions[0].location).toBe(1);
    expect(give.build(recipeContext(() => 1, []))[0].conditions[0].location).toBe(64);
    expect(give.build(ctx)[0].conditions[0].type).toBe(ConditionType.Bring);
  });
});
