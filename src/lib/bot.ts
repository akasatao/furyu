import {
  BREEZY_BIAS,
  DENSE_BIAS,
  FIVE_POOL,
  SEVEN_POOL,
  VIBE_BUCKETS,
  type EndingVibe,
  type PhraseBucket,
} from "@/lib/bot-phrases";
import { PART_LIMITS, PART_TARGETS } from "@/lib/constants";
import { moraCount } from "@/lib/mora";
import type { Poem, VerseMode } from "@/types/game";

function charLen(text: string): number {
  return [...text].length;
}

function pickFrom<T>(items: T[], salt: string): T {
  if (items.length === 0) throw new Error("empty pool");
  let hash = 0;
  for (let i = 0; i < salt.length; i += 1) {
    hash = (hash + salt.charCodeAt(i) * (i + 3)) % 9973;
  }
  hash = (hash + salt.length * 17) % items.length;
  return items[hash] ?? items[0];
}

function contextLines(poem: Poem, upToExclusive: number): string[] {
  return poem.lines
    .slice(0, upToExclusive)
    .map((l) => l?.text ?? "")
    .filter(Boolean);
}

function lastChar(text: string): string {
  const chars = [...text.trim()];
  return chars[chars.length - 1] ?? "";
}

/** 直前句の末尾から軽い気分フックだけ取る（内容語は使わない） */
function endingVibe(prev: string): EndingVibe {
  const end = lastChar(prev);
  if (/[ただ]/.test(end)) return "past";
  if (/[てで]/.test(end)) return "te";
  if (/[ねよかな]/.test(end) || prev.endsWith("かな") || prev.endsWith("だね")) {
    return "soft";
  }
  return "other";
}

/** 末尾音 → 新しい句の頭音を軽く寄せる用（単語コピーはしない） */
function lastKanaHint(prev: string): string | null {
  const cleaned = prev.replace(/[、。！？!?！？\s　「」『』（）()・…―〜~]/g, "");
  const chars = [...cleaned];
  const last = chars[chars.length - 1] ?? "";
  // ひらがな／カタカナのみヒントにする
  if (/[ぁ-んァ-ヶー]/.test(last)) {
    const hira =
      last >= "ァ" && last <= "ヶ"
        ? String.fromCharCode(last.charCodeAt(0) - 0x60)
        : last;
    return hira;
  }
  return null;
}

function firstKana(line: string): string | null {
  for (const ch of line) {
    if (/[ぁ-ん]/.test(ch)) return ch;
    if (/[ァ-ヶ]/.test(ch)) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    }
  }
  return null;
}

function sameRow(a: string, b: string): boolean {
  const rows = [
    "あいうえお",
    "かきくけこがぎぐげご",
    "さしすせそざじずぜぞ",
    "たちつてとだぢづでど",
    "なにぬねの",
    "はひふへほばびぶべぼぱぴぷぺぽ",
    "まみむめも",
    "やゆよ",
    "らりるれろ",
    "わをん",
  ];
  return rows.some((row) => row.includes(a) && row.includes(b));
}

function preferredBuckets(prev: string | null): PhraseBucket[] {
  if (!prev) {
    return [
      "nature",
      "weather",
      "night",
      "food",
      "work",
      "love",
      "commute",
      "absurd",
      "quiet",
      "punchline",
    ];
  }

  const vibe = endingVibe(prev);
  const base = [...VIBE_BUCKETS[vibe]];
  const len = charLen(prev);

  // 短い句 → 歯切れ寄り、長い句 → ふわり寄り（軽く並べ替え）
  const bias = len <= 4 ? DENSE_BIAS : len >= 7 ? BREEZY_BIAS : [];
  const ordered = [
    ...bias.filter((b) => base.includes(b)),
    ...base.filter((b) => !bias.includes(b)),
  ];
  return ordered;
}

function poolFor(
  buckets: PhraseBucket[],
  target: number,
): string[] {
  const source = target >= 7 ? SEVEN_POOL : FIVE_POOL;
  const lines: string[] = [];
  for (const b of buckets) {
    lines.push(...source[b]);
  }
  // フォールバックで全バケットも少し混ぜる（単調回避）
  for (const all of Object.values(source)) {
    lines.push(...all);
  }
  return lines;
}

function isBrokenEnding(line: string): boolean {
  return /[にをがはでとへの]$/.test(line);
}

