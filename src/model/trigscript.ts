/**
 * Magenta's rows as TrigScript (2026-10-25: TrigScript is the library). The rows that need code in the map — text with
 * counters in it, counter maths, a pass over units, a count, a read, a pick, a unit check, a moved location, a chat
 * command, a key, a click, the mouse over a location — were data a euddraft plugin of Magenta's turned into eudplib code
 * at build time. Now they are rendered as one TrigScript file, `magenta/main.ts`, and contributed to TrigScript's build
 * (`vendor/trigscript.ts`), which lays the program out into the saved map with the map's own script.
 *
 * The program runs as one player of the map, every frame, after the map's triggers have had their turn (as the hooks
 * did): for each build row in list order, `if (deaths(flag) == 1) { … }` — the trigger set the flag with its ordinary
 * Set Deaths action — and the flag cleared after the last row that watches it. What the players did this frame (a typed
 * line, a key, a click, where the mouse is) and what the unit checks find goes into their cells at the end of the turn,
 * so the *next* frame's triggers see it, and the inputs' cells are cleared again at the top of the turn after that: a
 * press or a message is true for one frame of triggers, as before, one frame later than through eudplib's hooks.
 *
 * Nothing here needs the map's names: players are P1 … P12, unit types and locations their numbers cast. A row the
 * language cannot render yet is left out and said (`unsupported`), and the Build dialog shows it; a row it renders in
 * part is noted (`notes`).
 */
import type { BuildOptions, BuildRecord, ChatCell, ChatRecord, ForEachDo, Msqc, TextPart, UnitField, UnitFilter } from "./builds";
import { isChatPattern } from "./builds";
import type { Cell } from "./counters";
import { t } from "../i18n";

/** A location's edges in map pixels. */
export interface Bounds { left: number; top: number; right: number; bottom: number }

export interface RenderInput {
  /** The build rows in the order the list shows their triggers (`orderBuilds`). */
  builds: readonly BuildRecord[];
  chat: ChatCell | null;
  msqc: Msqc | null;
  options: BuildOptions;
  /** The human slots (0-based): whose keys, clicks, mice and typed lines the program reads. */
  humans: readonly number[];
  /** The slot the program runs as (0-based): a human or a computer of the map. */
  owner: number;
  /** A location's edges as the map has them now, by its 1-based number; null when the map has no such location. */
  bounds(location: number): Bounds | null;
}

export interface Rendered {
  /** The file `magenta/main.ts`. */
  source: string;
  /** The rows the language cannot take yet, each with why, in the user's words; `id` null for a map-wide option. */
  unsupported: { id: string | null; why: string }[];
  /** Rows rendered in part, each with what is left out. */
  notes: { id: string; note: string }[];
}

/** The one file Magenta contributes, and its path in the build. */
export const ENTRY = "magenta/main.ts";

/* ── the language's spelling of Magenta's numbers ── */

const player = (slot: number) => `P${slot + 1}`;
const unitType = (id: number) => `(${id} as UnitType)`;
const location = (n: number) => `(${n} as Location)`;
const cell = (c: Cell) => `deaths(${player(c[0])}, ${unitType(c[1])})`;
const setCell = (c: Cell, value: string) => `setDeaths(${player(c[0])}, ${unitType(c[1])}, "set", ${value});`;

/** `allUnits({ … })` for a row's filter; every part left out matches all. */
function units(f: UnitFilter): string {
  const parts: string[] = [];
  if (f.unit !== null) parts.push(`type: ${unitType(f.unit)}`);
  if (f.owner !== null) parts.push(`owner: ${player(f.owner)}`);
  if (f.location !== null) parts.push(`at: ${location(f.location)}`);
  return parts.length ? `allUnits({ ${parts.join(", ")} })` : "allUnits()";
}

/** A unit's field as the language reads it (a yes-or-no field as 1 or 0). */
function field(u: string, f: UnitField): string {
  switch (f) {
    case "hp": case "shields": case "energy": case "kills": case "x": case "y": case "resources": case "cooldown": case "buildTime": case "speed": return `${u}.${f}`;
    case "order": return `${u}.orderId`;
    case "underAttack": case "burrowed": case "hasTarget": case "inTransport": return `(${u}.${f} ? 1 : 0)`;
    case "hpPct": return `${u}.hp * 100 / ${u}.maxHp`;
    case "shieldsPct": return `${u}.shields * 100 / ${u}.maxShields`;
    case "energyPct": return `${u}.energy * 100 / 250`;
    case "unitType": return `${u}.type`;
    case "owner": return `${u}.owner`;
  }
}

