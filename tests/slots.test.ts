import { describe, expect, it } from "vitest";
import { createdOfSlot, slotOfCreated, slotsOf } from "../src/model/slots";

describe("unit table slots", () => {
  it("gives slot 0 to the first unit and counts down from 1699 after it, as seen in the game", () => {
    // The probe map: Firebat, Marine, Ghost, Zealot → 5, 10, 15, 20 HP at slots 0, 1699, 1698, 1697.
    expect([0, 1, 2, 3].map(slotOfCreated)).toEqual([0, 1699, 1698, 1697]);
    expect([0, 1699, 1698, 1].map(createdOfSlot)).toEqual([0, 1, 2, 1699]);
    expect(createdOfSlot(1700)).toBe(-1);
  });
  it("skips start locations", () => {
    expect(slotsOf([32, 214, 0, 1])).toEqual([0, -1, 1699, 1698]);
  });
});
