import { describe, expect, it } from "vitest";
import { ActionType, ConditionType, Comparison, PlayerGroup, emptyAction, emptyCondition, emptyTrigger, TriggerFlag } from "../vendor/triggers";
import { allocate, cellKey, playerSlots, usage } from "../src/model/counters";
import { check } from "../src/model/checks";
import { search } from "../src/model/search";
import { decodeSidecar, encodeSidecar, folderOf, readSidecar, withFolders, type Sidecar } from "../src/model/sidecar";
import { fingerprint, isTriggerDisabled, setTriggerDisabled, setOwners } from "../src/model/records";

const trig = (owners: number[], conditions: Partial<ReturnType<typeof emptyCondition>>[], actions: Partial<ReturnType<typeof emptyAction>>[]) =>
  setOwners({ ...emptyTrigger(), conditions: conditions.map((c) => ({ ...emptyCondition(), ...c })), actions: actions.map((a) => ({ ...emptyAction(), ...a })) }, owners);

describe("counters", () => {
  it("expands player groups to the slots they can mean", () => {
    expect(playerSlots(3, [])).toEqual([3]);
    expect(playerSlots(PlayerGroup.CurrentPlayer, [3, 0])).toEqual([0, 3]);
    expect(playerSlots(PlayerGroup.CurrentPlayer, [PlayerGroup.Force1])).toHaveLength(12);
    expect(playerSlots(PlayerGroup.AllPlayers, [])).toHaveLength(12);
    expect(playerSlots(PlayerGroup.None, [])).toEqual([]);
    expect(playerSlots(0x2000, [])).toEqual([]);
  });
  it("scans what the triggers use, and allocates around it", () => {
    const list = [
      trig([0], [{ type: ConditionType.Deaths, player: 0, unitId: 181, amount: 1 }], [{ type: ActionType.SetDeaths, player: PlayerGroup.CurrentPlayer, unitId: 182, target: 1 }, { type: ActionType.SetSwitch, target: 3, modifier: 4 }]),
    ];
    const u = usage(list);
    expect(u.cells.has(cellKey(0, 181))).toBe(true);
    expect(u.cells.has(cellKey(0, 182))).toBe(true);
    expect(u.cells.has(cellKey(1, 182))).toBe(false);
    expect([...u.switches]).toEqual([3]);
    expect(allocate(u.cells)).toEqual([1, 181]);
    expect(allocate(u.cells, new Set([181]))).toEqual([1, 182]);
  });
});

describe("checks", () => {
  it("warns when a trigger every player runs guards Current Player conditions with a shared switch", () => {
    const shared = trig([PlayerGroup.AllPlayers], [{ type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: 181, comparison: Comparison.AtLeast, amount: 1 }, { type: ConditionType.Switch, resource: 1, comparison: 3 }], [{ type: ActionType.SetSwitch, target: 1, modifier: 4 }, { type: ActionType.PreserveTrigger }]);
    expect(check(shared).some((p) => p.text.includes("switch is shared"))).toBe(true);
    const own = trig([0], [{ type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: 181, comparison: Comparison.AtLeast, amount: 1 }, { type: ConditionType.Switch, resource: 1, comparison: 3 }], [{ type: ActionType.SetSwitch, target: 1, modifier: 4 }, { type: ActionType.PreserveTrigger }]);
    expect(check(own).some((p) => p.text.includes("switch is shared"))).toBe(false);
    const counter = trig([PlayerGroup.AllPlayers], [{ type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: 181, comparison: Comparison.AtLeast, amount: 1 }, { type: ConditionType.Deaths, player: PlayerGroup.CurrentPlayer, unitId: 182, comparison: Comparison.Exactly, amount: 0 }], [{ type: ActionType.SetDeaths, player: PlayerGroup.CurrentPlayer, unitId: 182, target: 1 }, { type: ActionType.PreserveTrigger }]);
    expect(check(counter).some((p) => p.text.includes("switch is shared"))).toBe(false);
  });
  it("finds the trigger that never fires and the Wait in a preserved trigger", () => {
    const t = trig([0], [{ type: ConditionType.Never }, { type: ConditionType.Bring, player: 0, comparison: Comparison.AtLeast, amount: 5, location: 1 }, { type: ConditionType.Bring, player: 0, comparison: Comparison.AtMost, amount: 3, location: 1 }], [{ type: ActionType.Wait, time: 1000 }, { type: ActionType.PreserveTrigger }]);
    const texts = check(t).map((p) => p.text);
    expect(texts.some((x) => x.includes("Never"))).toBe(true);
    expect(texts.some((x) => x.includes("contradict"))).toBe(true);
    expect(texts.some((x) => x.includes("Wait in a preserved"))).toBe(true);
  });
  it("finds missing objects and unknown memory", () => {
    const t = trig([], [], [{ type: ActionType.CenterView, location: 9 }, { type: ActionType.DisplayText, text: 0 }, { type: ActionType.SetDeaths, player: 0x30000, target: 1 }]);
    const problems = check(t, { locationExists: (n) => n < 5 });
    expect(problems.find((p) => p.text.includes("No player"))).toBeTruthy();
    expect(problems.find((p) => p.text.includes("no longer has"))?.at).toEqual({ kind: "action", index: 0 });
    expect(problems.find((p) => p.text.includes("no text"))).toBeTruthy();
    expect(problems.find((p) => p.text.includes("catalogue does not know"))).toBeTruthy();
    expect(check(trig([0], [], [{ type: ActionType.Victory }]), {})).toEqual([]);
  });
  it("flags a preserved-by-flag trigger too", () => {
    const t = { ...trig([0], [], [{ type: ActionType.Wait, time: 1 }]), flags: TriggerFlag.Preserve };
    expect(check(t).some((p) => p.text.includes("preserved"))).toBe(true);
  });
});

