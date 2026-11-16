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

/** 普通のひらがな（小書き以外）。促音の直後に付けられる字 */
function isPlainHiragana(ch: string): boolean {
  return (
    /[ぁ-ん]/.test(ch) &&
    !/[ぁぃぅぇぉゃゅょゎっ]/.test(ch)
  );
}

/** っ＋普通ひらがな（って など）＝二音 */
function isSokuonCluster(first: string, second: string): boolean {
  return first === "っ" && isPlainHiragana(second);
}

/**
 * 入力中の下書きを最大一単位まで残す。
 * 一音／拗音／っ＋次の字（って等）／漢字／英字。
 */
export function clampShirazuDraft(raw: string): string {
  const allowed = toAllowedShirazuChars(raw);
  if (!allowed) return "";
  const chars = [...allowed];
  const first = chars[0] ?? "";
  const second = chars[1] ?? "";

  // 英字・漢字は一文字だけ
  if (isLatinLetter(first) || isKanji(first)) return first;

  // 先頭が小書き（っ以外）なら捨てる
  if (/[ぁぃぅぇぉゃゅょゎ]/.test(first)) return "";

  // っ＋て など（入力中はっだけでも残す）
  if (first === "っ") {
    if (second && isPlainHiragana(second)) return first + second;
    return first;
  }

  if (SOLO_MORA.has(first) || !YOON_BASES.has(first)) {
    return first;
  }

  if (second && isYoonPair(first, second)) {
    return first + second;
  }
  return first;
}

/** 提出可能な単位か（一音／拗音／って等／漢字／英字） */
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
    if (isSokuonCluster(chars[0], chars[1])) return true;
    return isYoonPair(chars[0], chars[1]) && moraCountFromKana(unit) === 1;
  }
  return false;
}

/** 提出用に正規化した単位。不正なら空 */
export function normalizeShirazuMora(raw: string): string {
  const unit = clampShirazuDraft(raw);
  return isValidShirazuMora(unit) ? unit : "";
}

/** 提出単位の音数（って＝2、きゃ＝1） */
export function shirazuUnitMoraCount(raw: string): number {
  const unit = normalizeShirazuMora(raw);
  if (!unit) return 0;
  return shirazuMoraCount(unit);
}

/** 正規化済み単位を1音ずつの文字列に分割（てに付くっも分ける） */
export function splitShirazuUnit(raw: string): string[] {
  const unit = normalizeShirazuMora(raw);
  if (!unit) return [];
  const chars = [...unit];
  if (chars.length === 2 && isSokuonCluster(chars[0], chars[1])) {
    return [chars[0], chars[1]];
  }
  return [unit];
}

/** 句を表示用の音単位に分割（きゃ＝1枠、っ／ては各1枠） */
export function splitShirazuLineIntoMoras(line: string): string[] {
  const chars = [...toAllowedShirazuChars(line)];
  const units: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const a = chars[i] ?? "";
    const b = chars[i + 1] ?? "";
    if (isLatinLetter(a) || isKanji(a)) {
      units.push(a);
      i += 1;
      continue;
    }
    if (b && isYoonPair(a, b)) {
      units.push(a + b);
      i += 2;
      continue;
    }
    if (/[ぁぃぅぇぉゃゅょゎ]/.test(a)) {
      i += 1;
      continue;
    }
    if (a === "ー" || /[ぁ-ん]/.test(a)) {
      units.push(a);
    }
    i += 1;
  }
  return units;
}

/** 句に含まれる音数（ひらがな拗音＋漢字＋英字は各1。っ＋ては2） */
export function shirazuMoraCount(line: string): number {
  return splitShirazuLineIntoMoras(line).length;
}

/**
 * 五・七・五の空枠を〇で示し、書かれた音は実字で埋める。
 * 例: 「あいう」＋5 → 「あいう〇〇」
 */
export function formatShirazuLineWithSlots(
  lineText: string,
  lineTarget: number,
): string {
  const filled = splitShirazuLineIntoMoras(lineText);
  const target = Math.max(0, lineTarget);
  const slots: string[] = [];
  for (let i = 0; i < target; i += 1) {
    slots.push(filled[i] ?? "〇");
  }
  // 枠超過分（理論上まれ）も落とさず見せる
  if (filled.length > target) {
    slots.push(...filled.slice(target));
  }
  return slots.join("");
}

/** 短冊全体の音数 */
export function poemMoraCount(poem: {
  lines: ({ text: string } | null)[];
}): number {
  return poem.lines.reduce(
    (sum, line) => sum + shirazuMoraCount(line?.text ?? ""),
    0,
  );
}

/** 残りの音枠に収まる提出か */
export function canSubmitShirazuUnit(
  raw: string,
  remainingMora: number,
): boolean {
  if (!isValidShirazuMora(raw)) return false;
  const need = shirazuUnitMoraCount(raw);
  return need > 0 && need <= remainingMora;
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
