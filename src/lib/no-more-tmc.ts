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

const YOON = new Set(["ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ"]);

/** 音の区切り。音節の中の文字はくっつけたまま見る */
function isGap(ch: string): boolean {
  return (
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === "\u3000" ||
    ch === "-" ||
    ch === "－" ||
    ch === "_" ||
    ch === "＿" ||
    ch === "・" ||
    ch === "･"
  );
}

function isDakuten(ch: string): boolean {
  if (!ch) return false;
  // 「゛」の NFKC は空白＋結合濁点になる
  for (const part of ch.normalize("NFKC")) {
    if (
      part === "\u3099" ||
      part === "\u309A" ||
      part === "゛" ||
      part === "゜"
    ) {
      return true;
    }
  }
  return false;
}

/** 半角カナは全角へ。それ以外はそのまま */
function kanaAt(text: string, index: number): string {
  const ch = text[index] ?? "";
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0xff61 && code <= 0xff9f) return ch.normalize("NFKC");
  return ch;
}

/** 英字だけ小文字の a-z にする。全角英字も含む。かなは空 */
function latinAt(text: string, index: number): string {
  const code = text.codePointAt(index) ?? 0;
  if (code >= 0xff21 && code <= 0xff3a) {
    return String.fromCharCode(code - 0xff21 + 0x61);
  }
  if (code >= 0xff41 && code <= 0xff5a) {
    return String.fromCharCode(code - 0xff41 + 0x61);
  }
  if (code >= 0x41 && code <= 0x5a) return String.fromCharCode(code + 0x20);
  if (code >= 0x61 && code <= 0x7a) return String.fromCharCode(code);
  return "";
}

const ROMAJI: readonly [string, Mora][] = [
  ["chi", "chi"],
  ["ta", "ta"],
  ["ma", "ma"],
  ["ki", "ki"],
  ["ti", "chi"],
];

function matchRomaji(
  text: string,
  index: number,
): { kind: Mora; end: number } | null {
  for (const [pattern, kind] of ROMAJI) {
    let ok = true;
    for (let k = 0; k < pattern.length; k += 1) {
      if (latinAt(text, index + k) !== pattern[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return { kind, end: index + pattern.length };
  }
  return null;
}

/**
 * かな・半角カナ・ローマ字・玉／木を ta / ma / ki / chi に揃える。
 * chi は「ち」のほか、chi・ti・てぃ。
 * き／ちの拗音、濁点付きは別の音にする。
 */
function moraTokens(text: string): { kind: Mora; end: number }[] {
  const tokens: { kind: Mora; end: number }[] = [];
  let i = 0;
  while (i < text.length) {
    if (isGap(text[i] ?? "")) {
      i += 1;
      continue;
    }
    if ((text[i] ?? "") === "玉") {
      const end = i + 1;
      tokens.push({ kind: "ta", end }, { kind: "ma", end });
      i = end;
      continue;
    }

    const ch = kanaAt(text, i);
    const next = kanaAt(text, i + 1);
    let mora: { kind: Mora; end: number } | null = null;
    if (
      (ch === "き" || ch === "キ" || ch === "ち" || ch === "チ") &&
      YOON.has(next)
    ) {
      mora = { kind: "other", end: i + 2 };
    } else if ((ch === "て" || ch === "テ") && (next === "ぃ" || next === "ィ")) {
      mora = { kind: "chi", end: i + 2 };
    } else if (
      (ch === "た" ||
        ch === "タ" ||
        ch === "ま" ||
        ch === "マ" ||
        ch === "き" ||
        ch === "キ" ||
        ch === "ち" ||
        ch === "チ" ||
        ch === "て" ||
        ch === "テ") &&
      isDakuten(text[i + 1] ?? "")
    ) {
      mora = { kind: "other", end: i + 2 };
    } else {
      mora = matchRomaji(text, i);
    }

    if (!mora) {
      if (ch === "た" || ch === "タ") mora = { kind: "ta", end: i + 1 };
      else if (ch === "ま" || ch === "マ") mora = { kind: "ma", end: i + 1 };
      else if (ch === "き" || ch === "キ" || ch === "木") {
        mora = { kind: "ki", end: i + 1 };
      } else if (ch === "ち" || ch === "チ") mora = { kind: "chi", end: i + 1 };
      else mora = { kind: "other", end: i + 1 };
    }

    if (mora.end <= i) mora = { kind: "other", end: i + 1 };
    tokens.push(mora);
    i = mora.end;
  }
  return tokens;
}

/**
 * `before` の続きとして `added` を送ると、たまき／たまちが完成するか。
 * かな、半角カナ、玉／木、Tamachi・たまchi・たまti などの混植を同じ三音と見る。
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
