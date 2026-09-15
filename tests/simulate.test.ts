import { describe, expect, it } from "vitest";
import { ActionType, Comparison, ConditionType, PlayerGroup, ResourceType, SetModifier, SwitchAction, SwitchState, UnitClass, emptyAction, emptyCondition, emptyTrigger, type ActionRecord, type ConditionRecord } from "../vendor/triggers";
import { setOwners } from "../src/model/records";
import { cycle, defaultWorld, evaluate, getDeaths, newState, putUnits, run, verdicts, type SimWorld } from "../src/model/simulate";
import { explain, refsOf, waitSeconds } from "../src/model/explain";

const MARINE = 0, ZERGLING = 37, BARRACKS = 111;
const cond = (patch: Partial<ConditionRecord>): ConditionRecord => ({ ...emptyCondition(), ...patch });
const act = (patch: Partial<ActionRecord>): ActionRecord => ({ ...emptyAction(), ...patch });
const trigger = (owner: number | number[], conditions: ConditionRecord[], actions: ActionRecord[]) => setOwners({ ...emptyTrigger(), conditions, actions }, Array.isArray(owner) ? owner : [owner]);
const always = cond({ type: ConditionType.Always });
const preserve = act({ type: ActionType.PreserveTrigger });
const bring = (player: number, unit: number, location: number, cmp: number, amount: number) => cond({ type: ConditionType.Bring, player, unitId: unit, location, comparison: cmp, amount });

function world(patch: Partial<SimWorld> = {}): SimWorld {
  const w = defaultWorld();
  w.locations = [];
  w.locations[1] = { left: 0, top: 0, right: 64, bottom: 64 };
  w.locations[2] = { left: 64, top: 0, right: 128, bottom: 64 };
  w.locations[64] = { left: 0, top: 0, right: 4096, bottom: 4096 };
  w.active = w.active.map((_, i) => i < 2);
  return { ...w, ...patch };
}

