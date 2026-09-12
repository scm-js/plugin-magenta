/**
 * A catalogue row as a sentence: the entry's template with its arguments, the value and
 * the comparison or modifier as chips. Chips here are `echip`s — they name a slot of the
 * entry rather than a field of the record, and the row's editor lowers the whole row
 * again after any of them changes.
 */
import { enumerated } from "../catalogue";
import type { EntryArg } from "../catalogue/types";
import type { EudRow } from "./eud";
import type { Namer } from "./names";
import { opLabel, type Segment } from "./sentences";

export type EudSlot = "value" | "op" | { arg: EntryArg };

export interface EudChip {
  kind: "echip";
  slot: EudSlot;
  value: number;
  label: string;
}

export type EudSegment = Segment | EudChip;

/** The words for an entry argument's value. */
export function eudArgLabel(arg: EntryArg, value: number, namer: Namer, extra: { weapon(id: number): string; upgrade(id: number): string; tech(id: number): string; key(code: number): string }): string {
  switch (arg.kind) {
    case "unit": return namer.unit(value);
    case "player": return namer.player(value);
    case "weapon": return extra.weapon(value);
    case "upgrade": return extra.upgrade(value);
    case "tech": return extra.tech(value);
    case "key": return extra.key(value);
    case "unitIndex": return `#${value}`;
    default: return String(value);
  }
}

/** The words for the value: a choice's label, an id's name, or the number with its unit. */
export function eudValueLabel(row: EudRow, namer: Namer, extra: { weapon(id: number): string }): string {
  const v = row.entry.value;
  if (v?.choices) return v.choices.find((c) => c.value === row.value)?.label ?? String(row.value);
  if (v?.kind === "unit") return namer.unit(row.value);
  if (v?.kind === "player") return namer.player(row.value);
  if (v?.kind === "weapon") return extra.weapon(row.value);
  const n = Number.isInteger(row.value) ? String(row.value) : row.value.toFixed(2).replace(/\.?0+$/, "");
  return v?.unit ? `${n} ${v.unit}` : n;
}

export function describeEud(row: EudRow, kind: "condition" | "action", namer: Namer, extra: { weapon(id: number): string; upgrade(id: number): string; tech(id: number): string; key(code: number): string }): EudSegment[] {
  const template = (kind === "condition" ? row.entry.sentence.condition : row.entry.sentence.action) ?? row.entry.name;
  const out: EudSegment[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) out.push({ kind: "text", text: template.slice(last, m.index) });
    const name = m[1];
    if (name === "value") out.push({ kind: "echip", slot: "value", value: row.value, label: eudValueLabel(row, namer, extra) });
    else if (name === "cmp" || name === "mod") {
      if (!enumerated(row.entry)) out.push({ kind: "echip", slot: "op", value: row.op, label: opLabel(kind === "condition" ? "comparison" : "modifier", row.op, namer) });
    } else {
      const arg = row.entry.args.find((a) => a.name === name);
      if (arg) out.push({ kind: "echip", slot: { arg }, value: row.args[arg.name] ?? 0, label: eudArgLabel(arg, row.args[arg.name] ?? 0, namer, extra) });
    }
    last = re.lastIndex;
  }
  if (last < template.length) out.push({ kind: "text", text: template.slice(last) });
  return out;
}

/** Windows virtual-key codes for the keys a map would test, by name. */
export const KEYS: { code: number; label: string }[] = [
  ...Array.from({ length: 26 }, (_, i) => ({ code: 0x41 + i, label: String.fromCharCode(65 + i) })),
  ...Array.from({ length: 10 }, (_, i) => ({ code: 0x30 + i, label: String(i) })),
  ...Array.from({ length: 12 }, (_, i) => ({ code: 0x70 + i, label: `F${i + 1}` })),
  { code: 0x20, label: "Space" }, { code: 0x0d, label: "Enter" }, { code: 0x1b, label: "Esc" }, { code: 0x09, label: "Tab" },
  { code: 0x10, label: "Shift" }, { code: 0x11, label: "Ctrl" }, { code: 0x12, label: "Alt" },
  { code: 0x25, label: "Left" }, { code: 0x26, label: "Up" }, { code: 0x27, label: "Right" }, { code: 0x28, label: "Down" },
  { code: 0x08, label: "Backspace" }, { code: 0x2e, label: "Delete" }, { code: 0x2d, label: "Insert" }, { code: 0x24, label: "Home" }, { code: 0x23, label: "End" }, { code: 0x21, label: "Page Up" }, { code: 0x22, label: "Page Down" },
];

export const keyLabel = (code: number): string => KEYS.find((k) => k.code === code)?.label ?? `key 0x${code.toString(16).toUpperCase()}`;
