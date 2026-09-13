import { describe, expect, it } from "vitest";
import { partsToText, textToParts, type CounterNames } from "../src/model/textParts";

const names: CounterNames = {
  name: (cell) => (cell[0] === 7 && cell[1] === 181 ? "Score" : null),
  cell: (name) => (name.toLowerCase() === "score" ? [7, 181] : null),
};

describe("text parts", () => {
  it("writes counters as {Name} and reads them back", () => {
    const parts = [{ text: "Score: " }, { counter: [7, 181] as const }, { text: " points" }];
    const text = partsToText(parts as never, names);
    expect(text).toBe("Score: {Score} points");
    expect(textToParts(text, names)).toEqual(parts);
  });
  it("writes players and their colours as {Player N} and {Player N's colour}", () => {
    const parts = [{ color: 0 }, { player: 0 }, { text: " wins" }];
    expect(partsToText(parts as never, names)).toBe("{Player 1's colour}{Player 1} wins");
    expect(textToParts("{Player 1's colour}{player 1} wins", names)).toEqual(parts);
  });
  it("keeps an unnamed cell as player:unit, and braces that are not a counter as text", () => {
    expect(partsToText([{ counter: [1, 182] }], names)).toBe("{1:182}");
    expect(textToParts("{1:182}", names)).toEqual([{ counter: [1, 182] }]);
    expect(textToParts("{nobody} here", names)).toEqual([{ text: "{nobody} here" }]);
    expect(textToParts("a \\{b\\} c", names)).toEqual([{ text: "a {b} c" }]);
    expect(partsToText([{ text: "a {b}" }], names)).toBe("a \\{b\\}");
  });
});
