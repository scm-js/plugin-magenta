/**
 * With a mod's data set: unit ids past 232 are the mod's units, not classes, through a picker, a build row's filter,
 * the stored data, the rendered TrigScript and the dry run; the EUD catalogue stays on the game's own tables, and a
 * trigger with memory rows says so in one sentence.
 */
import { describe, expect, it } from "vitest";
import { ActionType, Comparison, ConditionType, PlayerGroup, UnitClass, emptyAction, emptyCondition, emptyTrigger, type ActionRecord, type ConditionRecord } from "../vendor/triggers";
import { DEFAULT_OPTIONS, filterUnit, type BuildRecord } from "../src/model/builds";
import { check } from "../src/model/checks";
import { flagAction } from "../src/model/expansions";
import { isUnitClass, unitChoices } from "../src/model/names";
import { preflight } from "../src/model/preflight";
import { setOwners } from "../src/model/records";
import { decodeSidecar, emptySidecar, encodeSidecar, type Sidecar } from "../src/model/sidecar";
import { cycle, defaultWorld, evaluate, newState, putUnits } from "../src/model/simulate";
import { renderScript } from "../src/model/trigscript";

/** Cosmonarchy's unit 332, "Terran Civilian" there; StarEdit's Terran Civilian is 15. */
const CIVILIAN = 332;
const cond = (patch: Partial<ConditionRecord>): ConditionRecord => ({ ...emptyCondition(), ...patch });
const act = (patch: Partial<ActionRecord>): ActionRecord => ({ ...emptyAction(), ...patch });
const trigger = (conditions: ConditionRecord[], actions: ActionRecord[]) => setOwners({ ...emptyTrigger(), conditions, actions }, [0]);

describe("a mod's units", () => {
  // api.names.units() as the editor lists it for a data set of 650 types: 0–227, None, the classes, then 233 on.
  const names = [...Array.from({ length: 228 }, (_, value) => ({ value })), ...[228, 229, 230, 231, 232].map((value) => ({ value })), ...Array.from({ length: 650 - 233 }, (_, i) => ({ value: 233 + i }))];

  it("are units in a picker; the classes are 228–232 only, and an EUD field stops at the game's 228", () => {
    expect([228, 229, 230, 231, 232].every(isUnitClass)).toBe(true);
    expect(isUnitClass(227) || isUnitClass(233) || isUnitClass(CIVILIAN)).toBe(false);
    const all = unitChoices(names, { classes: true });
    expect(all.classes.map((u) => u.value)).toEqual([228, 229, 230, 231, 232]);
    expect(all.units.some((u) => u.value === CIVILIAN)).toBe(true);
    expect(all.units).toHaveLength(650 - 5);
    const setDeaths = unitChoices(names, { classes: false });
    expect(setDeaths.classes).toEqual([]);
    expect(setDeaths.units.some((u) => u.value === CIVILIAN)).toBe(true);
    const eud = unitChoices(names, { classes: false, max: 228 });
    expect(eud.units.map((u) => u.value)).toEqual(Array.from({ length: 228 }, (_, i) => i));
  });

  it("stays the unit through a build row: the chip's pick, the stored data and the rendered TrigScript", () => {
    expect(filterUnit(CIVILIAN)).toBe(CIVILIAN);
    expect(filterUnit(UnitClass.Any)).toBeNull();
    expect(filterUnit(228)).toBeNull();
    expect(filterUnit(UnitClass.Men)).toBe(UnitClass.Men);
    expect(filterUnit(0)).toBe(0);
    const row: BuildRecord = { id: "f1", kind: "foreach", flag: [0, 181], unit: filterUnit(CIVILIAN), owner: 0, location: null, do: { set: "hp", value: 100 } };
    const count: BuildRecord = { id: "c1", kind: "count", flag: [1, 181], unit: filterUnit(CIVILIAN), owner: null, location: null, to: [8, 181] };
    const sc: Sidecar = { ...emptySidecar(), builds: [row, count] };
    const back = decodeSidecar(encodeSidecar(sc));
    expect(back.builds).toEqual([row, count]);
    expect(back.builds.map((b) => ("unit" in b ? b.unit : undefined))).toEqual([CIVILIAN, CIVILIAN]);
    const r = renderScript({ builds: back.builds, chat: null, msqc: null, options: DEFAULT_OPTIONS, humans: [0], owner: 0, bounds: () => null });
    expect(r.unsupported).toEqual([]);
    expect(r.source).toContain(`for (const u of allUnits({ type: (${CIVILIAN} as UnitType), owner: P1 })) {`);
    expect(r.source).toContain(`for (const u of allUnits({ type: (${CIVILIAN} as UnitType) })) n += 1;`);
    expect(r.source).not.toContain("allUnits()");
  });

  it("are units in the dry run, not a class", () => {
    const w = defaultWorld();
    w.locations = [];
    w.locations[1] = { left: 0, top: 0, right: 64, bottom: 64 };
    w.locations[64] = { left: 0, top: 0, right: 4096, bottom: 4096 };
    w.active = w.active.map((_, i) => i === 0);
    const s = newState(w);
    putUnits(s, w, 0, 0, 2, 1);
    const bring = (unitId: number) => cond({ type: ConditionType.Bring, player: 0, unitId, location: 1, comparison: Comparison.AtLeast, amount: 1 });
    expect(evaluate(bring(CIVILIAN), 0, s, w, "k")).toMatchObject({ ok: false, have: 0 });
    cycle([trigger([cond({ type: ConditionType.Always })], [act({ type: ActionType.CreateUnit, player: 0, unitId: CIVILIAN, modifier: 3, location: 1 })])], s, w);
    expect(evaluate(bring(CIVILIAN), 0, s, w, "k")).toMatchObject({ ok: true, have: 3 });
    expect(evaluate(bring(UnitClass.Any), 0, s, w, "k").have).toBe(5);
  });
});

