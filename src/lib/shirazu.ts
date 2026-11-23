import { moraCountFromKana } from "@/lib/mora";
import { toKanji } from "@/lib/utils";
import type { ShirazuStyle } from "@/types/game";

/** リレーで風流：五・七・五＝十七音を人数分。各ラウンド全員が一音書いて短冊を回す */
export const SHIRAZU_LINE_TARGETS = [5, 7, 5] as const;
export const SHIRAZU_MORA_PER_POEM = 17;
/** @deprecated 互換用エイリアス */
export const SHIRAZU_CHARS_PER_POEM = SHIRAZU_MORA_PER_POEM;

/** 波線。入力の 〜 も同じ印に揃える */
export const SHIRAZU_WAVE = "～";
const WAVE_DASHES = new Set(["～", "〜", "∼"]);

export function isWaveDash(ch: string): boolean {
  return WAVE_DASHES.has(ch);
}

/** 単独で一音になる記号・促音・撥音 */
const SOLO_MORA = new Set(["っ", "ん", "ー", SHIRAZU_WAVE]);

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

/** 前の仮名に付いて一音になる小書き。っは促音なので付けない */
const SMALL_KANA_ATTACH = /^[ぁぃぅぇぉゃゅょゎゕゖ]$/;

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

/** 連衆の座席。座席番号が無ければ並び順で代用。見つからなければ -1 */
export function shirazuSeatOf(
  players: { id: string; seat?: number }[],
  playerId: string,
): number {
  const index = players.findIndex((p) => p.id === playerId);
  if (index < 0) return -1;
  return players[index].seat ?? index;
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
export function shirazuRoundProgressLabel(
  roundIndex: number,
  style: ShirazuStyle = "strict",
): string {
  const { lineIndex, moraInLine, lineTarget } = locateShirazuMora(roundIndex);
  const lineNames = ["上の句", "中の句", "下の句"];
  const unit = style === "free" ? "枠" : "音";
  return `${lineNames[lineIndex]}（${toKanji(moraInLine + 1)}／${toKanji(lineTarget)}${unit}）`;
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

/** 全角英字→半角、カタカナ→ひらがな。漢字は捨てる（しっかり風流） */
function normalizeStrictChar(ch: string): string | null {
  if (ch >= "Ａ" && ch <= "Ｚ") {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  }
  if (ch >= "ａ" && ch <= "ｚ") {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  }
  if (ch >= "ァ" && ch <= "ヶ") {
    return String.fromCharCode(ch.charCodeAt(0) - 0x60);
  }
  if (isKanji(ch)) return null;
  if (isWaveDash(ch)) return SHIRAZU_WAVE;
  if (ch === "ー" || /[ぁ-ん]/.test(ch) || isLatinLetter(ch)) {
    return ch;
  }
  return null;
}

/** 許可文字だけ残す（ひらがな・英字。漢字不可）。カタカナ・全角英字は半角／ひらがなへ */
export function toAllowedShirazuChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const n = normalizeStrictChar(ch);
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

/** ぽょ・きゃ・ふぁのように、仮名＋小書きで一音 */
function isSmallKanaMora(base: string, small: string): boolean {
  if (!SMALL_KANA_ATTACH.test(small)) return false;
  if (SOLO_MORA.has(base) || base === "っ") return false;
  if (SMALL_KANA_ATTACH.test(base)) return false;
  return /[ぁ-ん]/.test(base);
}

/**
 * 入力中の下書きを最大一単位まで残す（しっかり風流）。
 * 一音／仮名＋小書き／っ（単体）／英字／～。漢字不可。
 */
export function clampShirazuDraft(raw: string): string {
  const allowed = toAllowedShirazuChars(raw);
  if (!allowed) return "";
  const chars = [...allowed];
  const first = chars[0] ?? "";
  const second = chars[1] ?? "";

  // 英字は一文字だけ
  if (isLatinLetter(first)) return first;

  // 先頭が小書き（っ以外）なら捨てる
  if (SMALL_KANA_ATTACH.test(first)) return "";

  // っは単体のみ
  if (first === "っ") return first;

  if (second && isSmallKanaMora(first, second)) {
    return first + second;
  }
  return first;
}

/** 提出可能な単位か（一音／仮名＋小書き／っ単体／英字／～） */
export function isValidShirazuMora(raw: string): boolean {
  const unit = clampShirazuDraft(raw);
  if (!unit) return false;
  const chars = [...unit];
  if (chars.length === 1) {
    if (isLatinLetter(chars[0]) || chars[0] === SHIRAZU_WAVE) return true;
    return /[ぁ-んー]/.test(chars[0]) && !SMALL_KANA_ATTACH.test(chars[0]);
  }
  if (chars.length === 2) {
    return isSmallKanaMora(chars[0], chars[1]) && moraCountFromKana(unit) === 1;
  }
  return false;
}

/** 提出用に正規化した単位。不正なら空 */
export function normalizeShirazuMora(raw: string): string {
  const unit = clampShirazuDraft(raw);
  return isValidShirazuMora(unit) ? unit : "";
}

/** 自由律：空でなければそのまま1枠 */
export function normalizeFreeShirazuUnit(raw: string): string {
  return raw.length > 0 ? raw : "";
}

export function isValidFreeShirazuUnit(raw: string): boolean {
  return normalizeFreeShirazuUnit(raw).length > 0;
}

/** 提出単位の音数（しっかりは常に1、きゃ＝1） */
export function shirazuUnitMoraCount(raw: string): number {
  const unit = normalizeShirazuMora(raw);
  return unit ? 1 : 0;
}

/** 正規化済み単位を1音ずつの文字列に分割 */
export function splitShirazuUnit(raw: string): string[] {
  const unit = normalizeShirazuMora(raw);
  return unit ? [unit] : [];
}

/** 句を表示用の音単位に分割（きゃ＝1枠） */
export function splitShirazuLineIntoMoras(line: string): string[] {
  const chars = [...toAllowedShirazuChars(line)];
  const units: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const a = chars[i] ?? "";
    const b = chars[i + 1] ?? "";
    if (isLatinLetter(a)) {
      units.push(a);
      i += 1;
      continue;
    }
    if (b && isSmallKanaMora(a, b)) {
      units.push(a + b);
      i += 2;
      continue;
    }
    if (SMALL_KANA_ATTACH.test(a)) {
      i += 1;
      continue;
    }
    if (a === "ー" || a === SHIRAZU_WAVE || /[ぁ-ん]/.test(a)) {
      units.push(a);
    }
    i += 1;
  }
  return units;
}

/** 行の音枠配列。units があればそれを使い、無ければ text から復元 */
export function lineUnits(
  line: { text: string; units?: string[] } | null | undefined,
): string[] {
  if (!line) return [];
  if (Array.isArray(line.units)) return line.units;
  return splitShirazuLineIntoMoras(line.text ?? "");
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
  if (filled.length > target) {
    slots.push(...filled.slice(target));
  }
  return slots.join("");
}

/** 行の枠配列（空枠は〇）。units 優先 */
export function shirazuLineSlotUnits(
  line: { text: string; units?: string[] } | null | undefined,
  lineTarget: number,
): string[] {
  const filled = lineUnits(line);
  const target = Math.max(0, lineTarget);
  const slots: string[] = [];
  for (let i = 0; i < target; i += 1) {
    slots.push(filled[i] ?? "〇");
  }
  if (filled.length > target) {
    slots.push(...filled.slice(target));
  }
  return slots;
}

/** 短冊全体の音数／枠数 */
export function poemMoraCount(poem: {
  lines: ({ text: string; units?: string[] } | null)[];
}): number {
  return poem.lines.reduce((sum, line) => sum + lineUnits(line).length, 0);
}

const FREE_LINE_NAMES = ["上の句", "中の句", "下の句"] as const;

/** 自由律の読みやすい文字起こし（ポップアップ用） */
export function freePoemTranscript(poem: {
  lines: ({ text: string; units?: string[] } | null)[];
}): string {
  return poem.lines
    .map((line, i) => {
      const name = FREE_LINE_NAMES[i] ?? `${i + 1}句`;
      const units = lineUnits(line).filter((u) => u && u !== "〇");
      const body = units.length > 0 ? units.join("　") : "（空）";
      return `${name}\n${body}`;
    })
    .join("\n\n");
}

/** 残りの音枠に収まる提出か（しっかり） */
export function canSubmitShirazuUnit(
  raw: string,
  remainingMora: number,
): boolean {
  if (!isValidShirazuMora(raw)) return false;
  return remainingMora >= 1;
}

/** 残りの枠に収まる提出か（自由律） */
export function canSubmitFreeShirazuUnit(
  raw: string,
  remainingSlots: number,
): boolean {
  if (!isValidFreeShirazuUnit(raw)) return false;
  return remainingSlots >= 1;
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

  const pool = hash % 7 === 0 ? MORA_POOL : SINGLE_POOL;
  return pool[hash % pool.length] ?? "ん";
}
