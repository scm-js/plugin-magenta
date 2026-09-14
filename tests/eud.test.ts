import { beforeAll, describe, expect, it } from "vitest";
import { Comparison, SetModifier } from "../vendor/triggers";
import { ENTRIES, GROUPS, enumerated, entry, grouped, needsLookup } from "../src/catalogue";
import { DEATHS_TABLE, MASK_MARKER, actionSpans, addressOf, available, entryAddress, epd, lookupOver, lowerAction, lowerActions, lowerCondition, partValue, recognizeAction, recognizeActionGroup, recognizeCondition, setGameLookup, type EudRow } from "../src/model/eud";

const slots = (t: string) => [...t.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);

/** A stand-in for units.dat's flingy column: the ids the game uses for the first few unit types, 15 for the Zergling, 88 for the Vulture. */
const FLINGY = new Uint8Array(228);
FLINGY.set([78, 74, 88, 76, 83, 82, 82, 81]);
FLINGY[37] = 15; FLINGY[38] = 8; FLINGY[65] = 49;
for (let u = 8; u < 228; u++) if (!FLINGY[u]) FLINGY[u] = 100 + (u % 100);

beforeAll(() => setGameLookup(lookupOver(FLINGY)));

describe("the catalogue", () => {
  it("has unique ids, known groups, and sentences whose slots are its arguments", () => {
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    for (const e of ENTRIES) {
      expect(GROUPS, e.id).toContain(e.group);
      const argNames = e.args.map((a) => a.name);
      const en = enumerated(e);
      if (e.kind !== "condition") {
        const s = e.sentence.action!;
        expect(s, e.id).toBeDefined();
        const got = slots(s);
        expect(got, e.id).toContain("value");
        expect(got.includes("mod"), `${e.id} mod`).toBe(!en);
        for (const n of argNames) expect(got, e.id).toContain(n);
        for (const n of got) expect([...argNames, "value", "mod"], e.id).toContain(n);
      }
      if (e.kind !== "action") {
        const s = e.sentence.condition!;
        const got = slots(s);
        expect(got, e.id).toContain("value");
        expect(got.includes("cmp"), `${e.id} cmp`).toBe(!en);
        for (const n of argNames) expect(got, e.id).toContain(n);
      }
      for (const t of e.address.terms ?? []) expect(argNames, e.id).toContain(t.arg);
      for (const p of e.parts ?? []) for (const t of p.address.terms ?? []) expect(argNames, e.id).toContain(t.arg);
      if (e.width === "bit") expect(e.bit, e.id).toBeDefined();
      if (e.kind === "condition") expect(e.remastered.read, e.id).toBe(true);
      if (e.kind !== "condition") expect(e.remastered.write, e.id).toBe(true);
      // A grouped entry is an action that only sets: its other parts are derived from the whole value.
      if (grouped(e)) { expect(e.kind, e.id).toBe("action"); expect(en, e.id).toBe(true); expect(e.parts!.some((p) => p.role === "value"), e.id).toBe(true); }
    }
  });

  it("stays inside a dword for byte and word fields at every index", () => {
    for (const e of ENTRIES) {
      const fields = [...(e.width === 4 || e.width === "bit" ? [] : [{ address: e.address, width: e.width }]), ...(e.parts ?? []).filter((p) => p.width !== 4)];
      for (const f of fields) {
        const stride = f.address.terms?.[0]?.stride ?? 4;
        // A word field must not straddle a dword boundary at any index.
        for (let i = 0; i < 8; i++) {
          const address = f.address.base + i * stride;
          expect((address & 3) + f.width, `${e.id} at ${i}`).toBeLessThanOrEqual(4);
        }
      }
    }
  });
});

describe("EPD arithmetic", () => {
  it("round-trips an address through the player field", () => {
    expect(epd(DEATHS_TABLE)).toBe(0);
    expect(epd(0x662350)).toBe((0x662350 - DEATHS_TABLE) / 4);
    expect(addressOf(epd(0x662350))).toBe(0x662350);
    expect(addressOf(0, 1)).toBe(DEATHS_TABLE + 48);
  });
});