describe("a mod's data set and the game's memory", () => {
  const eudWrite = act({ type: ActionType.SetDeaths, player: 0x30000, target: 1 });
  const plain = trigger([cond({ type: ConditionType.Always })], [act({ type: ActionType.Victory })]);
  const SENTENCE = "they may not work with Cosmonarchy BW";

  it("puts one sentence on a trigger with EUD rows, and none on the game's own data", () => {
    const eud = trigger([cond({ type: ConditionType.Always })], [eudWrite, eudWrite]);
    const mod = check(eud, { modDataSet: "Cosmonarchy BW" }).filter((p) => p.text.includes(SENTENCE));
    expect(mod).toHaveLength(1);
    expect(mod[0]).toMatchObject({ level: "info" });
    expect(mod[0].at).toBeUndefined();
    expect(check(eud, {}).some((p) => p.text.includes("memory layout"))).toBe(false);
    expect(check(eud, { modDataSet: null }).some((p) => p.text.includes("memory layout"))).toBe(false);
    expect(check(plain, { modDataSet: "Cosmonarchy BW" })).toEqual([]);
  });

  it("says it of a build row too, and of a death count past the game's 228", () => {
    const hooked = trigger([cond({ type: ConditionType.Always })], [act({ type: ActionType.SetDeaths, player: 0, unitId: 181, target: 1 })]);
    expect(check(hooked, { modDataSet: "Cosmonarchy BW", buildRow: (kind, i) => kind === "action" && i === 0 }).some((p) => p.text.includes(SENTENCE))).toBe(true);
    const deaths = trigger([cond({ type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: CIVILIAN, comparison: Comparison.AtLeast, amount: 1 })], [act({ type: ActionType.Victory })]);
    const problems = check(deaths, { modDataSet: "Cosmonarchy BW" });
    expect(problems.find((p) => p.text.includes("228 unit types"))?.at).toEqual({ kind: "condition", index: 0 });
    expect(problems.some((p) => p.text.includes(SENTENCE))).toBe(false);
    expect(check(deaths, {})).toEqual([]);
  });

  it("puts the sentence in the Build dialog when the map has build rows", () => {
    const heal: BuildRecord = { id: "b1", kind: "foreach", flag: [0, 181], unit: CIVILIAN, owner: 0, location: null, do: { adjust: "hp", delta: 20 } };
    const base = { list: [setOwners({ ...emptyTrigger(), actions: [flagAction({ cell: heal.flag })] }, [0])], sidecar: { ...emptySidecar(), builds: [heal] }, options: DEFAULT_OPTIONS, locations: [], soundPresent: () => true, rendered: { unsupported: [], notes: [] }, trigscript: true };
    expect(preflight(base)).toEqual([]);
    expect(preflight({ ...base, modDataSet: "Cosmonarchy BW" })).toMatchObject([{ level: "info" }]);
    expect(preflight({ ...base, sidecar: emptySidecar(), modDataSet: "Cosmonarchy BW" })).toEqual([]);
  });
});
