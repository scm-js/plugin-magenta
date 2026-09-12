/**
 * The one search box: fuzzy matching over everything that can be added to a trigger —
 * the native conditions and actions, the catalogue's entries, the templates — ranked so
 * that what the user most likely meant is first.
 */
export interface SearchItem<T> {
  label: string;
  aliases?: readonly string[];
  group?: string;
  /** Wins a tie: the native definitions over the catalogue. */
  priority?: number;
  value: T;
}

export interface SearchHit<T> {
  item: SearchItem<T>;
  score: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** How well one text answers the query: 0 for no match; higher is better. */
function scoreText(text: string, query: string, words: string[]): number {
  const t = norm(text);
  if (!t) return 0;
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  const tw = t.split(" ");
  // Every query word starts some word of the text.
  if (words.every((w) => tw.some((x) => x.startsWith(w)))) return 60 + Math.min(10, 10 * words.length / tw.length);
  if (t.includes(query)) return 40;
  // Every query word appears somewhere.
  if (words.every((w) => t.includes(w))) return 30;
  // Subsequence of the letters, for typos-by-omission ("crt unt").
  let i = 0;
  for (const ch of t) if (ch === query[i]) i++;
  if (i === query.length && query.length >= 3) return 10;
  return 0;
}

export function search<T>(items: readonly SearchItem<T>[], query: string, options: { limit?: number; recent?: (value: T) => number } = {}): SearchHit<T>[] {
  const q = norm(query);
  const hits: SearchHit<T>[] = [];
  if (!q) {
    return items.slice(0, options.limit ?? items.length).map((item) => ({ item, score: 0 }));
  }
  const words = q.split(" ");
  for (const item of items) {
    let score = scoreText(item.label, q, words);
    // An alias never beats a match in the label itself.
    for (const alias of item.aliases ?? []) score = Math.max(score, Math.min(66, scoreText(alias, q, words) - 2));
    // Every query word found somewhere across the label and the aliases ("max hp": "max" in the label, "hp" an alias).
    if (score < 50) {
      const tokens = [...norm(item.label).split(" "), ...(item.aliases ?? []).flatMap((a) => norm(a).split(" "))];
      if (words.every((w) => tokens.some((tk) => tk.startsWith(w)))) score = Math.max(score, 55);
    }
    if (item.group) score = Math.max(score, scoreText(item.group, q, words) - 30);
    if (score <= 0) continue;
    score += options.recent?.(item.value) ?? 0;
    hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score || (b.item.priority ?? 0) - (a.item.priority ?? 0) || a.item.label.localeCompare(b.item.label));
  return options.limit ? hits.slice(0, options.limit) : hits;
}