describe("search", () => {
  const items = [
    { label: "Create Unit", value: 1 }, { label: "Create Unit with Properties", value: 2 }, { label: "Kill Unit", value: 3, aliases: ["remove"] },
    { label: "Max hit points of a unit type", value: 4, aliases: ["hp", "health"], group: "Units" }, { label: "Modify Unit Hit Points", value: 5 },
  ];
  it("ranks a prefix first, then word starts, then aliases", () => {
    expect(search(items, "create").map((h) => h.item.value)).toEqual([1, 2]);
    expect(search(items, "cr un").map((h) => h.item.value)).toEqual([1, 2]);
    expect(search(items, "hp")[0].item.value).toBe(4);
    expect(search(items, "hit points").map((h) => h.item.value)).toEqual([5, 4]);
    expect(search(items, "hp").map((h) => h.item.value)).toEqual([4]);
    expect(search([{ label: "Bring", value: 1 }, { label: "Kill", value: 2 }], "brings").map((h) => h.item.value)).toEqual([1]);
    expect(search([{ label: "Damage bonus per upgrade of a weapon", value: 1 }, { label: "Damage of a weapon", value: 2 }], "damage")[0].item.value).toBe(2);
    expect(search(items, "remove")[0].item.value).toBe(3);
    expect(search(items, "zzz")).toEqual([]);
  });
});

describe("records", () => {
  it("fingerprints by content, ignoring the game's bookkeeping bits", () => {
    const a = trig([0], [{ type: ConditionType.Always }], [{ type: ActionType.Victory }]);
    const b = { ...a, flags: a.flags | TriggerFlag.ConditionsMet };
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(a)).not.toBe(fingerprint(setOwners(a, [1])));
  });
  it("disables and enables every row", () => {
    const a = trig([0], [{ type: ConditionType.Always }], [{ type: ActionType.Victory }]);
    expect(isTriggerDisabled(a)).toBe(false);
    const d = setTriggerDisabled(a, true);
    expect(isTriggerDisabled(d)).toBe(true);
    expect(isTriggerDisabled(setTriggerDisabled(d, false))).toBe(false);
  });
});