describe("lowering and recognition", () => {
  const rowOf = (id: string, args: Record<string, number>, value: number, op: number): EudRow => ({ entry: entry(id)!, args, value, op });

  it("lowers a whole-dword write to a plain Set Deaths", () => {
    const a = lowerAction(rowOf("unit.maxHp", { unit: 0 }, 80, SetModifier.SetTo));
    expect(a.player).toBe(epd(0x662350));
    expect(a.unitId).toBe(0);
    expect(a.target).toBe(80 * 256);
    expect(a.mask).toBe(0);
    expect(a.location).toBe(0);
  });

  it("lowers a byte at an odd address to a masked record with the value shifted", () => {
    const a = lowerAction(rowOf("unit.armor", { unit: 1 }, 3, SetModifier.SetTo));
    expect(entryAddress(entry("unit.armor")!, { unit: 1 })).toBe(0x65fec9);
    expect(a.player).toBe(epd(0x65fec8));
    expect(a.mask).toBe(MASK_MARKER);
    expect(a.location).toBe(0xff00);
    expect(a.target).toBe(3 << 8);
  });

  it("lowers a bit with the bit chosen by an argument", () => {
    const a = lowerAction(rowOf("player.vision", { player: 2, other: 5 }, 1, SetModifier.Add));
    expect(a.modifier).toBe(SetModifier.SetTo);
    expect(a.location).toBe(1 << 5);
    expect(a.target).toBe(1 << 5);
    expect(a.player).toBe(epd(0x57f1ec + 2 * 4));
  });

  it("recognises what it lowered, for every entry, with the value and arguments intact", () => {
    for (const e of ENTRIES) {
      const args: Record<string, number> = {};
      for (const arg of e.args) args[arg.name] = Math.min(arg.max - 1, 7);
      const value = e.width === "bit" ? 1 : e.value?.choices ? e.value.choices[e.value.choices.length - 1].value : e.value?.via ? 65 : e.value?.setOnly ? 4 : Math.min(e.value?.max ?? 100, 100);
      if (e.kind !== "condition") {
        const records = lowerActions({ entry: e, args, value, op: SetModifier.Add });
        const back = grouped(e) ? recognizeActionGroup(records, 0)?.row : recognizeAction(records[0]);
        expect(records.length, e.id).toBe(e.parts?.length ?? 1);
        expect(back?.entry.id, e.id).toBe(e.id);
        expect(back?.args, e.id).toEqual(args);
        expect(back?.value, e.id).toBe(value);
        expect(back?.op, e.id).toBe(enumerated(e) ? SetModifier.SetTo : SetModifier.Add);
        if (grouped(e)) for (const r of records) expect(recognizeAction(r), `${e.id} part alone`).toBeNull();
      }
      if (e.kind !== "action") {
        const back = recognizeCondition(lowerCondition({ entry: e, args, value, op: Comparison.AtMost }));
        expect(back?.entry.id, e.id).toBe(e.id);
        expect(back?.args, e.id).toEqual(args);
        expect(back?.value, e.id).toBe(value);
      }
    }
  });

  it("leaves a plain death counter and an unknown address alone", () => {
    expect(recognizeCondition({ location: 0, player: 7, amount: 1, unitId: 0, comparison: 0, type: 15, resource: 0, flags: 0, mask: 0 })).toBeNull();
    const far = lowerCondition(rowOf("unit.maxHp", { unit: 0 }, 1, 0));
    expect(recognizeCondition({ ...far, player: epd(0x400000) })).toBeNull();
  });

  it("does not confuse a masked byte with the dword entry at the same address", () => {
    // A masked record at the max-HP table is not "max HP" (a dword entry); it stays raw.
    const a = lowerAction(rowOf("unit.maxHp", { unit: 0 }, 1, SetModifier.SetTo));
    expect(recognizeAction({ ...a, mask: MASK_MARKER, location: 0xff })).toBeNull();
  });
});

