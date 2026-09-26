/**
 * The plugin's words in the editor's language. The UI asks `api.i18n.t` directly; the
 * model (sentences, checks, the explanation) has no `api` in reach, so it asks `t` here,
 * which the plugin points at `api.i18n.t` when it activates. Until then — in the tests —
 * `t` fills the English with the editor's grammar (`{name}`, `{n, plural, …}`,
 * `{x, select, …}`), so the English a test reads is the English the editor shows.
 *
 * `msg("…")` marks a string kept in a table: English where written, `translate(value)`
 * where shown. `tests/ko.test.ts` reads `t("…")`, `tc("…")` and `msg("…")` literals out of
 * the source, so every key has to be written out in full, once.
 */
export type Params = Record<string, string | number>;
interface Translator {
  t(text: string, params?: Params): string;
  tc(context: string, text: string, params?: Params): string;
}

const ENGLISH: Translator = { t: (text, params) => format(text, params), tc: (_context, text, params) => format(text, params) };
let current: Translator = ENGLISH;

/** Point `t` at the editor's translator (`api.i18n`, on activation), or back at plain English (null). */
export function setTranslator(i18n: Translator | null): void {
  current = i18n ?? ENGLISH;
}

/** The text in the editor's language, placeholders filled. */
export function t(text: string, params?: Params): string {
  return current.t(text, params);
}

/** `t` for a word meant two ways: the context tells the translations apart ("to" a value, "to" a place). */
export function tc(context: string, text: string, params?: Params): string {
  return current.tc(context, text, params);
}

/** A string kept in a table: English, marked for the catalogue; shown through `translate`. */
export function msg(text: string): string {
  return text;
}

/** `t` for a text that is not a literal here — one `msg()` marked in a table, or the catalogue's. */
export function translate(text: string, params?: Params): string {
  return current.t(text, params);
}

/* ── The editor's grammar, for the English ── */

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

function parseBranches(options: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < options.length) {
    const open = options.indexOf("{", i);
    if (open < 0) break;
    const close = matchBrace(options, open);
    if (close < 0) break;
    const key = options.slice(i, open).trim();
    if (key) out.set(key, options.slice(open + 1, close));
    i = close + 1;
  }
  return out;
}

function placeholder(inner: string, params: Params | undefined): string {
  const comma = inner.indexOf(",");
  if (comma < 0) {
    const bar = inner.indexOf("|");
    const name = (bar < 0 ? inner : inner.slice(0, bar)).trim();
    const value = params?.[name];
    if (value === undefined) return `{${inner}}`;
    return bar < 0 ? String(value) : josa(String(value), inner.slice(bar + 1).trim());
  }
  const name = inner.slice(0, comma).trim();
  const rest = inner.slice(comma + 1);
  const comma2 = rest.indexOf(",");
  if (comma2 < 0) return `{${inner}}`;
  const kind = rest.slice(0, comma2).trim();
  const value = params?.[name];
  if (value === undefined) return `{${inner}}`;
  const branches = parseBranches(rest.slice(comma2 + 1));
  if (kind === "plural" && typeof value === "number") {
    const branch = branches.get(`=${value}`) ?? branches.get(new Intl.PluralRules("en").select(value)) ?? branches.get("other");
    return branch === undefined ? `{${inner}}` : format(branch.replace(/#/g, new Intl.NumberFormat("en").format(value)), params);
  }
  if (kind === "select") {
    const branch = branches.get(String(value)) ?? branches.get("other");
    return branch === undefined ? `{${inner}}` : format(branch, params);
  }
  return `{${inner}}`;
}

/** `{name}`, `{n, plural, …}`, `{x, select, …}` and `{name|을}` filled from `params`; a placeholder with no value stays as written. */
export function format(message: string, params?: Params): string {
  if (!message.includes("{")) return message;
  let out = "";
  let i = 0;
  while (i < message.length) {
    const open = message.indexOf("{", i);
    if (open < 0) { out += message.slice(i); break; }
    const close = matchBrace(message, open);
    if (close < 0) { out += message.slice(i); break; }
    out += message.slice(i, open) + placeholder(message.slice(open + 1, close), params);
    i = close + 1;
  }
  return out;
}

/* ── Korean particles ── */

/** (after a final consonant, after a vowel) */
const JOSA: Record<string, [string, string]> = {
  "을": ["을", "를"], "를": ["을", "를"],
  "이": ["이", "가"], "가": ["이", "가"],
  "은": ["은", "는"], "는": ["은", "는"],
  "과": ["과", "와"], "와": ["과", "와"],
  "으로": ["으로", "로"], "로": ["으로", "로"],
};
/** Both forms at once, for text whose sound this cannot tell (a Latin name): 이(가), 을(를). */
const BOTH: Record<string, string> = { "을": "을(를)", "이": "이(가)", "은": "은(는)", "과": "과(와)", "으로": "(으)로" };
/** The final consonant of a digit's Korean reading (영 일 이 삼 사 오 육 칠 팔 구): 0 open, 8 ㄹ, anything else closed. */
const DIGIT_FINAL = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0];

/**
 * `value` with the particle that follows it, chosen by the last syllable — a Hangul
 * syllable, or a digit as it is read. Other text (a Latin unit name, a symbol) takes both
 * forms, 이(가), as the editor's own messages write them.
 */
export function josa(value: string, particle: string): string {
  const pair = JOSA[particle];
  if (!pair) return value + particle;
  const trimmed = value.replace(/[\s)\]"'.,%]+$/u, "");
  const last = trimmed.codePointAt(trimmed.length - 1) ?? 0;
  let final: number;
  if (last >= 0xac00 && last <= 0xd7a3) final = (last - 0xac00) % 28;
  else if (last >= 0x30 && last <= 0x39) final = DIGIT_FINAL[last - 0x30];
  else return value + (BOTH[pair[0]] ?? particle);
  const vowelLike = final === 0 || (pair[0] === "으로" && final === 8);
  return value + (vowelLike ? pair[1] : pair[0]);
}

/**
 * A translated template with its `{name}` placeholders replaced by parts — chips, text,
 * several of each. `{name|을}` puts the particle the part's last word takes after it.
 * Text outside placeholders comes back as strings, in order, so a Korean sentence can put
 * its chips where Korean puts them.
 */
export function compose<P>(template: string, parts: Record<string, P | string | readonly (P | string)[]>, textOf: (part: P) => string): (P | string)[] {
  const out: (P | string)[] = [];
  const re = /\{([^{}|]+)(?:\|([^{}]+))?\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    const name = m[1].trim();
    if (!(name in parts)) continue;
    if (m.index > last) out.push(template.slice(last, m.index));
    const value = parts[name];
    const list = (Array.isArray(value) ? value : [value]) as (P | string)[];
    out.push(...list);
    if (m[2]) {
      const tail = list.map((p) => (typeof p === "string" ? p : textOf(p))).join("");
      out.push(josa(tail, m[2].trim()).slice(tail.length));
    }
    last = re.lastIndex;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}