describe("sidecar", () => {
  const list = [trig([0], [{ type: ConditionType.Always }], [{ type: ActionType.Victory }]), trig([1], [], [{ type: ActionType.Defeat }]), trig([2], [], [{ type: ActionType.Draw }])];
  it("round-trips and follows a moved trigger by fingerprint", () => {
    const folders = new Map([[0, "setup"], [2, "end"]]);
    const sc: Sidecar = withFolders({ version: 1, folders: [{ id: "setup", name: "Setup", triggers: [] }, { id: "end", name: "End", triggers: [] }], counters: [{ player: 7, unit: 181, name: "Score" }], settings: { everyFrame: true }, expansions: [], builds: [], chat: null, msqc: null }, list, folders);
    const back = decodeSidecar(encodeSidecar(sc));
    expect(back).toEqual(sc);
    const moved = [list[2], list[0], list[1]];
    expect([...folderOf(moved, back)]).toEqual([[1, "setup"], [0, "end"]]);
  });
  it("keeps expansions through a round trip", () => {
    const sc: Sidecar = { version: 1, folders: [], counters: [], settings: {}, expansions: [{ id: "c1", kind: "copy", from: [0, 181], to: [1, 181], flag: [2, 181] }], builds: [], chat: null, msqc: null };
    expect(decodeSidecar(encodeSidecar(sc)).expansions).toEqual(sc.expansions);
  });
  it("falls back to the index for a trigger edited elsewhere, and survives junk", () => {
    const sc = withFolders({ version: 1, folders: [{ id: "f", name: "F", triggers: [] }], counters: [], settings: {}, expansions: [], builds: [], chat: null, msqc: null }, list, new Map([[1, "f"]]));
    const edited = [list[0], setOwners(list[1], [5]), list[2]];
    expect([...folderOf(edited, sc)]).toEqual([[1, "f"]]);
    expect(decodeSidecar(new TextEncoder().encode("{not json"))).toEqual({ version: 1, folders: [], counters: [], settings: {}, expansions: [], builds: [], chat: null, msqc: null });
    expect(decodeSidecar(null).folders).toEqual([]);
  });
});

describe("deferred rows", () => {
  it("warns when a native row uses a location a build row above it moves after the pass", () => {
    const moveFlag = { ...emptyAction(), type: ActionType.SetDeaths, player: 0, unitId: 181, modifier: 7, target: 1 };
    const create = { ...emptyAction(), type: ActionType.CreateUnit, player: 0, unitId: 0, location: 3, target: 1 };
    const t = trig([0], [{ type: ConditionType.Always }], [moveFlag, create]);
    const ctx = { deferredLocation: (a: typeof moveFlag) => (a.type === ActionType.SetDeaths && a.unitId === 181 ? 3 : null), locationName: (n: number) => `Loc ${n}` };
    const p = check(t, ctx).filter((x) => x.text.includes("after this cycle"));
    expect(p).toHaveLength(1);
    expect(p[0].at).toEqual({ kind: "action", index: 1 });
    expect(p[0].text).toContain("Row 1 moves Loc 3");
    // A native row above the move, or on another location, is fine.
    expect(check(trig([0], [{ type: ConditionType.Always }], [create, moveFlag]), ctx).some((x) => x.text.includes("after this cycle"))).toBe(false);
    expect(check(trig([0], [{ type: ConditionType.Always }], [moveFlag, { ...create, location: 4 }]), ctx).some((x) => x.text.includes("after this cycle"))).toBe(false);
  });
});

describe("sidecar problems", () => {
  const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
  it("says when the member is newer or not JSON, instead of an empty sidecar", () => {
    expect(readSidecar(null).problem).toBeNull();
    expect(readSidecar(enc({ version: 1 })).problem).toBeNull();
    expect(readSidecar(enc({ version: 2, builds: [] })).problem).toEqual({ kind: "newer", version: 2 });
    expect(readSidecar(enc({ folders: [] })).problem).toMatchObject({ kind: "malformed" });
    expect(readSidecar(new TextEncoder().encode("{not json")).problem).toMatchObject({ kind: "malformed" });
    expect(readSidecar(enc({ version: 2 })).sidecar.builds).toEqual([]);
    // The plain decoder is the same reading with the reason dropped.
    expect(decodeSidecar(enc({ version: 2 })).version).toBe(1);
  });
});

describe("search across scripts", () => {
  it("matches Korean and other non-Latin text instead of dropping it", () => {
    const items = [{ label: "Create unit", aliases: ["유닛 생성"], value: 1 }, { label: "Kill unit", aliases: ["유닛 제거"], value: 2 }, { label: "Victory", aliases: ["승리"], value: 3 }];
    expect(search(items, "유닛").map((h) => h.item.value).sort()).toEqual([1, 2]);
    expect(search(items, "생성")[0].item.value).toBe(1);
    expect(search(items, "승리")[0].item.value).toBe(3);
    expect(search(items, "unit")).toHaveLength(2);
  });
});