function fitsTarget(line: string, target: number, limit: number): boolean {
  // 表示文字数は上限のみ。五・七は読みの音数で厳密判定。
  if (charLen(line) > limit) return false;
  if (moraCount(line) !== target) return false;
  if (isBrokenEnding(line)) return false;
  return true;
}

/**
 * 直前句の内容語をボット句に含めない（オウム返し防止）。
 * 2文字以上の連続漢字・かな塊を禁止対象にする。
 */
function contentTokens(prev: string): string[] {
  const cleaned = prev.replace(/[、。！？!?！？\s　「」『』（）()・…―ー〜~]/g, "");
  const tokens = new Set<string>();
  const kanjiRuns = cleaned.match(/[\u4e00-\u9fff]{2,4}/g) ?? [];
  for (const k of kanjiRuns) tokens.add(k);
  const kanaRuns = cleaned.match(/[ぁ-んァ-ヶ]{3,6}/g) ?? [];
  for (const k of kanaRuns) tokens.add(k);
  // 単独でも目立つ名詞っぽい2文字漢字
  const pairs = cleaned.match(/[\u4e00-\u9fff]{2}/g) ?? [];
  for (const p of pairs) tokens.add(p);
  return [...tokens].filter((t) => charLen(t) >= 2);
}

function echoesPrev(line: string, prev: string): boolean {
  if (!prev) return false;
  for (const token of contentTokens(prev)) {
    if (line.includes(token)) return true;
  }
  return false;
}

function scoreLine(
  line: string,
  target: number,
  prev: string | null,
  preferred: PhraseBucket[],
  bucketOf: Map<string, PhraseBucket>,
): number {
  let score = 0;
  if (moraCount(line) === target) score += 5;

  const bucket = bucketOf.get(line);
  if (bucket) {
    const idx = preferred.indexOf(bucket);
    if (idx >= 0) score += Math.max(0, 6 - idx);
  }

  if (prev) {
    const hint = lastKanaHint(prev);
    const head = firstKana(line);
    if (hint && head) {
      if (hint === head) score += 2;
      else if (sameRow(hint, head)) score += 1;
    }
  }

  return score;
}

function buildBucketIndex(target: number): Map<string, PhraseBucket> {
  const source = target >= 7 ? SEVEN_POOL : FIVE_POOL;
  const map = new Map<string, PhraseBucket>();
  for (const [bucket, lines] of Object.entries(source) as [
    PhraseBucket,
    string[],
  ][]) {
    for (const line of lines) {
      if (!map.has(line)) map.set(line, bucket);
    }
  }
  return map;
}

export function pickBotLine(options: {
  mode: VerseMode;
  stepIndex: number;
  poem: Poem;
  seed?: string;
}): string {
  const { mode, stepIndex, poem, seed = "" } = options;
  const limit = PART_LIMITS[mode][stepIndex] ?? 10;
  const target = PART_TARGETS[mode][stepIndex] ?? 5;
  const prevLines = contextLines(poem, stepIndex);
  const prev = prevLines[prevLines.length - 1] ?? null;
  const salt = `${prev ?? ""}|${seed}|${stepIndex}|${target}`;

  // 隠しネタ：直前が「うんちぶり」なら必ず返す
  if (prev?.replace(/\s/g, "") === "うんちぶり") {
    return "うんちぶりぶり";
  }

  const preferred = preferredBuckets(prev);
  const candidates = poolFor(preferred, target)
    .filter((line) => fitsTarget(line, target, limit))
    .filter((line) => !prev || !echoesPrev(line, prev));

  const unique = [...new Set(candidates)];
  if (unique.length === 0) {
    const fallback = target >= 7 ? "そらをみあげる" : "それがじんせい";
    return fallback;
  }

  const bucketOf = buildBucketIndex(target);
  const scored = unique.map((line) => ({
    line,
    score: scoreLine(line, target, prev, preferred, bucketOf),
  }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]?.score ?? 0;
  // 同点帯から決定的に選ぶ（seed / 語尾でばらつく）
  const top = scored.filter((s) => s.score >= best - 2).map((s) => s.line);
  return pickFrom(top, salt);
}

export function botThinkDelayMs(contextLength = 0): number {
  const base = 1600;
  const extra = Math.min(2200, contextLength * 160);
  return base + extra + Math.floor(Math.random() * 1200);
}

export const BOT_NAMES = [
  "相方・はな",
  "相方・そら",
  "相方・もり",
  "相方・つき",
  "相方・かぜ",
];
