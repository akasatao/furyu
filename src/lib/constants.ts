import type { VerseMode } from "@/types/game";

export const MODE_LABEL: Record<VerseMode, string> = {
  haiku: "俳句",
  tanka: "短歌",
  shirazu: "リレーで風流",
};

export const MODE_PATTERN: Record<VerseMode, string> = {
  haiku: "五・七・五",
  tanka: "五・七・五・七・七",
  shirazu: "一音／拗音／って などで短冊を回す・人数分の俳句",
};

export const LINE_COUNT: Record<VerseMode, number> = {
  haiku: 3,
  tanka: 5,
  /** 一首あたりの行数（人数分の首を作る） */
  shirazu: 3,
};

/** 俳句・短歌はソロ可。リレーで風流は複数人専用 */
export const PLAYER_COUNT_RANGE: Record<
  VerseMode,
  { min: number; max: number }
> = {
  haiku: { min: 1, max: 3 },
  tanka: { min: 1, max: 5 },
  shirazu: { min: 2, max: 6 },
};

/** オンライン開宴に必要な最小人数 */
export const ONLINE_MIN_PLAYERS = 2;

export function modeAllowsSolo(mode: VerseMode): boolean {
  return PLAYER_COUNT_RANGE[mode].min === 1;
}

export const PART_LABELS: Record<VerseMode, string[]> = {
  haiku: ["上の句", "中の句", "下の句"],
  tanka: ["初句", "二句", "三句", "四句", "結句"],
  shirazu: ["上の句", "中の句", "下の句"],
};

/** 緩めの文字上限（リレーで風流は常に一文字） */
export const PART_LIMITS: Record<VerseMode, number[]> = {
  haiku: [10, 14, 10],
  tanka: [10, 12, 10, 12, 12],
  shirazu: [1, 1, 1],
};

/** 五・七・五（短歌は続く七・七）の目安 */
export const PART_TARGETS: Record<VerseMode, number[]> = {
  haiku: [5, 7, 5],
  tanka: [5, 7, 5, 7, 7],
  shirazu: [5, 7, 5],
};

export const EMPTY_FALLBACK = "（無言）";

export const DEFAULT_NICKNAME = "名無しの俳人";

export const PLAYER_COLORS = [
  "#111111",
  "#333333",
  "#555555",
  "#222222",
  "#444444",
  "#1a1a1a",
];