describe("dry run", () => {
  it("counts units at locations, creates, kills, gives and moves them", () => {
    const w = world();
    const s = newState(w);
    putUnits(s, w, 0, MARINE, 2, 1);
    const list = [
      trigger(0, [bring(PlayerGroup.CurrentPlayer, MARINE, 1, Comparison.AtLeast, 2)], [act({ type: ActionType.CreateUnit, player: PlayerGroup.CurrentPlayer, unitId: ZERGLING, modifier: 3, location: 2 })]),
      trigger(0, [bring(0, ZERGLING, 2, Comparison.Exactly, 3)], [act({ type: ActionType.GiveUnits, player: 0, target: 1, unitId: UnitClass.Any, modifier: 1, location: 2 }), act({ type: ActionType.KillUnitAt, player: 0, unitId: ZERGLING, modifier: 1, location: 2 }), act({ type: ActionType.MoveUnit, player: 0, unitId: MARINE, modifier: 0, location: 1, target: 2 })]),
    ];
    expect(cycle(list, s, w)).toEqual([0, 1]);
    expect(s.units.filter((u) => u.owner === 1)).toHaveLength(1);
    expect(getDeaths(s, 0, ZERGLING)).toBe(1);
    expect(evaluate(bring(0, MARINE, 2, Comparison.Exactly, 2), 0, s, w, "k")).toMatchObject({ ok: true, have: 2 });
    expect(evaluate(bring(0, UnitClass.Men, 1, Comparison.Exactly, 0), 0, s, w, "k")).toMatchObject({ ok: true, have: 0 });
    // Both fired once and are spent.
    expect(cycle(list, s, w)).toEqual([]);
  });

  it("tells men from buildings and Any from a type", () => {
    const w = world();
    const s = newState(w);
    putUnits(s, w, 0, MARINE, 1, 1);
    putUnits(s, w, 0, BARRACKS, 1, 1);
    expect(evaluate(bring(0, UnitClass.Buildings, 1, Comparison.Exactly, 1), 0, s, w, "k").have).toBe(1);
    expect(evaluate(bring(0, UnitClass.Men, 1, Comparison.Exactly, 1), 0, s, w, "k").have).toBe(1);
    expect(evaluate(bring(0, UnitClass.Any, 1, Comparison.Exactly, 2), 0, s, w, "k").have).toBe(2);
    expect(evaluate(cond({ type: ConditionType.Command, player: 0, unitId: MARINE, comparison: Comparison.AtLeast, amount: 1 }), 0, s, w, "k").ok).toBe(true);
  });

  it("holds a player's triggers during a Wait and goes on after it", () => {
    const w = world();
    const s = newState(w);
    const list = [
      trigger(0, [always], [act({ type: ActionType.Wait, time: 3000 }), act({ type: ActionType.SetSwitch, target: 1, modifier: SwitchAction.Set })]),
      trigger(0, [always], [act({ type: ActionType.SetSwitch, target: 2, modifier: SwitchAction.Set })]),
      trigger(1, [always], [act({ type: ActionType.SetSwitch, target: 3, modifier: SwitchAction.Set })]),
    ];
    cycle(list, s, w);
    expect([...s.switches]).toEqual([3]);
    expect(s.players[0].wait).toMatchObject({ trigger: 0, action: 1 });
    cycle(list, s, w); // 2 s: still waiting
    expect(s.switches.has(1)).toBe(false);
    cycle(list, s, w); // 4 s: the wait is over, the rest of the actions and the next trigger run
    expect(s.switches.has(1)).toBe(true);
    expect(s.switches.has(2)).toBe(true);
    expect(s.log.filter((e) => e.kind === "wait")).toHaveLength(1);
  });

  it("runs the countdown timer, elapsed time, resources and scores", () => {
    const w = world();
    const s = newState(w);
    const list = [
      trigger(0, [always], [act({ type: ActionType.SetCountdownTimer, modifier: SetModifier.SetTo, time: 10 }), act({ type: ActionType.SetResources, player: PlayerGroup.AllPlayers, modifier: SetModifier.Add, target: 50, unitId: ResourceType.Ore }), act({ type: ActionType.SetScore, player: 0, modifier: SetModifier.SetTo, target: 7, unitId: 7 })]),
      trigger(0, [cond({ type: ConditionType.CountdownTimer, comparison: Comparison.AtMost, amount: 5 }), cond({ type: ConditionType.ElapsedTime, comparison: Comparison.AtLeast, amount: 4 })], [act({ type: ActionType.Victory })]),
    ];
    run(list, s, w, 20);
    expect(s.players[0].minerals).toBe(50);
    expect(s.players[1].minerals).toBe(50);
    expect(evaluate(cond({ type: ConditionType.Score, player: 0, resource: 0, comparison: Comparison.Exactly, amount: 7 }), 0, s, w, "k").ok).toBe(true);
    expect(evaluate(cond({ type: ConditionType.Accumulate, player: 1, resource: ResourceType.OreAndGas, comparison: Comparison.Exactly, amount: 50 }), 0, s, w, "k").ok).toBe(true);
    expect(s.players[0].result).toBe("victory");
    expect(s.log.find((e) => e.kind === "end")).toMatchObject({ cycle: 4, player: 0 });
    // The timer counted down from 10 while the clock ran.
    expect(s.countdown).toBeLessThanOrEqual(5);
  });

  it("reports what it cannot know and takes the assumption", () => {
    const w = world({ unknownCells: new Set([5 + 181 * 12]) });
    const s = newState(w);
    const list = [trigger(0, [cond({ type: ConditionType.Deaths, player: 5, unitId: 181, comparison: Comparison.AtLeast, amount: 1 })], [act({ type: ActionType.SetSwitch, target: 0, modifier: SwitchAction.Set })])];
    cycle(list, s, w);
    expect(s.switches.has(0)).toBe(false);
    expect([...s.unknown.keys()]).toEqual(["0:0"]);
    s.assumptions.set("0:0", true);
    cycle(list, s, w);
    expect(s.switches.has(0)).toBe(true);
    // An EUD read no trigger wrote is unknown too; once written, it is a value.
    const eud = cond({ type: ConditionType.Deaths, player: 1000, unitId: 0, comparison: Comparison.AtLeast, amount: 1 });
    expect(evaluate(eud, 0, s, w, "x").known).toBe(false);
    s.deaths.set(1000, 3);
    expect(evaluate(eud, 0, s, w, "x")).toMatchObject({ known: true, have: 3, ok: true });
  });

  it("resolves owners through All Players and a force, and Foes through the alliances", () => {
    const w = world();
    w.force = w.force.map((_, i) => (i < 2 ? 0 : -1));
    const s = newState(w);
    const list = [
      trigger(PlayerGroup.Force1, [always], [act({ type: ActionType.SetDeaths, player: PlayerGroup.CurrentPlayer, unitId: 181, modifier: SetModifier.Add, target: 1 })]),
      trigger(PlayerGroup.AllPlayers, [cond({ type: ConditionType.Opponents, player: PlayerGroup.CurrentPlayer, comparison: Comparison.AtLeast, amount: 1 })], [act({ type: ActionType.SetAllianceStatus, player: PlayerGroup.Foes, unitId: 1 })]),
    ];
    cycle(list, s, w);
    expect(getDeaths(s, 0, 181)).toBe(1);
    expect(getDeaths(s, 1, 181)).toBe(1);
    expect(s.allied[0][1]).toBe(true);
    expect(s.allied[1][0]).toBe(true);
  });

  it("gives every condition of a trigger a verdict with the value it saw", () => {
    const w = world();
    const s = newState(w);
    putUnits(s, w, 0, MARINE, 1, 1);
    const t = trigger(0, [bring(0, MARINE, 1, Comparison.AtLeast, 2), cond({ type: ConditionType.Switch, resource: 4, comparison: SwitchState.Set })], []);
    expect(verdicts([t], 0, 0, s, w)).toEqual([{ condition: 0, verdict: { ok: false, known: true, have: 1 } }, { condition: 1, verdict: { ok: false, known: true } }]);
  });

  it("stops a run when the game is over or nothing moves", () => {
    const w = world();
    const s = newState(w);
    expect(run([trigger(0, [always], [preserve])], s, w, 500, 10)).toBe(500);
    const s2 = newState(w);
    expect(run([trigger(0, [cond({ type: ConditionType.Never })], [])], s2, w, 500, 10)).toBe(10);
  });
});

