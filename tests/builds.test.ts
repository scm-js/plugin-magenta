import { describe, expect, it } from "vitest";
import { checkChatMessage, composePlugins, nextChatValue, type BuildRecord } from "../src/model/builds";

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
    expect(spec).toMatchObject({ version: 1, everyFrame: true, chat: { cell: [11, 181] } });
    expect(spec.hooks).toHaveLength(2);
    expect(spec.hooks[0].kind).toBe("text");
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
