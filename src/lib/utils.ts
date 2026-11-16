import {
  DEFAULT_NICKNAME,
  EMPTY_FALLBACK,
  LINE_COUNT,
  MODE_LABEL,
  PART_LABELS,
  PART_LIMITS,
  PLAYER_COLORS,
  PLAYER_COUNT_RANGE,
} from "@/lib/constants";
import { shirazuTotalSteps } from "@/lib/shirazu";
import type { Poem, PoemLine, VerseMode } from "@/types/game";

const KANJI_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

/** 表示用の漢数字（〇〜九十九まで） */
export function toKanji(n: number): string {
  const value = Math.floor(Math.abs(n));
  if (value <= 9) return KANJI_DIGITS[value];
  if (value === 10) return "十";
  if (value < 20) return `十${KANJI_DIGITS[value % 10]}`;
  if (value < 100) {
    const ones = value % 10;
    const tens = Math.floor(value / 10);
    return `${KANJI_DIGITS[tens]}十${ones === 0 ? "" : KANJI_DIGITS[ones]}`;
  }
  return String(value);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultNickname(): string {
  return DEFAULT_NICKNAME;
}

export function randomRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 全角英数字→半角、大文字化、英数字以外除去（ルームコード照合用） */
export function normalizeRoomCode(raw: string): string {
  return raw
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

export function clampText(text: string, max: number): string {
  return [...text].slice(0, max).join("");
}

export function charCount(text: string): number {
  return [...text].length;
}

export function finalizeLine(text: string): string {
  const trimmed = text.trim();
  return trimmed.length === 0 ? EMPTY_FALLBACK : trimmed;
}

export function clampPlayerCount(mode: VerseMode, count: number): number {
  const { min, max } = PLAYER_COUNT_RANGE[mode];
  return Math.min(max, Math.max(min, count));
}

export function createBlankPoem(mode: VerseMode, id: string): Poem {
  return {
    id,
    mode,
    lines: Array.from({ length: LINE_COUNT[mode] }, () => null),
  };
}

/** リレーで風流は人数分の空白俳句、それ以外は一首 */
export function createBlankPoems(
  mode: VerseMode,
  playerCount: number,
  idPrefix: string,
): Poem[] {
  if (mode === "shirazu") {
    return Array.from({ length: playerCount }, (_, i) =>
      createBlankPoem("shirazu", `${idPrefix}_${i}`),
    );
  }
  return [createBlankPoem(mode, idPrefix)];
}

/** リレー短冊に初筆者（座席順）を紐づける */
export function assignShirazuOwners(
  poems: Poem[],
  roster: { id: string; name: string }[],
): Poem[] {
  return poems.map((poem, i) => {
    const owner = roster[i];
    if (!owner) return poem;
    return {
      ...poem,
      ownerId: owner.id,
      ownerName: owner.name,
    };
  });
}

export function totalSteps(mode: VerseMode, playerCount: number): number {
  return mode === "shirazu"
    ? shirazuTotalSteps(playerCount)
    : LINE_COUNT[mode];
}

export function getPromptLines(poem: Poem, stepIndex: number): PoemLine[] {
  return poem.lines
    .slice(0, stepIndex)
    .filter((l): l is PoemLine => l != null);
}

export function poemFullText(poem: Poem): string {
  return poem.lines.map((l) => l?.text ?? "？").join("\n");
}

export function poemShareText(poem: Poem): string {
  if (poem.mode === "shirazu") {
    const credit = poem.ownerName
      ? `${poem.ownerName}の句`
      : MODE_LABEL.shirazu;
    return `${MODE_LABEL.shirazu}\n${poemFullText(poem)}\n— ${credit}\n#風流オンライン`;
  }
  const labels = PART_LABELS[poem.mode];
  const credits = poem.lines
    .map((l, i) => (l ? `${labels[i]}：${l.authorName}` : null))
    .filter(Boolean)
    .join(" / ");
  return `${MODE_LABEL[poem.mode]}\n${poemFullText(poem)}\n— ${credits}\n#風流オンライン`;
}

export function poemsShareText(poems: Poem[]): string {
  if (poems.length === 1) return poemShareText(poems[0]);
  const body = poems
    .map((p, i) => {
      const credit = p.ownerName ? `（${p.ownerName}の句）` : "";
      return `【第${toKanji(i + 1)}首】${credit}\n${poemFullText(p)}`;
    })
    .join("\n\n");
  return `${MODE_LABEL.shirazu}\n${body}\n— ${MODE_LABEL.shirazu}\n#風流オンライン`;
}

export function partLabel(mode: VerseMode, stepIndex: number): string {
  if (mode === "shirazu") return "一音";
  return PART_LABELS[mode][stepIndex] ?? `${toKanji(stepIndex + 1)}句`;
}

export function partLimit(mode: VerseMode, stepIndex: number): number {
  if (mode === "shirazu") return 1;
  return PART_LIMITS[mode][stepIndex] ?? 10;
}
