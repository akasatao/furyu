import { lineUnits } from "@/lib/shirazu";
import type { Poem } from "@/types/game";

/** 送信でたまき等を完成させ、句を書かずに破門する */
export class NoMoreTmcBanish extends Error {
  constructor() {
    super("破門");
    this.name = "NoMoreTmcBanish";
  }
}

export function isNoMoreTmcBanish(error: unknown): boolean {
  return error instanceof NoMoreTmcBanish;
}

type Mora = "ta" | "ma" | "ki" | "chi" | "other";

const SMALL_KANA = new Set(["ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ"]);

/**
 * ひらがな・カタカナ・玉／木を音へ揃える。
 * き／ちの直後が拗音の小書きなら、その二文字は ki / chi にしない。
 */
function moraTokens(text: string): { kind: Mora; end: number }[] {
  const tokens: { kind: Mora; end: number }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (
      (ch === "き" || ch === "キ" || ch === "ち" || ch === "チ") &&
      SMALL_KANA.has(next)
    ) {
      tokens.push({ kind: "other", end: i + 2 });
      i += 1;
      continue;
    }
    if (ch === "た" || ch === "タ") {
      tokens.push({ kind: "ta", end: i + 1 });
      continue;
    }
    if (ch === "ま" || ch === "マ") {
      tokens.push({ kind: "ma", end: i + 1 });
      continue;
    }
    if (ch === "き" || ch === "キ" || ch === "木") {
      tokens.push({ kind: "ki", end: i + 1 });
      continue;
    }
    if (ch === "ち" || ch === "チ") {
      tokens.push({ kind: "chi", end: i + 1 });
      continue;
    }
    if (ch === "玉") {
      const end = i + 1;
      tokens.push({ kind: "ta", end }, { kind: "ma", end });
      continue;
    }
    tokens.push({ kind: "other", end: i + 1 });
  }
  return tokens;
}

/**
 * `before` の続きとして `added` を送ると、たまき／たまち（表記ゆれ含む）が完成するか。
 * すでに完成していた並びだけでは破門しない。
 */
export function completesForbiddenName(before: string, added: string): boolean {
  if (!added) return false;
  const boundary = before.length;
  const tokens = moraTokens(before + added);
  for (let i = 0; i + 2 < tokens.length; i += 1) {
    const first = tokens[i];
    const second = tokens[i + 1];
    const third = tokens[i + 2];
    if (!first || !second || !third) continue;
    if (first.kind !== "ta" || second.kind !== "ma") continue;
    if (third.kind !== "ki" && third.kind !== "chi") continue;
    if (third.end > boundary) return true;
  }
  return false;
}

/** リレー短冊に既に乗っている音を、句をまたいでつなぐ */
export function shirazuBeforeText(
  poem: { lines: Poem["lines"] } | null | undefined,
): string {
  if (!poem) return "";
  return poem.lines.map((line) => lineUnits(line).join("")).join("");
}

/** 俳句・短歌で、今回の句より前に書いてある文字 */
export function verseBeforeText(
  poem: { lines: Poem["lines"] } | null | undefined,
  stepIndex: number,
): string {
  if (!poem) return "";
  return poem.lines
    .slice(0, stepIndex)
    .map((line) => line?.text ?? "")
    .join("");
}
