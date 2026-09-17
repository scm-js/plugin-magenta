import { describe, expect, it } from "vitest";
import { ActionType, emptyAction, emptyTrigger, type TriggerRecord } from "../vendor/triggers";
import { DEFAULT_MSQC, DEFAULT_OPTIONS, MAGENTA_SPEC_VERSION, type BuildRecord } from "../src/model/builds";
import { flagAction } from "../src/model/expansions";
import { buildFreshness, lastBuildRecord, preflight, sourceRevision, type PreflightInput } from "../src/model/preflight";
import { setOwners } from "../src/model/records";
import { emptySidecar, type Sidecar } from "../src/model/sidecar";

const trig = (owners: number[], actions: ReturnType<typeof emptyAction>[]): TriggerRecord => setOwners({ ...emptyTrigger(), actions }, owners);
const heal: Extract<BuildRecord, { kind: "foreach" }> = { id: "b1", kind: "foreach", flag: [0, 181], unit: 0, owner: 0, location: 2, do: { adjust: "hp", delta: 20 } };
const slots = (n = 64) => Array.from({ length: n }, () => ({ empty: true, named: false }));

function input(patch: Partial<PreflightInput> = {}, sidecar: Partial<Sidecar> = {}): PreflightInput {
  const sc = { ...emptySidecar(), builds: [heal], ...sidecar };
  const locations = slots();
  locations[1] = { empty: false, named: true };
  return {
    list: [trig([0], [flagAction({ cell: heal.flag })])], sidecar: sc, options: DEFAULT_OPTIONS, plugins: { magenta: { spec: "{}" } },
    playerTypes: Array.from({ length: 12 }, (_, i) => (i < 2 ? 6 : 0)), playerTypeName: (s) => `type ${s}`, playerName: (s) => `Player ${s + 1}`, unitName: (id) => `unit ${id}`,
    placedUnitIds: new Set([0]), placedOwners: new Set([0, 1]), locations, soundPresent: () => true, health: null,
    ...patch,
  };
}

describe("source revision", () => {
  it("moves with the triggers, the build rows and the map extras, not with the last-build record", () => {
    const sc = { ...emptySidecar(), builds: [heal] };
    const list = [trig([0], [flagAction({ cell: heal.flag })])];
    const a = sourceRevision(list, sc, ["locs"]);
    expect(sourceRevision(list, sc, ["locs"])).toBe(a);
    expect(sourceRevision(list, { ...sc, settings: { lastBuild: lastBuildRecord(a, "x-eud.scx", "https://eud", null) } }, ["locs"])).toBe(a);
    expect(sourceRevision(list, sc, ["locs2"])).not.toBe(a);
    expect(sourceRevision([trig([1], list[0].actions)], sc, ["locs"])).not.toBe(a);
    expect(sourceRevision(list, { ...sc, builds: [{ ...heal, do: { adjust: "hp", delta: 30 } }] }, ["locs"])).not.toBe(a);
    expect(sourceRevision(list, { ...sc, settings: { build: { unlimiter: true } } }, ["locs"])).not.toBe(a);
    expect(buildFreshness(null, a)).toBe("never");
    expect(buildFreshness(lastBuildRecord(a, null, "s", null), a)).toBe("fresh");
    expect(buildFreshness(lastBuildRecord("other", null, "s", null), a)).toBe("stale");
    expect(lastBuildRecord(a, null, "s", { eudplib: "0.81" }).eudplib).toBe("0.81");
  });
});

