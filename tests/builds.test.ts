import { describe, expect, it } from "vitest";
import { chatKey, checkChatMessage, composePlugins, isChatPattern, msqcKeyName, nextChatValue, type BuildRecord, type ChatRecord, type Msqc } from "../src/model/builds";

describe("build plugins", () => {
  it("composes the chat plugin, Magenta's spec and turbo from the records", () => {
    const builds: BuildRecord[] = [
      { id: "c1", kind: "chat", message: "-heal", value: 2 },
      { id: "c2", kind: "chat", message: "^-give .*$", value: 3 },
      { id: "t1", kind: "text", flag: [0, 181], parts: [{ text: "Score: " }, { counter: [7, 181] }], to: "all" },
      { id: "m1", kind: "math", flag: [1, 181], op: "mul", a: [7, 181], b: 2, to: [7, 181] },
    ];
    // A pattern needs the args cells; the chat plugin takes a pattern only with two `.*`, so the typed one gains a second.
    const args = { ptr: [11, 182] as const, len: [11, 183] as const, pattern: [11, 184] as const, number: [11, 185] as const };
    const p = composePlugins(builds, { cell: [11, 181], args }, true);
    expect(p.chatEvent).toEqual({ __addr__: "0x58C580", __patternAddr__: "0x58C610", __ptrAddr__: "0x58C5B0", __lenAddr__: "0x58C5E0", "-heal": 2, "^-give .*.*$": 3 });
    expect(p.eudTurbo).toEqual({});
    const spec = JSON.parse(p.magenta.spec as string);
    expect(spec).toMatchObject({ version: 3, everyFrame: true, chat: { cell: [11, 181], args } });
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
  it("writes a prefix with a number as the chat plugin's two-star pattern, and reads the pattern cell", () => {
    const plain: ChatRecord = { id: "a", kind: "chat", message: "-heal", value: 2 };
    const withNumber: ChatRecord = { id: "b", kind: "chat", message: "-set", value: 3, arg: "number" };
    const typed: ChatRecord = { id: "c", kind: "chat", message: "^-give .*$", value: 4 };
    const two: ChatRecord = { id: "d", kind: "chat", message: "^-tp .*to.*$", value: 5 };
    expect([plain, withNumber, typed, two].map(isChatPattern)).toEqual([false, true, true, true]);
    expect([plain, withNumber, typed, two].map(chatKey)).toEqual(["-heal", "^-set .*.*$", "^-give .*.*$", "^-tp .*to.*$"]);
    // Without a pattern the args stay out of the section and the spec.
    const p = composePlugins([plain], { cell: [11, 181], args: { ptr: [11, 182], len: [11, 183], pattern: [11, 184], number: [11, 185] } }, false);
    expect(Object.keys(p.chatEvent)).toEqual(["__addr__", "-heal"]);
    expect(JSON.parse(p.magenta.spec as string).chat.args).toBeNull();
  });
  it("composes the pick row and the new pass verbs as data", () => {
    const builds: BuildRecord[] = [
      { id: "p", kind: "pick", flag: [0, 181], unit: 0, owner: 0, location: null, by: "min", field: "hp", near: null, locate: 5, to: [1, 181], do: { kill: true } },
      { id: "f", kind: "foreach", flag: [2, 181], unit: 37, owner: 1, location: 2, do: { order: "move", location: 1, scratch: 4 } },
      { id: "g", kind: "foreach", flag: [3, 181], unit: 0, owner: 0, location: null, do: { timer: "stim", value: 30 } },
      { id: "s", kind: "scan", cell: [4, 181], unit: 0, owner: 0, location: null, field: "underAttack", cmp: ">", value: 0 },
    ];
    const spec = JSON.parse(composePlugins(builds, null, false).magenta.spec as string);
    expect(spec.hooks.map((h: { kind: string }) => h.kind)).toEqual(["pick", "foreach", "foreach"]);
    expect(spec.hooks[0]).toMatchObject({ by: "min", field: "hp", locate: 5, to: [1, 181], do: { kill: true } });
    expect(spec.scans[0]).toMatchObject({ field: "underAttack", cmp: ">", value: 0 });
  });
  it("numbers chat commands from 2 and checks the message", () => {
    expect(nextChatValue([])).toBe(2);
    expect(nextChatValue([{ id: "a", kind: "chat", message: "x", value: 2 }, { id: "b", kind: "chat", message: "y", value: 4 }])).toBe(3);
    expect(checkChatMessage("-heal")).toBeNull();
    expect(checkChatMessage("")).not.toBeNull();
    expect(checkChatMessage("a:b")).not.toBeNull();
    expect(checkChatMessage("x".repeat(79))).not.toBeNull();
    expect(checkChatMessage("^-give .*$")).toBeNull();
    expect(checkChatMessage("^-give$")).not.toBeNull();
    expect(checkChatMessage("^a.*b.*c.*d$")).not.toBeNull();
  });
});
