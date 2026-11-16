import { moraCountFromKana } from "@/lib/mora";
import { toKanji } from "@/lib/utils";

/** リレーで風流：五・七・五＝十七音を人数分。各ラウンド全員が一音書いて短冊を回す */
export const SHIRAZU_LINE_TARGETS = [5, 7, 5] as const;
export const SHIRAZU_MORA_PER_POEM = 17;
/** @deprecated 互換用エイリアス */
export const SHIRAZU_CHARS_PER_POEM = SHIRAZU_MORA_PER_POEM;

/** 単独で一音になる記号・促音・撥音 */
const SOLO_MORA = new Set(["っ", "ん", "ー"]);

/** よく使う拗音（二文字一音） */
const YOON_UNITS = [
  "きゃ",
  "きゅ",
  "きょ",
  "しゃ",
  "しゅ",
  "しょ",
  "ちゃ",
  "ちゅ",
  "ちょ",
  "にゃ",
  "にゅ",
  "にょ",
  "ひゃ",
  "ひゅ",
  "ひょ",
  "みゃ",
  "みゅ",
  "みょ",
  "りゃ",
  "りゅ",
  "りょ",
  "ぎゃ",
  "ぎゅ",
  "ぎょ",
  "じゃ",
  "じゅ",
  "じょ",
  "びゃ",
  "びゅ",
  "びょ",
  "ぴゃ",
  "ぴゅ",
  "ぴょ",
  "ふぁ",
  "ふぃ",
  "ふぇ",
  "ふぉ",
  "てぃ",
  "でぃ",
  "でゅ",
] as const;

const YOON_SET = new Set<string>(YOON_UNITS);
const YOON_BASES = new Set([...YOON_UNITS].map((u) => [...u][0]));

export interface ShirazuMoraLocation {
  lineIndex: number;
  /** 句内の何音目か（0始まり） */
  moraInLine: number;
  lineTarget: number;
}

export interface ShirazuLocation extends ShirazuMoraLocation {
  poemIndex: number;
  /** @deprecated moraInLine の別名 */
  charInLine: number;
}

/** 座席 seat がラウンド r で持つ短冊のインデックス */
export function shirazuPoemForSeat(
  seat: number,
  roundIndex: number,
  playerCount: number,
): number {
  const n = Math.max(1, playerCount);
  return ((seat - roundIndex) % n + n) % n;
}

/** ラウンド番号（0..16）→ 五・七・五のどの音か */
export function locateShirazuMora(roundIndex: number): ShirazuMoraLocation {
  if (roundIndex < 0 || roundIndex >= SHIRAZU_MORA_PER_POEM) {
    throw new Error(`Invalid shirazu round: ${roundIndex}`);
  }
  let rem = roundIndex;
  for (let lineIndex = 0; lineIndex < SHIRAZU_LINE_TARGETS.length; lineIndex += 1) {
    const lineTarget = SHIRAZU_LINE_TARGETS[lineIndex];
    if (rem < lineTarget) {
      return { lineIndex, moraInLine: rem, lineTarget };
    }
    rem -= lineTarget;
  }
  throw new Error(`Invalid shirazu round: ${roundIndex}`);
}

export function shirazuTotalSteps(playerCount: number): number {
  return SHIRAZU_MORA_PER_POEM * playerCount;
}

/** @deprecated 旧・1首完走順。CPU退避コード用 */
export function locateShirazuStep(stepIndex: number): ShirazuLocation {
  const poemIndex = Math.floor(stepIndex / SHIRAZU_MORA_PER_POEM);
  const mora = locateShirazuMora(stepIndex % SHIRAZU_MORA_PER_POEM);
  return {
    poemIndex,
    ...mora,
    charInLine: mora.moraInLine,
  };
}

/** 執筆中の進捗（手元の短冊基準。首番号は出さない） */
export function shirazuRoundProgressLabel(roundIndex: number): string {
  const { lineIndex, moraInLine, lineTarget } = locateShirazuMora(roundIndex);
  const lineNames = ["上の句", "中の句", "下の句"];
  return `${lineNames[lineIndex]}（${toKanji(moraInLine + 1)}／${toKanji(lineTarget)}音）`;
}

/** @deprecated 旧ラベル。shirazuRoundProgressLabel を使う */
export function shirazuProgressLabel(stepIndex: number, playerCount: number): string {
  const { poemIndex, lineIndex, moraInLine, lineTarget } =
    locateShirazuStep(stepIndex);
  const lineNames = ["上の句", "中の句", "下の句"];
  return `第${toKanji(poemIndex + 1)}首／${toKanji(playerCount)}首　${lineNames[lineIndex]}（${toKanji(moraInLine + 1)}／${toKanji(lineTarget)}音）`;
}