describe("preflight", () => {
  it("passes a clean map", () => {
    expect(preflight(input())).toEqual([]);
  });
  it("checks what synced input reserves: the player, the unit type, its location slots", () => {
    const msqc = { ...DEFAULT_MSQC, keys: { "65": 184 }, mouseBase: 50, mouseIn: { "2": 185 } };
    const clean = preflight(input({}, { msqc }));
    expect(clean).toEqual([]);
    const types = Array.from({ length: 12 }, (_, i) => (i < 2 || i === 10 ? 6 : 0));
    expect(preflight(input({ playerTypes: types }, { msqc })).map((p) => p.level)).toEqual(["error"]);
    expect(preflight(input({ placedOwners: new Set([10]) }, { msqc }))[0].text).toContain("units on the map belong to it");
    const owned = preflight(input({ list: [trig([10], [flagAction({ cell: heal.flag })])] }, { msqc }));
    expect(owned).toMatchObject([{ level: "warn", trigger: 0 }]);
    expect(preflight(input({ placedUnitIds: new Set([58]) }, { msqc }))[0].text).toContain("unit 58");
    const creates = preflight(input({ list: [trig([0], [flagAction({ cell: heal.flag }), { ...emptyAction(), type: ActionType.CreateUnit, unitId: 58, player: 0, location: 2, target: 1 }])] }, { msqc }));
    expect(creates).toMatchObject([{ level: "error", trigger: 0 }]);
    const locs = slots(); locs[1] = { empty: false, named: true }; locs[62] = { empty: false, named: false };
    expect(preflight(input({ locations: locs }, { msqc }))[0].text).toContain("location slot (63)");
    const mouse = slots(); mouse[1] = { empty: false, named: true }; mouse[52] = { empty: true, named: true };
    expect(preflight(input({ locations: mouse }, { msqc }))[0].text).toContain("slot 53 is in use");
  });
  it("checks the rows' locations, chat messages, and rows nothing carries", () => {
    const gone = preflight(input({}, { builds: [{ ...heal, location: 7 }] }));
    expect(gone).toMatchObject([{ level: "error", trigger: 0 }]);
    const order = preflight(input({}, { builds: [{ ...heal, do: { order: "move", location: 2, scratch: 9 } }] }));
    expect(order[0].text).toContain("scratch location");
    const chat = preflight(input({}, { builds: [heal, { id: "c", kind: "chat", message: "a=b", value: 2 }, { id: "d", kind: "chat", message: "-x", value: 3 }, { id: "e", kind: "chat", message: "-X", value: 4 }] }));
    expect(chat.map((p) => p.level)).toEqual(["error", "warn"]);
    const orphan = preflight(input({ list: [trig([0], [])] }));
    expect(orphan).toMatchObject([{ level: "info" }]);
  });
  it("checks the map-wide options and what the server reports", () => {
    const locs = slots(); locs[1] = { empty: false, named: true }; locs[4] = { empty: false, named: false };
    expect(preflight(input({ locations: locs, options: { ...DEFAULT_OPTIONS, camera: { location: 5, name: "x", inertia: 5, maxspeed: 48 } } }))[0].text).toContain("by name");
    expect(preflight(input({ options: { ...DEFAULT_OPTIONS, bgm: { path: "staredit\\wav\\a.wav", length: 3 } }, soundPresent: () => false }))[0].text).toContain("a.wav");
    const old = preflight(input({ health: { plugins: ["magenta"], magentaSpec: MAGENTA_SPEC_VERSION - 1 } }));
    expect(old).toMatchObject([{ level: "error" }]);
    expect(old[0].text).toContain(`spec ${MAGENTA_SPEC_VERSION - 1}`);
    expect(preflight(input({ health: { plugins: ["eudTurbo"], magentaSpec: MAGENTA_SPEC_VERSION } }))[0].text).toContain("magenta plugin");
    expect(preflight(input({ health: { plugins: ["magenta"] } }))).toMatchObject([{ level: "info" }]);
    expect(preflight(input({ health: { plugins: ["magenta"], magentaSpec: MAGENTA_SPEC_VERSION, maxMapBytes: 1000 }, mapBytes: 2048 }))[0].text).toContain("2 KB");
    expect(preflight(input({ health: { plugins: ["magenta"], magentaSpec: MAGENTA_SPEC_VERSION } }))).toEqual([]);
  });
});