describe("grouped entries and the game data's tables", () => {
  it("writes a unit type's speed as four flingy records, through units.dat's flingy column", () => {
    const speed = entry("unit.speed")!;
    const records = lowerActions({ entry: speed, args: { unit: 37 }, value: 6.67, op: SetModifier.SetTo });
    expect(records.length).toBe(4);
    // The Zergling's flingy is 15: control byte at 0x6C9858 + 15, top speed at 0x6C9EF8 + 15 × 4.
    expect(addressOf(records[0].player)).toBe((0x6c9858 + 15) & ~3);
    expect(records[0].location).toBe((0xff << (((0x6c9858 + 15) & 3) * 8)) >>> 0);
    expect(records[0].target).toBe(0);
    expect(addressOf(records[1].player)).toBe(0x6c9ef8 + 15 * 4);
    expect(records[1].target).toBe(Math.round(6.67 * 256));
    // Acceleration and halt distance follow the Vulture's proportions: 1707 → 100 and 14569.
    expect(partValue(speed, speed.parts![2], 1707 / 256)).toBe(100);
    expect(partValue(speed, speed.parts![3], 1707 / 256)).toBe(14569);
    const back = recognizeActionGroup(records, 0);
    expect(back?.row.entry.id).toBe("unit.speed");
    expect(back?.row.args).toEqual({ unit: 37 });
    expect(back?.count).toBe(4);
  });

  it("stores a looks-like value as the other type's flingy and reads it back as the first type with it", () => {
    const a = lowerAction({ entry: entry("unit.graphics")!, args: { unit: 0 }, value: 65, op: SetModifier.SetTo });
    expect(a.target).toBe(49);
    expect(recognizeAction(a)?.value).toBe(65);
  });

  it("spans the action list with a group as one row, and breaks the group when a record between is changed", () => {
    const colour = lowerActions({ entry: entry("player.color")!, args: { player: 0 }, value: 135, op: SetModifier.SetTo });
    const hp = lowerAction({ entry: entry("unit.maxHp")!, args: { unit: 0 }, value: 80, op: SetModifier.SetTo });
    const spans = actionSpans([hp, ...colour, hp]);
    expect(spans.map((s) => [s.at, s.count, s.group?.entry.id ?? null])).toEqual([[0, 1, null], [1, 2, "player.color"], [3, 1, null]]);
    expect(actionSpans([colour[0], hp, colour[1]]).every((s) => s.group === null)).toBe(true);
    expect(actionSpans([colour[1], colour[0]]).every((s) => s.group === null)).toBe(true);
  });

  it("keeps the lookup entries out until the game data is in", () => {
    setGameLookup(null);
    expect(available(entry("unit.speed")!)).toBe(false);
    expect(available(entry("unit.maxHp")!)).toBe(true);
    expect(needsLookup(entry("unit.graphics")!)).toBe(true);
    const zergling = lowerActions({ entry: entry("unit.speed")!, args: { unit: 37 }, value: 4, op: SetModifier.SetTo });
    setGameLookup(lookupOver(FLINGY));
    expect(recognizeActionGroup(zergling, 0)).toBeNull();
  });
});

describe("catalogue ranges", () => {
  /** Every byte an entry (or a part of it) can reach, over all its argument values. */
  const bytes = (spec: { base: number; terms?: { arg: string; stride: number; via?: string }[] }, width: number, args: { name: string; max: number }[]): Set<number> => {
    const out = new Set<number>();
    const terms = spec.terms ?? [];
    const ranges = terms.map((t) => (t.via ? 209 : args.find((a) => a.name === t.arg)!.max));
    const walk = (i: number, at: number) => {
      if (i === terms.length) { for (let b = 0; b < width; b++) out.add(at + b); return; }
      for (let n = 0; n < ranges[i]; n++) walk(i + 1, at + n * terms[i].stride);
    };
    walk(0, spec.base);
    return out;
  };
  it("never reach the same byte from two entries, except bit flags of one dword and the fields of one placed unit", () => {
    const reach = ENTRIES.map((e) => {
      const fields = e.parts?.length ? e.parts.map((p) => bytes(p.address, p.width, e.args)) : [bytes(e.address, e.width === "bit" ? 4 : e.width, e.args)];
      const all = new Set<number>();
      for (const f of fields) for (const b of f) all.add(b);
      return all;
    });
    for (let i = 0; i < ENTRIES.length; i++) for (let j = i + 1; j < ENTRIES.length; j++) {
      const a = ENTRIES[i], b = ENTRIES[j];
      if (a.width === "bit" && b.width === "bit" && a.address.base === b.address.base) continue;
      // Fields of one struct (placed units) interleave by design: same stride, different offsets.
      const sameStruct = a.address.terms?.[0]?.stride === 336 && b.address.terms?.[0]?.stride === 336;
      if (sameStruct) continue;
      let overlap = false;
      for (const x of reach[i]) if (reach[j].has(x)) { overlap = true; break; }
      expect(overlap, `${a.id} and ${b.id}`).toBe(false);
    }
  });
});
