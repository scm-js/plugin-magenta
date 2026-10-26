/**
 * Magenta's rows as TrigScript: what each kind renders to, what the rendering refuses and notes, and — with the
 * TrigScript repository checked out beside this one — that the rendered file compiles with its compiler, holds one
 * program, and is taken by its own build for a map with two players.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chatKey, checkChatMessage, isChatPattern, msqcKeyName, nextChatValue, type BuildRecord, type ChatRecord, type Msqc } from "../src/model/builds";
import { keyNameOf, renderScript, type RenderInput } from "../src/model/trigscript";

const bounds = (n: number) => (n === 1 ? { left: 64, top: 96, right: 192, bottom: 160 } : n === 2 ? { left: 0, top: 0, right: 640, bottom: 320 } : null);
const input = (patch: Partial<RenderInput> = {}): RenderInput => ({ builds: [], chat: null, msqc: null, options: { camera: null, bgm: null, noAirCollision: false, unlimiter: false }, humans: [0, 1], owner: 0, bounds, ...patch });
const args = { ptr: [11, 182] as const, len: [11, 183] as const, pattern: [11, 184] as const, number: [11, 185] as const };

describe("the rows as TrigScript", () => {
  it("renders every row that watches a flag, in order, and clears the flag after the last of them", () => {
    const builds: BuildRecord[] = [
      { id: "t1", kind: "text", flag: [0, 181], parts: [{ text: "Score: " }, { counter: [7, 181] }, { text: " <07>for " }, { player: 1 }, { color: 1 }], to: "all" },
      { id: "m1", kind: "math", flag: [0, 181], op: "mul", a: [7, 181], b: 2, to: [7, 181] },
      { id: "m2", kind: "math", flag: [1, 181], op: "rand", a: [7, 181], b: [7, 182], to: [7, 183] },
      { id: "f1", kind: "foreach", flag: [2, 181], unit: 0, owner: 0, location: 2, do: { set: "hp", value: 100 } },
      { id: "f2", kind: "foreach", flag: [3, 181], unit: 37, owner: null, location: null, do: { order: "attack", location: 1, scratch: 4 } },
      { id: "f3", kind: "foreach", flag: [4, 181], unit: null, owner: 1, location: null, do: { adjust: "shields", delta: -10 } },
      { id: "c1", kind: "count", flag: [5, 181], unit: 0, owner: 0, location: null, to: [8, 181] },
      { id: "r1", kind: "read", flag: [6, 181], unit: 0, owner: 0, location: null, field: "hpPct", to: [8, 182] },
      { id: "p1", kind: "pick", flag: [7, 181], unit: 0, owner: 0, location: null, by: "min", field: "hp", near: null, locate: 5, to: [8, 183], do: { kill: true } },
      { id: "p2", kind: "pick", flag: [8, 181], unit: null, owner: null, location: null, by: "nearest", field: "hp", near: 1, radius: 200, locate: null, to: [8, 184], do: null },
      { id: "p3", kind: "pick", flag: [9, 181], unit: null, owner: null, location: null, by: "random", field: "hp", near: null, locate: 6, to: null, do: { give: 1 } },
      { id: "l1", kind: "setloc", flag: [10, 181], location: 1, x: 640, y: 320, width: null, height: null },
    ];
    const r = renderScript(input({ builds }));
    expect(r.unsupported).toEqual([]);
    expect(r.notes).toEqual([]);
    const s = r.source;
    expect(s).toContain("program(() => {");
    expect(s).toContain('}, { owner: P1, name: "Magenta" });');
    // The two rows on flag [0, 181]: the text, then the maths, then the flag cleared once.
    const flag = "deaths(P1, (181 as UnitType)) == 1";
    expect(s.split(flag)).toHaveLength(3);
    expect(s).toContain("print(`Score: ${deaths(P8, (181 as UnitType))} \\x07for ${name(P2)}${color(P2)}`, { to: AllPlayers });");
    expect(s).toContain('setDeaths(P8, (181 as UnitType), "set", deaths(P8, (181 as UnitType)) * 2);');
    expect(s.indexOf('setDeaths(P1, (181 as UnitType), "set", 0);')).toBeGreaterThan(s.indexOf("* 2"));
    expect(s).toContain('"set", random(deaths(P8, (182 as UnitType))));');
    expect(s).toContain("for (const u of allUnits({ type: (0 as UnitType), owner: P1, at: (2 as Location) })) {\n        u.hp = 100;");
    expect(s).toContain('for (const u of allUnits({ type: (37 as UnitType) })) {\n        u.order("attack", (1 as Location));');
    expect(s).toContain("u.shields = Math.max(u.shields - 10, 0);");
    expect(s).toContain("let n = 0;\n      for (const u of allUnits({ type: (0 as UnitType), owner: P1 })) n += 1;\n      setDeaths(P9, (181 as UnitType), \"set\", n);");
    expect(s).toContain("if (seen == 0) { v = u.hp * 100 / u.maxHp; seen = 1; }");
    expect(s).toContain("let best = 2147483647;\n      let found: Unit | null = null;");
    expect(s).toContain("if (v < best) { best = v; found = u; }");
    expect(s).toContain("found.locate((5 as Location));");
    expect(s).toContain("found.kill();");
    // Nearest to location 1's centre, where it is now, within 200 pixels; a miss leaves 0 in the counter.
    expect(s).toContain("const b = bounds((1 as Location));\n      const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;");
    expect(s).toContain("const v = Math.abs(u.x - cx) + Math.abs(u.y - cy);");
    expect(s).toContain("if (best > 200) found = null;");
    expect(s).toContain('else {\n        setDeaths(P9, (184 as UnitType), "set", 0);');
    expect(s).toContain("const found = randomUnit(allUnits());");
    expect(s).toContain("found.give(P2);");
    // The location keeps its size, read where it is now, its top left at (640, 320).
    expect(s).toContain("const b = bounds((1 as Location));\n      const w = b.right - b.left;\n      const h = b.bottom - b.top;\n      b.left = 640; b.top = 320;\n      b.right = 640 + w; b.bottom = 320 + h;");
    expect(s).toContain("sleep(frames(1));");
  });

  it("carries the players' typed lines, keys, clicks and mice itself, for the next frame's triggers, and clears them first", () => {
    const builds: BuildRecord[] = [
      { id: "c1", kind: "chat", message: "-heal", value: 2 },
      { id: "c2", kind: "chat", message: "-set", value: 3, arg: "number" },
      { id: "c3", kind: "chat", message: "^-give .*$", value: 4 },
    ];
    const msqc: Msqc = { qcUnit: 58, qcLoc: 62, qcPlayer: 10, keys: { "65": 184, "32": 185, "113": 186 }, clicks: { L: 187 }, mouseBase: null, mouseIn: { "2": 188 }, select: null };
    const r = renderScript(input({ builds, chat: { cell: [11, 181], args }, msqc, humans: [0, 2] }));
    const s = r.source;
    expect(r.unsupported).toEqual([
      { id: "c3", why: "a chat pattern of your own (^…$) is not in the language yet; write the message, or the message followed by a number" },
      { id: null, why: "the key with code 113 is one StarCraft: Remastered reports no press of, or none the language names" },
    ]);
    // Cleared at the top of the turn: the chat cell, the pattern cell, each human's key and click cells.
    const top = s.indexOf("// The build rows") < 0 ? s.indexOf("// What the players did") : s.indexOf("// The build rows");
    const cleared = s.slice(0, top);
    for (const c of ['setDeaths(P12, (181 as UnitType), "set", 0);', 'setDeaths(P12, (184 as UnitType), "set", 0);', 'setDeaths(P1, (184 as UnitType), "set", 0);', 'setDeaths(P3, (185 as UnitType), "set", 0);', 'setDeaths(P3, (187 as UnitType), "set", 0);']) expect(cleared).toContain(c);
    expect(s).toContain('if (chatted(P1, "-heal")) setDeaths(P12, (181 as UnitType), "set", 2);');
    expect(s).toContain('const m1 = chatted(P3, "-set {n}");');
    expect(s).toContain('if (m1) { setDeaths(P12, (184 as UnitType), "set", 3); setDeaths(P12, (185 as UnitType), "set", m1.n); }');
    expect(s).toContain('if (keyPressed(P1, "A")) setDeaths(P1, (184 as UnitType), "set", 1);');
    expect(s).toContain('if (keyPressed(P3, "Space")) setDeaths(P3, (185 as UnitType), "set", 1);');
    expect(s).toContain('if (clicked(P1, "left")) setDeaths(P1, (187 as UnitType), "set", 1);');
    expect(s).toContain("const mb2 = bounds((2 as Location));");
    expect(s).toContain("const mp2_2 = mouse(P3);");
    expect(s).toContain('if (mp2_2.x >= mb2.left && mp2_2.x <= mb2.right && mp2_2.y >= mb2.top && mp2_2.y <= mb2.bottom) setDeaths(P3, (188 as UnitType), "set", 1);');
    expect(s).toContain('else setDeaths(P3, (188 as UnitType), "set", 0);');
    expect(s).not.toContain("F2");
  });

  it("writes the unit checks at the end of the turn, renders the fields and verbs the language took in part C, and says what it still cannot", () => {
    const builds: BuildRecord[] = [
      { id: "s1", kind: "scan", cell: [0, 183], unit: 0, owner: 0, location: 1, field: "hp", cmp: "<", value: 20 },
      { id: "s2", kind: "scan", cell: [1, 183], unit: null, owner: null, location: null, field: "underAttack", cmp: "=", value: 1 },
      { id: "s3", kind: "scan", cell: [2, 183], unit: null, owner: null, location: null, field: "inTransport", cmp: "=", value: 1 },
      { id: "f1", kind: "foreach", flag: [3, 181], unit: 0, owner: 0, location: null, do: { hallucination: true } },
      { id: "f2", kind: "foreach", flag: [4, 181], unit: 0, owner: 0, location: null, do: { cooldown: 250 } },
      { id: "l1", kind: "setloc", flag: [5, 181], location: 1, x: 64, y: 0, width: null, height: null, relative: true },
      { id: "r1", kind: "read", flag: [6, 181], unit: 0, owner: 0, location: null, field: "speed", to: [8, 182] },
    ];
    builds.push(
      { id: "f3", kind: "foreach", flag: [7, 181], unit: 37, owner: null, location: null, do: { speed: true } },
      { id: "f4", kind: "foreach", flag: [7, 181], unit: null, owner: 1, location: null, do: { timer: "matrix", value: 240 } },
      { id: "f5", kind: "foreach", flag: [7, 181], unit: null, owner: 1, location: null, do: { set: "buildTime", value: 24 } },
      { id: "f6", kind: "foreach", flag: [7, 181], unit: null, owner: 1, location: null, do: { status: "noclip", on: true } },
      { id: "l2", kind: "setloc", flag: [8, 181], location: 2, x: -32, y: 0, width: 64, height: null, relative: true },
      { id: "l3", kind: "setloc", flag: [8, 181], location: 9, x: 0, y: 0, width: null, height: null },
    );
    const r = renderScript(input({ builds, options: { camera: { location: 1, name: "Hero", inertia: 5, maxspeed: 48 }, bgm: { path: "staredit\\wav\\loop.wav", length: 12.5 }, noAirCollision: true, unlimiter: false } }));
    const s = r.source;
    expect(s).toContain("if (u.hp < 20) hit = 1;");
    expect(s).toContain("if ((u.underAttack ? 1 : 0) == 1) hit = 1;");
    expect(s).toContain("if ((u.inTransport ? 1 : 0) == 1) hit = 1;");
    expect(s).toContain('setDeaths(P1, (183 as UnitType), "set", hit);');
    expect(s).toContain("u.hallucinated = true;");
    expect(s).toContain("u.cooldown = 250;");
    expect(s).toContain("u.speedUpgrade = true;");
    expect(s).toContain("u.matrix = 240;");
    expect(s).toContain("u.buildTime = 24;");
    expect(s).toContain("if (seen == 0) { v = u.speed; seen = 1; }");
    // Moved from where it is: each edge by the offset, a given size from the moved edge.
    expect(s).toContain("const b = bounds((1 as Location));\n      b.left += 64;\n      b.right += 64;");
    expect(s).toContain("const b = bounds((2 as Location));\n      b.left -= 32;\n      b.right = b.left + 64;\n      b.bottom -= 0;".replace("\n      b.bottom -= 0;", ""));
    expect(s).not.toContain("b.top += 0");
    expect(r.notes).toEqual([]);
    expect(r.unsupported.map((u) => u.id)).toEqual(["f6", "l3", null]);
    expect(r.unsupported.map((u) => u.why)).toEqual([
      "this pass's verb is not in the language yet",
      "the row moves location 9, which the map no longer has",
      "air units passing through one another was a code patch of euddraft's, which TrigScript's build does not have",
    ]);
    // A row left out is said in the file too, where it would have been.
    expect(s).toContain("// Row f6 left out: this pass's verb is not in the language yet");
    // The camera and the music: a program of each human's own, after the rows'.
    expect(s).toContain('const VIEW = reserveLocation("Magenta: where the camera looks");');
    expect(s).toContain("cx += dx > -5 && dx < 5 ? dx : clamp(dx / 5, -48, 48);");
    expect(s).toContain("centerLocation(VIEW, cx, cy, 32, 32);\n    centerView(VIEW);");
    expect(s).toContain('}, { owner: [P1, P2], name: "Magenta camera" });');
    expect(s).toContain('playWav("staredit\\\\wav\\\\loop.wav", 12500);\n    sleep(frames(300));');
    expect(s).toContain('}, { owner: [P1, P2], name: "Magenta music" });');
    expect(s.indexOf("Magenta camera")).toBeGreaterThan(s.indexOf('name: "Magenta" });'));
  });

  it("names the keys as TrigScript does", () => {
    expect([0x41, 0x30, 0x70, 0x76, 0x60, 0x20, 0x1b, 0x25, 0x21].map(keyNameOf)).toEqual(["A", "0", "F1", "F7", "Numpad0", "Space", "Escape", "Left", "PageUp"]);
    expect([0x71, 0x75, 0x99].map(keyNameOf)).toEqual([null, null, null]);
    expect(msqcKeyName(0x70)).toBe("F1");
  });

  it("the chat helpers stand: patterns, keys, numbering, the message check", () => {
    const plain: ChatRecord = { id: "a", kind: "chat", message: "-heal", value: 2 };
    const withNumber: ChatRecord = { id: "b", kind: "chat", message: "-set", value: 3, arg: "number" };
    const typed: ChatRecord = { id: "c", kind: "chat", message: "^-give .*$", value: 4 };
    expect([plain, withNumber, typed].map(isChatPattern)).toEqual([false, true, true]);
    expect([plain, withNumber, typed].map(chatKey)).toEqual(["-heal", "^-set .*.*$", "^-give .*.*$"]);
    expect(nextChatValue([])).toBe(2);
    expect(nextChatValue([{ id: "a", kind: "chat", message: "x", value: 2 }, { id: "b", kind: "chat", message: "y", value: 4 }])).toBe(3);
    expect(checkChatMessage("-heal")).toBeNull();
    expect(checkChatMessage("a:b")).not.toBeNull();
  });
});

// The compiler itself, when its repository is checked out beside this one: the rendered file compiles, and the own build takes it.
const TRIGSCRIPT = process.env.TRIGSCRIPT_DIR ?? resolve(import.meta.dirname, "..", "..", "plugin-trigscript");
const have = existsSync(resolve(TRIGSCRIPT, "compiler", "compiler.ts")) && existsSync(resolve(TRIGSCRIPT, "node_modules", "typescript"));
describe.skipIf(!have)("the rendered rows, through TrigScript's compiler", () => {
  it("compile, hold the rows' program and the options' two, and are taken by TrigScript's own build", async () => {
    const ts = (await import(resolve(TRIGSCRIPT, "node_modules", "typescript", "lib", "typescript.js"))).default;
    const { compileScript } = await import(resolve(TRIGSCRIPT, "compiler", "compiler.ts"));
    const { defaultScriptNames } = await import(resolve(TRIGSCRIPT, "compiler", "names.ts"));
    const { defaultLib } = await import(resolve(TRIGSCRIPT, "bundle", "lib.mjs"));
    const builds: BuildRecord[] = [
      { id: "c1", kind: "chat", message: "-heal", value: 2 },
      { id: "c2", kind: "chat", message: "-set", value: 3, arg: "number" },
      { id: "t1", kind: "text", flag: [0, 181], parts: [{ text: "Score: " }, { counter: [7, 181] }, { text: " for " }, { player: 1 }, { color: 1 }], to: "all" },
      { id: "m1", kind: "math", flag: [0, 181], op: "div", a: [7, 181], b: [7, 182], to: [7, 181] },
      { id: "m2", kind: "math", flag: [1, 181], op: "rand", a: [7, 181], b: 100, to: [7, 183] },
      { id: "f1", kind: "foreach", flag: [2, 181], unit: 0, owner: 0, location: 2, do: { adjust: "hp", delta: -20 } },
      { id: "f2", kind: "foreach", flag: [3, 181], unit: 37, owner: null, location: null, do: { order: "move", location: 1, scratch: 4 } },
      { id: "f3", kind: "foreach", flag: [3, 181], unit: null, owner: 1, location: null, do: { timer: "stim", value: 30 } },
      { id: "c3", kind: "count", flag: [5, 181], unit: 0, owner: 0, location: null, to: [8, 181] },
      { id: "r1", kind: "read", flag: [6, 181], unit: 0, owner: 0, location: null, field: "shieldsPct", to: [8, 182] },
      { id: "p1", kind: "pick", flag: [7, 181], unit: 0, owner: 0, location: null, by: "max", field: "kills", near: null, locate: 5, to: [8, 183], do: { invincible: true } },
      { id: "p2", kind: "pick", flag: [8, 181], unit: null, owner: null, location: null, by: "nearest", field: "hp", near: { mouse: 0 }, radius: 200, locate: null, to: [8, 184], do: null },
      { id: "p3", kind: "pick", flag: [9, 181], unit: null, owner: null, location: null, by: "random", field: "hp", near: null, locate: 6, to: null, do: { give: 1 } },
      { id: "l1", kind: "setloc", flag: [10, 181], location: 1, x: 640, y: 320, width: 64, height: 64 },
      { id: "l2", kind: "setloc", flag: [10, 181], location: 2, x: 64, y: -32, width: null, height: null, relative: true },
      { id: "l3", kind: "setloc", flag: [10, 181], location: 2, x: 100, y: 100, width: null, height: 40 },
      { id: "f4", kind: "foreach", flag: [11, 181], unit: null, owner: 1, location: null, do: { hallucination: true } },
      { id: "f5", kind: "foreach", flag: [11, 181], unit: null, owner: 1, location: null, do: { timer: "matrix", value: 240 } },
      { id: "f6", kind: "foreach", flag: [11, 181], unit: null, owner: 1, location: null, do: { set: "rank", value: 3 } },
      { id: "r2", kind: "read", flag: [11, 181], unit: 0, owner: 0, location: null, field: "speed", to: [8, 185] },
      { id: "s1", kind: "scan", cell: [0, 183], unit: 0, owner: 0, location: 1, field: "hp", cmp: "<", value: 20 },
      { id: "s2", kind: "scan", cell: [1, 183], unit: null, owner: null, location: null, field: "hasTarget", cmp: "=", value: 1 },
    ];
    const msqc: Msqc = { qcUnit: 58, qcLoc: 62, qcPlayer: 10, keys: { "65": 184 }, clicks: { R: 187 }, mouseBase: null, mouseIn: { "2": 188 }, select: null };
    const options = { camera: { location: 1, name: "Hero", inertia: 5, maxspeed: 48 }, bgm: { path: "staredit\\wav\\loop.wav", length: 12.5 }, noAirCollision: false, unlimiter: false };
    const r = renderScript(input({ builds, chat: { cell: [11, 181], args }, msqc, options }));
    expect(r.unsupported).toEqual([]);
    const own = { players: { slots: [0, 1], forces: [0, 1, 0, 0, 0, 0, 0, 0] }, humans: [0, 1], width: 4096, height: 4096 };
    // (As the map's own script, here: TrigScript's build runs it as an entry after the script's, which changes nothing of this.)
    const compiled = compileScript(ts, { "main.ts": r.source }, defaultScriptNames(), { lib: defaultLib(), own });
    expect(compiled.diagnostics.map((d: { file: string; line: number; message: string }) => `${d.file}:${d.line} ${d.message}`)).toEqual([]);
    // The rows' program, the camera's and the music's.
    expect(compiled.ir).toHaveLength(3);
    expect(compiled.ownRefusal).toBeUndefined();
  }, 60_000);
});
