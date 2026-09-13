import { describe, expect, it } from "vitest";
import { checkChatMessage, composePlugins, msqcKeyName, nextChatValue, type BuildRecord, type Msqc } from "../src/model/builds";

describe("build plugins", () => {
  it("composes the chat plugin, Magenta's spec and turbo from the records", () => {
    const builds: BuildRecord[] = [
      { id: "c1", kind: "chat", message: "-heal", value: 2 },
      { id: "c2", kind: "chat", message: "^-give .*$", value: 3 },
      { id: "t1", kind: "text", flag: [0, 181], parts: [{ text: "Score: " }, { counter: [7, 181] }], to: "all" },
      { id: "m1", kind: "math", flag: [1, 181], op: "mul", a: [7, 181], b: 2, to: [7, 181] },
    ];
    const p = composePlugins(builds, { cell: [11, 181] }, true);
    expect(p.chatEvent).toEqual({ __addr__: "0x58C580", "-heal": 2, "^-give .*$": 3 });
    expect(p.eudTurbo).toEqual({});
    const spec = JSON.parse(p.magenta.spec as string);
    expect(spec).toMatchObject({ version: 2, everyFrame: true, chat: { cell: [11, 181] } });
    expect(spec.hooks).toHaveLength(2);
    expect(spec.hooks[0].kind).toBe("text");
    expect(spec.scans).toEqual([]);
    expect(spec.msqc).toBeNull();
    expect(p.MSQC).toBeUndefined();
  });
  it("writes the MSQC section for synced input, and the follow-up for Magenta's hook", () => {
    const msqc: Msqc = { qcUnit: 58, qcLoc: 62, qcPlayer: 10, keys: { "65": 184, "32": 185 }, clicks: { L: 186 }, mouseBase: 50, mouseIn: { "1": 187 }, select: { ptr: 188, type: 189 } };
    const scan: BuildRecord = { id: "s", kind: "scan", cell: [0, 183], unit: 0, owner: 0, location: 1, field: "hp", cmp: "<", value: 20 };
    const p = composePlugins([scan], null, false, msqc);
    expect(p.MSQC).toEqual({ QCUnit: 58, QCLoc: 62, QCPlayer: 11, QCDebug: "false", "KeyPress(A); NotTyping": "184, 1", "KeyPress(SPACE); NotTyping": "185, 1", "MouseDown(L)": "186, 1", Mouse: 50, "MouseUp(L); val, 0x597208": "188" });
    const spec = JSON.parse(p.magenta.spec as string);
    expect({ ...spec.msqc, clear: [...spec.msqc.clear].sort() }).toEqual({ clear: [184, 185, 186], mouseBase: 50, mouseIn: [{ location: 1, unit: 187 }], select: { ptr: 188, type: 189 } });
    expect(spec.scans).toHaveLength(1);
    expect(spec.hooks).toEqual([]);
    expect(msqcKeyName(0x70)).toBe("F1");
    expect(msqcKeyName(0x25)).toBe("LEFT");
    // An MSQC with nothing registered is left out.
    expect(composePlugins([], null, false, { ...msqc, keys: {}, clicks: {}, mouseIn: {}, select: null }).MSQC).toBeUndefined();
  });
  it("adds the map-wide plugins from the build options", () => {
    const p = composePlugins([], null, false, null, { camera: { location: 3, name: "Hero", inertia: 5, maxspeed: 48 }, bgm: { path: "staredit\\wav\\theme.wav", length: 92.5 }, noAirCollision: true, unlimiter: false }, 60);
    expect(p.cammove).toEqual({ targetloc: "Hero", inertia: 5, maxspeed: 48 });
    expect(p.bgmplayer).toEqual({ path: "staredit\\wav\\theme.wav", length: 92.5 });
    expect(p.noAirCollision).toEqual({});
    expect(p.unlimiter).toBeUndefined();
    // The camera needs its helper location; without one the option is skipped.
    expect(composePlugins([], null, false, null, { camera: { location: 3, name: "Hero", inertia: 5, maxspeed: 48 }, bgm: null, noAirCollision: false, unlimiter: false }, null).cammove).toBeUndefined();
  });
  it("leaves out what the map does not use", () => {
    expect(composePlugins([], null, false)).toEqual({});
    expect(Object.keys(composePlugins([{ id: "m", kind: "math", flag: [0, 181], op: "rand", a: [0, 181], b: 100, to: [0, 181] }], null, false))).toEqual(["magenta"]);
  });
  it("numbers chat commands from 2 and checks the message", () => {
    expect(nextChatValue([])).toBe(2);
    expect(nextChatValue([{ id: "a", kind: "chat", message: "x", value: 2 }, { id: "b", kind: "chat", message: "y", value: 4 }])).toBe(3);
    expect(checkChatMessage("-heal")).toBeNull();
    expect(checkChatMessage("")).not.toBeNull();
    expect(checkChatMessage("a:b")).not.toBeNull();
    expect(checkChatMessage("x".repeat(79))).not.toBeNull();
  });
});
