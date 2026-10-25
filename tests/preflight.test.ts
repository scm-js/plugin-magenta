import { describe, expect, it } from "vitest";
import { emptyAction, emptyTrigger, type TriggerRecord } from "../vendor/triggers";
import { DEFAULT_OPTIONS, type BuildRecord } from "../src/model/builds";
import { flagAction } from "../src/model/expansions";
import { preflight, type PreflightInput } from "../src/model/preflight";
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
    list: [trig([0], [flagAction({ cell: heal.flag })])], sidecar: sc, options: DEFAULT_OPTIONS,
    locations, soundPresent: () => true, rendered: { unsupported: [], notes: [] }, trigscript: true,
    ...patch,
  };
}

describe("preflight", () => {
  it("passes a clean map", () => {
    expect(preflight(input())).toEqual([]);
  });
  it("checks the rows' locations, chat messages, and rows nothing carries", () => {
    const gone = preflight(input({}, { builds: [{ ...heal, location: 7 }] }));
    expect(gone).toMatchObject([{ level: "error", trigger: 0 }]);
    const order = preflight(input({}, { builds: [{ ...heal, do: { order: "move", location: 9, scratch: 9 } }] }));
    expect(order[0].text).toContain("target location");
    const chat = preflight(input({}, { builds: [heal, { id: "c", kind: "chat", message: "a=b", value: 2 }, { id: "d", kind: "chat", message: "-x", value: 3 }, { id: "e", kind: "chat", message: "-X", value: 4 }] }));
    expect(chat.map((p) => p.level)).toEqual(["error", "warn"]);
    const orphan = preflight(input({ list: [trig([0], [])] }));
    expect(orphan).toMatchObject([{ level: "info" }]);
  });
  it("says what the rendering could not take, at the row's trigger, and what it took in part", () => {
    const out = preflight(input({ rendered: { unsupported: [{ id: "b1", why: "this pass's verb is not in the language yet" }, { id: null, why: "the camera following a location is not in the language yet" }], notes: [{ id: "b1", note: "the ground weapon's cooldown is held; the air weapon's and the spells' are not yet" }] } }));
    expect(out).toEqual([
      { level: "error", text: "Not built: this pass's verb is not in the language yet.", trigger: 0 },
      { level: "error", text: "Not built: the camera following a location is not in the language yet." },
      { level: "warn", text: "Built in part: the ground weapon's cooldown is held; the air weapon's and the spells' are not yet.", trigger: 0 },
    ]);
  });
  it("checks the map-wide options and that TrigScript is there", () => {
    const locs = slots(); locs[1] = { empty: false, named: true };
    expect(preflight(input({ locations: locs, options: { ...DEFAULT_OPTIONS, camera: { location: 5, name: "x", inertia: 5, maxspeed: 48 } } }))[0].text).toContain("no longer has");
    expect(preflight(input({ options: { ...DEFAULT_OPTIONS, bgm: { path: "staredit\\wav\\a.wav", length: 3 } }, soundPresent: () => false }))[0].text).toContain("a.wav");
    const gone = preflight(input({ trigscript: false }));
    expect(gone).toMatchObject([{ level: "error" }]);
    expect(gone[0].text).toContain("TrigScript plugin");
  });
});
