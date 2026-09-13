/**
 * A text hook's parts as one line a map maker edits: counters appear as `{Name}` and
 * come back as counter parts. An unnamed cell reads as `{P1's Cantina deaths}`, which
 * also parses, so nothing is lost when a counter loses its name.
 */
import type { Cell } from "./counters";
import type { TextPart } from "./builds";

export interface CounterNames {
  /** The name of a cell, or null. */
  name(cell: Cell): string | null;
  /** The cell for a name (a counter's, or the fallback spelling), or null. */
  cell(name: string): Cell | null;
}

export function partsToText(parts: TextPart[], names: CounterNames): string {
  return parts.map((p) => ("text" in p ? p.text.replace(/[{}]/g, (c) => `\\${c}`) : `{${names.name(p.counter) ?? `${p.counter[0]}:${p.counter[1]}`}}`)).join("");
}

export function textToParts(text: string, names: CounterNames): TextPart[] {
  const out: TextPart[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ text: buf }); buf = ""; } };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && (text[i + 1] === "{" || text[i + 1] === "}")) { buf += text[i + 1]; i++; continue; }
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end > i) {
        const inner = text.slice(i + 1, end).trim();
        const raw = /^(\d{1,2}):(\d{1,3})$/.exec(inner);
        const cell = raw ? ([Number(raw[1]), Number(raw[2])] as Cell) : names.cell(inner);
        if (cell) { flush(); out.push({ counter: cell }); i = end; continue; }
      }
    }
    buf += ch;
  }
  flush();
  return out;
}