/** A text's part inside a template literal: the editor's `<HH>` is a byte of the game's, a backtick or a `${` its own. */
function literal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${").replace(/<([0-9A-Fa-f]{2})>/g, (_, hex: string) => `\\x${hex.toUpperCase()}`);
}

function textOf(parts: readonly TextPart[]): string {
  return "`" + parts.map((p) => "text" in p ? literal(p.text) : "counter" in p ? `\${${cell(p.counter)}}` : "player" in p ? `\${name(${player(p.player)})}` : `\${color(${player(p.color)})}`).join("") + "`";
}

/** A pass verb on one unit (`u`), as statements; null for one the language cannot do yet. */
function verb(u: string, d: ForEachDo): { lines: string[]; note?: string } | null {
  if ("set" in d) return { lines: [`${u}.${d.set} = ${d.value};`] };
  if ("kill" in d) return { lines: [`${u}.kill();`] };
  if ("remove" in d) return { lines: [`${u}.remove();`] };
  if ("invincible" in d) return { lines: [`${u}.invincible = ${d.invincible};`] };
  if ("hallucination" in d) return { lines: [`${u}.hallucinated = ${d.hallucination};`] };
  if ("speed" in d) return { lines: [`${u}.speedUpgrade = ${d.speed};`] };
  // (A cloak write showed nothing in the game; walking through anything and the cooldown upgrade have no word in the language.)
  if ("status" in d) return null;
  if ("give" in d) return { lines: [`${u}.give(${player(d.give)});`] };
  if ("locate" in d) return { lines: [`${u}.locate(${location(d.locate)});`] };
  if ("order" in d) return { lines: [`${u}.order("${d.order}", ${location(d.location)});`] };
  if ("timer" in d) return { lines: [`${u}.${d.timer} = ${d.value};`] };
  // (The language's cooldown is the three at once: the ground weapon's, the air weapon's and the spells'.)
  if ("cooldown" in d) return { lines: [`${u}.cooldown = ${d.cooldown};`] };
  if ("adjust" in d) {
    const n = Math.abs(d.delta);
    if (d.adjust === "hp") return { lines: [d.delta < 0 ? `${u}.damage(${n});` : `${u}.heal(${n});`] };
    const top = d.adjust === "shields" ? `${u}.maxShields` : "250";
    return { lines: [d.delta < 0 ? `${u}.${d.adjust} = Math.max(${u}.${d.adjust} - ${n}, 0);` : `${u}.${d.adjust} = Math.min(${u}.${d.adjust} + ${n}, ${top});`] };
  }
  return null;
}

/** The key a virtual-key code is to TrigScript, or null for one it does not take (F2–F6, which Remastered keeps). */
export function keyNameOf(code: number): string | null {
  if (code >= 0x41 && code <= 0x5a) return String.fromCharCode(code);
  if (code >= 0x30 && code <= 0x39) return String.fromCharCode(code);
  if (code >= 0x70 && code <= 0x7b) { const n = code - 0x6f; return n >= 2 && n <= 6 ? null : `F${n}`; }
  if (code >= 0x60 && code <= 0x69) return `Numpad${code - 0x60}`;
  const named: Record<number, string> = { 0x20: "Space", 0x0d: "Enter", 0x1b: "Escape", 0x09: "Tab", 0x10: "Shift", 0x11: "Ctrl", 0x12: "Alt", 0x25: "Left", 0x26: "Up", 0x27: "Right", 0x28: "Down", 0x08: "Backspace", 0x2e: "Delete", 0x2d: "Insert", 0x24: "Home", 0x23: "End", 0x21: "PageUp", 0x22: "PageDown" };
  return named[code] ?? null;
}

const BUTTONS: Record<string, string> = { L: "left", R: "right", M: "middle" };

