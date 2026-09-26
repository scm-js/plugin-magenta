import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KO } from "../ko";
import { format, josa, setTranslator } from "../src/i18n";
import { describeAction, describeCondition, sentenceText } from "../src/model/sentences";
import { ActionType, Comparison, ConditionType, SetModifier, emptyAction, emptyCondition } from "../vendor/triggers";
import { testNamer } from "./namer";
import { CONDITION_TEMPLATES, ACTION_TEMPLATES, BRIEFING_TEMPLATES } from "../src/model/sentences";
import { CONDITION_DEFS, ACTION_DEFS, BRIEFING_ACTION_DEFS } from "../vendor/triggerDefs";
import raw from "../src/catalogue/eud.json";

const root = new URL("..", import.meta.url).pathname;

/** The plugin's own source: `plugin.ts` and `src/` — not the tests, the build, the vendored copies or the generated Python. */
function sources(): string[] {
  const out = [join(root, "plugin.ts")];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (name !== "generated") walk(path); }
      else if (name.endsWith(".ts") && path !== join(root, "src", "i18n.ts")) out.push(path);
    }
  };
  walk(join(root, "src"));
  return out;
}

const unquote = (s: string) => JSON.parse(`"${s}"`) as string;
const LIT = String.raw`"((?:[^"\\]|\\.)*)"`;
// `t("…")`, `api.i18n.t("…")`, `deps.api.i18n.t("…")`, `tr("…")` (the model's `t` where a local `t` is the API's), `msg("…")`, `tc("context", "…")`.
const CALL = new RegExp(String.raw`\b(?:t|tr|msg)\(${LIT}`, "g");
const CONTEXT = new RegExp(String.raw`\btc\(${LIT},\s*${LIT}`, "g");

/** The catalogue's words the panel shows: names, sentences, argument labels, value units and choices, groups and notes (not the sources, which are citations). */
function catalogueKeys(): string[] {
  const json = raw as { groups: string[]; entries: { name: string; sentence: Record<string, string>; args: { label: string }[]; value?: { unit?: string; choices?: { label: string }[] }; note?: string }[] };
  return [
    ...json.groups,
    ...json.entries.flatMap((e) => [e.name, ...Object.values(e.sentence), ...e.args.map((a) => a.label), ...(e.value?.unit ? [e.value.unit] : []), ...(e.value?.choices?.map((c) => c.label) ?? []), ...(e.note ? [e.note] : [])]),
  ];
}

const keys = new Set<string>([
  ...sources().flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...[...text.matchAll(CALL)].map((m) => unquote(m[1])), ...[...text.matchAll(CONTEXT)].map((m) => `${unquote(m[1])}\u0004${unquote(m[2])}`)];
  }),
  ...catalogueKeys(),
]);

/** The top-level braces of a message, and the placeholders inside plural and select branches. */
function names(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "{") continue;
    let depth = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === "{") depth++; else if (s[j] === "}" && --depth === 0) break; }
    const inner = s.slice(i + 1, j);
    const comma = inner.indexOf(",");
    if (comma < 0) out.push(inner.split("|")[0].trim());
    else {
      out.push(inner.slice(0, comma).trim());
      // The branches: `one {…} other {…}`; their words are text, the placeholders in them are names.
      const rest = inner.slice(inner.indexOf(",", comma + 1) + 1);
      for (let k = 0; k < rest.length; k++) {
        if (rest[k] !== "{") continue;
        let d = 0, e = k;
        for (; e < rest.length; e++) { if (rest[e] === "{") d++; else if (rest[e] === "}" && --d === 0) break; }
        out.push(...names(rest.slice(k + 1, e)));
        k = e;
      }
    }
    i = j;
  }
  return [...new Set(out)].sort();
}
/** The counts a plural chooses its branch by: English needs them, Korean may drop them. */
const counts = (s: string) => new Set([...s.matchAll(/\{(\w+), plural/g)].map((m) => m[1]));

describe("the Korean catalogue", () => {
  it("has every string the plugin shows", () => {
    expect([...keys].filter((k) => !(k in KO))).toEqual([]);
  });

  it("has nothing the plugin no longer shows", () => {
    expect(Object.keys(KO).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("translates every entry", () => {
    expect(Object.entries(KO).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it("keeps every placeholder, and adds none", () => {
    for (const [en, ko] of Object.entries(KO)) {
      const want = names(en).filter((n) => !counts(en).has(n) || names(ko).includes(n));
      expect(names(ko), en).toEqual(want);
    }
  });

  it("names only the arguments a sentence's definition has", () => {
    const check = (templates: Record<number, string>, defs: { type: number; args: { label: string }[] }[]) => {
      for (const def of defs) {
        const en = templates[def.type];
        if (!en) continue;
        const labels = new Set(def.args.map((a) => a.label));
        expect(names(KO[en]).filter((n) => !labels.has(n)), en).toEqual([]);
      }
    };
    check(CONDITION_TEMPLATES, CONDITION_DEFS);
    check(ACTION_TEMPLATES, ACTION_DEFS);
    check(BRIEFING_TEMPLATES, BRIEFING_ACTION_DEFS);
  });
});

describe("a sentence in Korean", () => {
  const korean = { t: (text: string, params?: Record<string, string | number>) => format(KO[text] || text, params), tc: (context: string, text: string, params?: Record<string, string | number>) => format(KO[`${context}\u0004${text}`] || text, params) };
  afterEach(() => setTranslator(null));

  it("puts the chips where Korean puts them, with the particle each takes", () => {
    setTranslator(korean);
    const namer = testNamer({ locations: { 3: "비컨" }, counters: { "7:0": "점수" } });
    const bring = { ...emptyCondition(), type: ConditionType.Bring, player: 0, unitId: 0, location: 3, comparison: Comparison.AtLeast, amount: 5 };
    expect(sentenceText(describeCondition(bring, namer))).toBe("Player 1이 비컨에 Terran Marine을(를) 5기 이상 가져옴");
    const counter = { ...emptyCondition(), type: ConditionType.Deaths, player: 7, unitId: 0, comparison: Comparison.AtLeast, amount: 10 };
    expect(sentenceText(describeCondition(counter, namer))).toBe("점수가 10 이상");
    const add = { ...emptyAction(), type: ActionType.SetDeaths, player: 7, unitId: 0, modifier: SetModifier.Add, target: 1 };
    expect(sentenceText(describeAction(add, namer))).toBe("점수 추가: 1");
  });

  it("chooses a particle by the last syllable, a digit as it is read, and both forms for Latin text", () => {
    expect(josa("비컨", "을")).toBe("비컨을");
    expect(josa("점수", "이")).toBe("점수가");
    expect(josa("로케이션 2", "으로")).toBe("로케이션 2로");
    expect(josa("로케이션 1", "으로")).toBe("로케이션 1로");
    expect(josa("로케이션 3", "으로")).toBe("로케이션 3으로");
    expect(josa("Marine", "을")).toBe("Marine을(를)");
  });
});