describe("explain", () => {
  const names = { player: (g: number) => (g < 12 ? `Player ${g + 1}` : g === PlayerGroup.AllPlayers ? "All Players" : g === PlayerGroup.CurrentPlayer ? "Current Player" : `group ${g}`), everyFrame: false };

  it("says who runs it, when, what, and how often", () => {
    const t = trigger([0, 1], [bring(PlayerGroup.CurrentPlayer, MARINE, 1, Comparison.AtLeast, 1), cond({ type: ConditionType.Switch, resource: 0, comparison: SwitchState.Set })], [act({ type: ActionType.Comment, text: 1 }), act({ type: ActionType.SetSwitch, target: 0, modifier: SwitchAction.Clear }), act({ type: ActionType.Wait, time: 1500 }), preserve]);
    const x = explain(t, 0, [t], { ...names, conditions: ["Current Player brings at least 1 Marine to Beacon", "Switch 1 is set"], actions: ["", "Set Switch 1 to cleared", "Wait 1500 milliseconds", "Preserve trigger"] });
    expect(x.lines).toEqual([
      "Player 1 and Player 2 each run this trigger on their own.",
      "It fires when Current Player brings at least 1 Marine to Beacon and Switch 1 is set both hold.",
      "Then: set Switch 1 to cleared; wait 1500 milliseconds.",
      "It is preserved, so it fires again on every cycle (every two seconds) its conditions hold.",
      "Its Waits hold the owner's other triggers for 1.5 seconds in all, every time it fires.",
      "Current Player is whichever owner is running it.",
    ]);
    expect(waitSeconds(t)).toBe(1.5);
  });

  it("handles the plain cases: no owner, Always, Never, once", () => {
    const none = setOwners(trigger(0, [always], [act({ type: ActionType.Victory })]), []);
    expect(explain(none, 0, [none], { ...names, conditions: ["Always"], actions: ["End the game in victory"] }).lines[0]).toBe("No player owns this trigger, so it never runs.");
    const once = trigger(PlayerGroup.AllPlayers, [always], [act({ type: ActionType.Victory })]);
    expect(explain(once, 0, [once], { ...names, conditions: ["Always"], actions: ["End the game in victory"] }).lines).toEqual(["Every player runs this trigger, each on their own.", "It fires on the first cycle.", "Then: end the game in victory.", "It fires once for each owner and then stops."]);
    const never = trigger(0, [cond({ type: ConditionType.Never })], []);
    expect(explain(never, 0, [never], { ...names, conditions: ["Never"], actions: [] }).lines).toEqual(["Player 1 runs this trigger.", "A Never condition means it never fires."]);
  });

  it("finds the switches, counters, locations and timer other triggers share", () => {
    const a = trigger(0, [cond({ type: ConditionType.Switch, resource: 3, comparison: SwitchState.Set })], [act({ type: ActionType.SetDeaths, player: 0, unitId: 181, modifier: SetModifier.Add, target: 1 }), act({ type: ActionType.MoveLocation, player: 0, unitId: MARINE, location: 1, target: 2 })]);
    const b = trigger(0, [cond({ type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: 181, comparison: Comparison.AtLeast, amount: 5 }), bring(0, MARINE, 2, Comparison.AtLeast, 1)], [act({ type: ActionType.SetSwitch, target: 3, modifier: SwitchAction.Set }), act({ type: ActionType.SetCountdownTimer, modifier: SetModifier.SetTo, time: 30 })]);
    const c = trigger(1, [cond({ type: ConditionType.CountdownTimer, comparison: Comparison.Exactly, amount: 0 })], [act({ type: ActionType.SetSwitch, target: 3, modifier: SwitchAction.Clear })]);
    const refs = refsOf([a, b, c], 0);
    expect(refs.map((r) => [r.kind, r.id, r.use, r.others])).toEqual([
      ["switch", 3, "reads", [{ index: 1, use: "writes" }, { index: 2, use: "writes" }]],
      ["counter", 181 * 12 + 0, "writes", [{ index: 1, use: "reads" }]],
      ["location", 2, "writes", [{ index: 1, use: "reads" }]],
    ]);
    // b's timer write is shared with c's read; a's location 1 is read only, so it is left out.
    expect(refsOf([a, b, c], 1).find((r) => r.kind === "timer")).toEqual({ kind: "timer", id: 0, use: "writes", others: [{ index: 2, use: "reads" }] });
    expect(refsOf([a, b, c], 0).some((r) => r.kind === "location" && r.id === 1)).toBe(false);
    // A run belongs to its anchor: c's read of the timer counted as b's makes it b's own, so it is no longer shared.
    expect(refsOf([a, b, c], 1, (i) => (i === 2 ? 1 : i)).find((r) => r.kind === "timer")?.others).toEqual([]);
  });
});