export function renderScript(input: RenderInput): Rendered {
  const unsupported: Rendered["unsupported"] = [];
  const notes: Rendered["notes"] = [];
  const body: string[] = [];
  const line = (depth: number, text: string) => body.push("  ".repeat(depth) + text);
  const chats = input.builds.filter((b): b is ChatRecord => b.kind === "chat");
  const hooks = input.builds.filter((b): b is Exclude<BuildRecord, { kind: "chat" | "scan" }> => b.kind !== "chat" && b.kind !== "scan");
  const scans = input.builds.filter((b): b is Extract<BuildRecord, { kind: "scan" }> => b.kind === "scan");
  const msqc = input.msqc;
  const keys = msqc ? Object.entries(msqc.keys).map(([code, unit]) => ({ code: Number(code), unit })) : [];
  const clicks = msqc ? Object.entries(msqc.clicks) : [];
  const mouseIn = msqc ? Object.entries(msqc.mouseIn).map(([loc, unit]) => ({ location: Number(loc), unit })) : [];
  const no = (id: string | null, why: string) => unsupported.push({ id, why });

  /* ── the inputs' cells, cleared: what was set at the end of the turn before was one frame's ── */
  const cleared: string[] = [];
  if (chats.length && input.chat) {
    cleared.push(setCell(input.chat.cell, "0"));
    if (input.chat.args && chats.some(isChatPattern)) cleared.push(setCell(input.chat.args.pattern, "0"));
  }
  for (const p of input.humans) {
    for (const k of keys) cleared.push(setCell([p, k.unit], "0"));
    for (const [, unit] of clicks) cleared.push(setCell([p, unit], "0"));
  }
  if (cleared.length) {
    line(2, "// A press, a click or a typed line is true for one frame of triggers: cleared before this frame's are read.");
    for (const c of cleared) line(2, c);
  }

  /* ── the rows, in list order; a flag cleared after the last row that watches it ── */
  const lastOf = new Map<string, string>();
  for (const h of hooks) lastOf.set(`${h.flag[0]}:${h.flag[1]}`, h.id);
  if (hooks.length) line(2, "// The build rows: each when its trigger set the flag this frame, in the order of the list.");
  for (const h of hooks) {
    const inner: string[] = [];
    const put = (text: string) => inner.push(text);
    let ok = true;
    switch (h.kind) {
      case "text":
        put(`print(${textOf(h.parts)}, { to: ${h.to === "all" ? "AllPlayers" : player(h.to)} });`);
        break;
      case "math": {
        const a = cell(h.a), b = typeof h.b === "number" ? String(h.b) : cell(h.b);
        put(setCell(h.to, h.op === "mul" ? `${a} * ${b}` : h.op === "div" ? `${a} / ${b}` : h.op === "mod" ? `${a} % ${b}` : `random(${b})`));
        break;
      }
      case "foreach": {
        const v = verb("u", h.do);
        if (!v) { no(h.id, t("this pass's verb is not in the language yet")); ok = false; break; }
        if (v.note) notes.push({ id: h.id, note: v.note });
        put(`for (const u of ${units(h)}) {`);
        for (const l of v.lines) put(`  ${l}`);
        put("}");
        break;
      }
      case "count":
        put("let n = 0;");
        put(`for (const u of ${units(h)}) n += 1;`);
        put(setCell(h.to, "n"));
        break;
      case "read": {
        const f = field("u", h.field);
        put("let v = 0;");
        put("let seen = 0;");
        put(`for (const u of ${units(h)}) {`);
        put(`  if (seen == 0) { v = ${f}; seen = 1; }`);
        put("}");
        put(setCell(h.to, "v"));
        break;
      }
      case "pick": {
        const measure = h.by === "nearest" ? "distance" : h.by === "random" ? null : field("u", h.field);
        if (h.by === "random") {
          put(`const found = randomUnit(${units(h)});`);
          put("const best = 0;");
        } else {
          if (h.by === "nearest") {
            if (typeof h.near === "number") {
              if (!input.bounds(h.near)) { no(h.id, t("the pick measures from location {n}, which the map no longer has", { n: h.near })); ok = false; break; }
              // (The location's centre where it is now: a row that moves it is followed.)
              put(`const b = bounds(${location(h.near)});`);
              put("const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;");
            } else if (h.near && typeof h.near === "object") {
              put(`const cx = mouse(${player(h.near.mouse)}).x, cy = mouse(${player(h.near.mouse)}).y;`);
            } else { no(h.id, t("the pick measures from nothing")); ok = false; break; }
          }
          put(`let best = ${h.by === "max" ? "-1" : "2147483647"};`);
          put("let found: Unit | null = null;");
          put(`for (const u of ${units(h)}) {`);
          put(`  const v = ${h.by === "nearest" ? "Math.abs(u.x - cx) + Math.abs(u.y - cy)" : measure};`);
          put(`  if (v ${h.by === "max" ? ">" : "<"} best) { best = v; found = u; }`);
          put("}");
          if (h.by === "nearest" && h.radius !== null && h.radius !== undefined) put(`if (best > ${h.radius}) found = null;`);
        }
        const v = h.do ? verb("found", h.do) : null;
        if (h.do && !v) { no(h.id, t("this pick's verb is not in the language yet")); ok = false; break; }
        if (v?.note) notes.push({ id: h.id, note: v.note });
        put("if (found) {");
        if (h.locate !== null) put(`  found.locate(${location(h.locate)});`);
        if (h.to) put(`  ${setCell(h.to, "best")}`);
        for (const l of v?.lines ?? []) put(`  ${l}`);
        put("}");
        if (h.to) { put("else {"); put(`  ${setCell(h.to, "0")}`); put("}"); }
        break;
      }
      case "setloc": {
        if (!input.bounds(h.location)) { no(h.id, t("the row moves location {n}, which the map no longer has", { n: h.location })); ok = false; break; }
        // The location's edges where they are now, written one at a time: its size is read in play when the row keeps it.
        put(`const b = bounds(${location(h.location)});`);
        if (h.relative) {
          const by = (edge: string, d: number) => { if (d > 0) put(`b.${edge} += ${d};`); else if (d < 0) put(`b.${edge} -= ${-d};`); };
          by("left", h.x); by("top", h.y);
          if (h.width === null) by("right", h.x); else put(`b.right = b.left + ${h.width};`);
          if (h.height === null) by("bottom", h.y); else put(`b.bottom = b.top + ${h.height};`);
        } else {
          if (h.width === null) put("const w = b.right - b.left;");
          if (h.height === null) put("const h = b.bottom - b.top;");
          put(`b.left = ${h.x}; b.top = ${h.y};`);
          put(`b.right = ${h.width === null ? `${h.x} + w` : h.x + h.width}; b.bottom = ${h.height === null ? `${h.y} + h` : h.y + h.height};`);
        }
        break;
      }
    }
    if (!ok) { line(2, `// Row ${h.id} left out: ${unsupported[unsupported.length - 1].why}`); continue; }
    line(2, `if (${cell(h.flag)} == 1) {`);
    for (const l of inner) line(3, l);
    if (lastOf.get(`${h.flag[0]}:${h.flag[1]}`) === h.id) line(3, setCell(h.flag, "0"));
    line(2, "}");
  }

  /* ── what the players did this frame, for the next frame's triggers ── */
  const input_: string[] = [];
  if (chats.length && input.chat) {
    const chat = input.chat;
    let k = 0;
    for (const c of chats) {
      if (c.arg === "number") {
        if (!chat.args) { no(c.id, t("the chat command's number has no cell to land in; add the command again")); continue; }
        for (const p of input.humans) {
          const m = `m${k++}`;
          input_.push(`const ${m} = chatted(${player(p)}, ${JSON.stringify(`${c.message} {n}`)});`);
          input_.push(`if (${m}) { ${setCell(chat.args.pattern, String(c.value))} ${setCell(chat.args.number, `${m}.n`)} }`);
        }
      } else if (isChatPattern(c)) {
        no(c.id, t("a chat pattern of your own (^…$) is not in the language yet; write the message, or the message followed by a number"));
      } else {
        for (const p of input.humans) input_.push(`if (chatted(${player(p)}, ${JSON.stringify(c.message)})) ${setCell(chat.cell, String(c.value))}`);
      }
    }
  }
  for (const k of keys) {
    const name = keyNameOf(k.code);
    if (!name) { no(null, t("the key with code {code} is one StarCraft: Remastered reports no press of, or none the language names", { code: k.code })); continue; }
    for (const p of input.humans) input_.push(`if (keyPressed(${player(p)}, ${JSON.stringify(name)})) ${setCell([p, k.unit], "1")}`);
  }
  for (const [button, unit] of clicks) {
    for (const p of input.humans) input_.push(`if (clicked(${player(p)}, "${BUTTONS[button] ?? "left"}")) ${setCell([p, unit], "1")}`);
  }
  for (const m of mouseIn) {
    if (!input.bounds(m.location)) { no(null, t("the mouse is read over location {n}, which the map no longer has", { n: m.location })); continue; }
    // (The location's edges where they are now: a row that moves it is followed.)
    const b = `mb${m.location}`;
    input_.push(`const ${b} = bounds(${location(m.location)});`);
    for (const p of input.humans) {
      input_.push(`const mp${p}_${m.location} = mouse(${player(p)});`);
      input_.push(`if (mp${p}_${m.location}.x >= ${b}.left && mp${p}_${m.location}.x <= ${b}.right && mp${p}_${m.location}.y >= ${b}.top && mp${p}_${m.location}.y <= ${b}.bottom) ${setCell([p, m.unit], "1")}`);
      input_.push(`else ${setCell([p, m.unit], "0")}`);
    }
  }
  if (msqc?.select) no(null, t("the selected unit is not carried yet"));
  if (input_.length) {
    line(2, "// What the players did this frame, for the next frame's triggers.");
    for (const l of input_) line(2, l);
  }

  /* ── the unit checks, fresh for the next frame's triggers ── */
  if (scans.length) line(2, "// The unit checks: 1 while some matching unit's field compares so, else 0.");
  for (const s of scans) {
    const f = field("u", s.field);
    const cmp = s.cmp === "=" ? "==" : s.cmp;
    line(2, "{");
    line(3, "let hit = 0;");
    line(3, `for (const u of ${units(s)}) {`);
    line(4, `if (${f} ${cmp} ${s.value}) hit = 1;`);
    line(3, "}");
    line(3, setCell(s.cell, "hit"));
    line(2, "}");
  }

  /* ── the map-wide options: a program of each human's own for the camera and for the music ── */
  const extra: string[] = [];
  const everyone = input.humans.map(player).join(", ");
  if (input.options.camera && input.humans.length) {
    const c = input.options.camera;
    if (!input.bounds(c.location)) no(null, t("the camera follows location {n}, which the map no longer has", { n: c.location }));
    else extra.push(...[
      "// The camera glides after the location, for each human: every frame a step of the way there, the distance divided by the",
      "// inertia and capped at the top speed, as euddraft's cammove did.",
      `const VIEW = reserveLocation("Magenta: where the camera looks");`,
      "program(() => {",
      `  const b0 = bounds(${location(c.location)});`,
      "  let cx = (b0.left + b0.right) / 2;",
      "  let cy = (b0.top + b0.bottom) / 2;",
      "  while (true) {",
      `    const b = bounds(${location(c.location)});`,
      "    const tx = (b.left + b.right) / 2, ty = (b.top + b.bottom) / 2;",
      `    cx += clamp((tx - cx) / ${Math.max(1, c.inertia)}, -${c.maxspeed}, ${c.maxspeed});`,
      `    cy += clamp((ty - cy) / ${Math.max(1, c.inertia)}, -${c.maxspeed}, ${c.maxspeed});`,
      "    centerLocation(VIEW, cx, cy, 32, 32);",
      "    centerView(VIEW);",
      "    sleep(frames(1));",
      "  }",
      `}, { owner: [${everyone}], name: "Magenta camera" });`,
    ]);
  }
  if (input.options.bgm && input.humans.length) {
    const m = input.options.bgm;
    extra.push(...[
      "// The background music: the sound played again each time its length has passed, for each human.",
      "program(() => {",
      "  while (true) {",
      `    playWav(${JSON.stringify(m.path)}, ${Math.round(m.length * 1000)});`,
      `    sleep(frames(${Math.max(1, Math.round(m.length * 24))}));`,
      "  }",
      `}, { owner: [${everyone}], name: "Magenta music" });`,
    ]);
  }
  if (input.options.noAirCollision) no(null, t("air units passing through one another was a code patch of euddraft's, which TrigScript's build does not have"));
  if (input.options.unlimiter) no(null, t("lifting the sprite and image limits was a code patch of euddraft's, which TrigScript's build does not have"));

  const source = [
    "// Magenta's rows, rendered for TrigScript's build. Made from the map's Magenta data on every save: do not edit.",
    "// Each build row runs when its trigger set the flag, after the map's triggers; what the players did, and what the unit",
    "// checks find, goes into its cell for the next frame's triggers.",
    "program(() => {",
    "  while (true) {",
    ...body,
    "    sleep(frames(1));",
    "  }",
    `}, { owner: ${player(input.owner)}, name: "Magenta" });`,
    ...(extra.length ? ["", ...extra] : []),
    "",
  ].join("\n");
  return { source, unsupported, notes };
}
