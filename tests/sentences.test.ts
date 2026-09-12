import { describe, expect, it } from "vitest";
import { ActionType, ConditionType, Comparison, SetModifier, emptyAction, emptyCondition } from "../vendor/triggers";
import { ACTION_DEFS, BRIEFING_ACTION_DEFS, CONDITION_DEFS } from "../vendor/triggerDefs";
import { ACTION_TEMPLATES, BRIEFING_TEMPLATES, CONDITION_TEMPLATES, describeAction, describeCondition, sentenceText } from "../src/model/sentences";
import { testNamer } from "./namer";

const namer = testNamer({ strings: [null, "Hello", "Beacon Left"], locations: { 3: "Beacon Left" }, switches: { 0: "Door" }, counters: { "7:0": "Score" } });
const slots = (t: string) => [...t.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();

describe("templates", () => {
  it("every condition type has a template naming exactly its arguments", () => {
    for (const def of CONDITION_DEFS) {
      const t = CONDITION_TEMPLATES[def.type];
      expect(t, def.name).toBeDefined();
      expect(slots(t), def.name).toEqual(def.args.map((a) => a.label).sort());
    }
  });
  it("every action type has one too, and so do the briefing actions", () => {
    for (const def of ACTION_DEFS) {
      const t = ACTION_TEMPLATES[def.type];
      expect(t, def.name).toBeDefined();
      expect(slots(t), def.name).toEqual(def.args.map((a) => a.label).sort());
    }
    for (const def of BRIEFING_ACTION_DEFS) {
      const t = BRIEFING_TEMPLATES[def.type];
      expect(t, def.name).toBeDefined();
      expect(slots(t), def.name).toEqual(def.args.map((a) => a.label).sort());
    }
  });
});

describe("sentences", () => {
  it("reads Bring as a sentence with chips", () => {
    const c = { ...emptyCondition(), type: ConditionType.Bring, player: 0, unitId: 0, location: 3, comparison: Comparison.AtLeast, amount: 1 };
    const s = describeCondition(c, namer);
    expect(sentenceText(s)).toBe("Player 1 brings at least 1 Terran Marine to Beacon Left");
    expect(s.segments.filter((x) => x.kind === "chip").map((x) => x.kind === "chip" && x.arg.kind)).toEqual(["player", "comparison", "amount", "unit", "location"]);
  });
  it("reads Give Units with two player chips", () => {
    const a = { ...emptyAction(), type: ActionType.GiveUnits, player: 7, target: 13, unitId: 0, modifier: 1, location: 3 };
    expect(sentenceText(describeAction(a, namer))).toBe("Give 1 Terran Marine owned by Player 8 at Beacon Left to Current Player");
  });
  it("names a death counter the map has named, and an EUD player as memory", () => {
    const c = { ...emptyCondition(), type: ConditionType.Deaths, player: 7, unitId: 0, comparison: Comparison.AtLeast, amount: 10 };
    expect(sentenceText(describeCondition(c, namer))).toBe("Score is at least 10");
    const a = { ...emptyAction(), type: ActionType.SetDeaths, player: 7, unitId: 0, modifier: SetModifier.Add, target: 1 };
    expect(sentenceText(describeAction(a, namer))).toBe("Set Score up by 1");
    const eud = { ...emptyCondition(), type: ConditionType.Deaths, player: 0x2000, unitId: 0, comparison: Comparison.Exactly, amount: 5 };
    const s = describeCondition(eud, namer);
    expect(sentenceText(s)).toContain("memory at 0x592364");
    expect(s.segments.find((x) => x.kind === "chip" && x.role === "eud")).toBeTruthy();
  });
  it("shows text, the display flag, and an unknown type raw", () => {
    const a = { ...emptyAction(), type: ActionType.DisplayText, text: 1, flags: 4 };
    expect(sentenceText(describeAction(a, namer))).toBe("Display Hello (Always Display)");
    const raw = { ...emptyAction(), type: 99, player: 5 };
    expect(sentenceText(describeAction(raw, namer))).toMatch(/^Action 99: 0, 0, 0, 0, 5/);
  });
});
