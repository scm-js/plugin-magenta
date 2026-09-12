import { describe, expect, it } from "vitest";
import { Comparison, SetModifier } from "../vendor/triggers";
import { ENTRIES, GROUPS, enumerated, entry } from "../src/catalogue";
import { DEATHS_TABLE, MASK_MARKER, addressOf, entryAddress, epd, lowerAction, lowerCondition, recognizeAction, recognizeCondition, type EudRow } from "../src/model/eud";

const slots = (t: string) => [...t.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);

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
      if (e.width === "bit") expect(e.bit, e.id).toBeDefined();
      if (e.kind === "condition") expect(e.remastered.read, e.id).toBe(true);
      if (e.kind !== "condition") expect(e.remastered.write, e.id).toBe(true);
    }
  });

  it("stays inside a dword for byte and word fields at every index", () => {
    for (const e of ENTRIES) {
      if (e.width === 4 || e.width === "bit") continue;
      const stride = e.address.terms?.[0]?.stride ?? 4;
      // A word field must not straddle a dword boundary at any index.
      for (let i = 0; i < 8; i++) {
        const address = e.address.base + i * stride;
        expect((address & 3) + e.width, `${e.id} at ${i}`).toBeLessThanOrEqual(4);
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
      const value = e.width === "bit" ? 1 : e.value?.choices ? e.value.choices[e.value.choices.length - 1].value : Math.min(e.value?.max ?? 100, 100);
      if (e.kind !== "condition") {
        const back = recognizeAction(lowerAction({ entry: e, args, value, op: SetModifier.Add }));
        expect(back?.entry.id, e.id).toBe(e.id);
        expect(back?.args, e.id).toEqual(args);
        expect(back?.value, e.id).toBe(value);
        expect(back?.op, e.id).toBe(enumerated(e) ? SetModifier.SetTo : SetModifier.Add);
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

describe("catalogue ranges", () => {
  it("never overlap, except bit flags of one dword", () => {
    const range = (e: (typeof ENTRIES)[number]) => {
      const width = e.width === "bit" ? 4 : e.width;
      let span = width;
      for (const t of e.address.terms ?? []) {
        const arg = e.args.find((a) => a.name === t.arg)!;
        span += (arg.max - 1) * t.stride;
      }
      return [e.address.base, e.address.base + span] as const;
    };
    for (let i = 0; i < ENTRIES.length; i++) for (let j = i + 1; j < ENTRIES.length; j++) {
      const a = ENTRIES[i], b = ENTRIES[j];
      if (a.width === "bit" && b.width === "bit" && a.address.base === b.address.base) continue;
      const [a0, a1] = range(a), [b0, b1] = range(b);
      const overlap = a0 < b1 && b0 < a1;
      // Fields of one struct (placed units) interleave by design: same stride, different offsets.
      const sameStruct = a.address.terms?.[0]?.stride === 336 && b.address.terms?.[0]?.stride === 336 && ((a.address.base - b.address.base) % 336 !== 0 || a.address.base === b.address.base);
      const sameUnitFieldOverlap = sameStruct && Math.abs(a.address.base - b.address.base) % 336 < 4 && a.address.base !== b.address.base && a.width !== "bit" && b.width !== "bit" && (a.width === 4 || b.width === 4);
      expect(overlap && !sameStruct || sameUnitFieldOverlap, `${a.id} and ${b.id}`).toBe(false);
    }
  });
});