function isLatinLetter(ch: string): boolean {
  return /^[A-Za-z]$/.test(ch);
}

function isKanji(ch: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff々]/.test(ch);
}

/** 全角英字→半角、カタカナ→ひらがな */
function normalizeChar(ch: string): string | null {
  if (ch >= "Ａ" && ch <= "Ｚ") {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  }
  if (ch >= "ａ" && ch <= "ｚ") {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  }
  if (ch >= "ァ" && ch <= "ヶ") {
    return String.fromCharCode(ch.charCodeAt(0) - 0x60);
  }
  if (ch === "ー" || /[ぁ-ん]/.test(ch) || isLatinLetter(ch) || isKanji(ch)) {
    return ch;
  }
  return null;
}

/** 許可文字だけ残す（ひらがな・漢字・英字）。カタカナ・全角英字は半角／ひらがなへ */
export function toAllowedShirazuChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const n = normalizeChar(ch);
    if (n) out += n;
  }
  return out;
}

/** @deprecated toAllowedShirazuChars の旧名（ひらがな抽出） */
export function toHiraganaOnly(text: string): string {
  return [...toAllowedShirazuChars(text)]
    .filter((ch) => ch === "ー" || /[ぁ-ん]/.test(ch))
    .join("");
}

function isYoonPair(base: string, small: string): boolean {
  return YOON_SET.has(base + small);
}

/**
 * 入力中の下書きを最大一音ぶんまで残す。
 * ひらがな（拗音可）、漢字一文字、または英字一文字。
 */
export function clampShirazuDraft(raw: string): string {
  const allowed = toAllowedShirazuChars(raw);
  if (!allowed) return "";
  const chars = [...allowed];
  const first = chars[0] ?? "";

  // 英字・漢字は一文字だけ
  if (isLatinLetter(first) || isKanji(first)) return first;

  // 先頭が小書き（っ以外）なら捨てる
  if (/[ぁぃぅぇぉゃゅょゎ]/.test(first)) return "";

  if (SOLO_MORA.has(first) || !YOON_BASES.has(first)) {
    return first;
  }

  const second = chars[1];
  if (second && isYoonPair(first, second)) {
    return first + second;
  }
  return first;
}

/** 提出可能な一音か（ひらがな／拗音／漢字一文字／英字一文字） */
export function isValidShirazuMora(raw: string): boolean {
  const unit = clampShirazuDraft(raw);
  if (!unit) return false;
  const chars = [...unit];
  if (chars.length === 1) {
    if (isLatinLetter(chars[0]) || isKanji(chars[0])) return true;
    return (
      /[ぁ-んー]/.test(chars[0]) && !/[ぁぃぅぇぉゃゅょゎ]/.test(chars[0])
    );
  }
  if (chars.length === 2) {
    return isYoonPair(chars[0], chars[1]) && moraCountFromKana(unit) === 1;
  }
  return false;
}

/** 提出用に正規化した一音文字列。不正なら空 */
export function normalizeShirazuMora(raw: string): string {
  const unit = clampShirazuDraft(raw);
  return isValidShirazuMora(unit) ? unit : "";
}

/** 句に含まれる音数（ひらがな拗音＋漢字＋英字は各1） */
export function shirazuMoraCount(line: string): number {
  const chars = [...toAllowedShirazuChars(line)];
  let i = 0;
  let count = 0;
  while (i < chars.length) {
    const a = chars[i] ?? "";
    const b = chars[i + 1] ?? "";
    if (isLatinLetter(a) || isKanji(a)) {
      count += 1;
      i += 1;
      continue;
    }
    if (b && isYoonPair(a, b)) {
      count += 1;
      i += 2;
      continue;
    }
    if (/[ぁぃぅぇぉゃゅょゎ]/.test(a)) {
      i += 1;
      continue;
    }
    if (a === "ー" || /[ぁ-ん]/.test(a)) {
      count += 1;
    }
    i += 1;
  }
  return count;
}

const SINGLE_POOL = [
  ..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんっー",
];

const MORA_POOL = [...SINGLE_POOL, ...YOON_UNITS];

/** CPU用：続きやすい一音（ひらがな／拗音）を返す */
export function pickShirazuChar(builtLine: string, seed = ""): string {
  const soFar = toHiraganaOnly(builtLine);

  if (soFar === "うん") return "ち";
  if (soFar === "うんち") return "ぶ";
  if (soFar === "うんちぶ") return "り";
  if (soFar === "うんちぶり") return "ぶ";
  if (soFar === "うんちぶりぶ") return "り";

  let hash = seed.length * 17 + soFar.length * 31;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 3)) % 9973;
  }

  // だいたい単音、ときどき拗音
  const pool = hash % 7 === 0 ? MORA_POOL : SINGLE_POOL;
  return pool[hash % pool.length] ?? "ん";
}
