import { LINE_COUNT, PART_LABELS } from "@/lib/constants";
import { shirazuTotalSteps } from "@/lib/shirazu";
import { toKanji } from "@/lib/utils";
import type { Player, VerseMode } from "@/types/game";

/** 行（または一文字ステップ）を人数でラウンドロビン割当 */
export function assignPartIndexes(
  playerCount: number,
  mode: VerseMode,
): number[][] {
  const steps =
    mode === "shirazu" ? shirazuTotalSteps(playerCount) : LINE_COUNT[mode];
  const assigned: number[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < steps; i += 1) {
    assigned[i % playerCount].push(i);
  }
  return assigned;
}

/** 俳句・短歌の担当順を毎回入れ替える用 */
export function shufflePlayers<T>(players: T[]): T[] {
  const next = [...players];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

export function writerForStep(players: Player[], stepIndex: number): Player {
  const writer = players.find((p) => p.partIndexes.includes(stepIndex));
  if (!writer) {
    throw new Error(`No writer for step ${stepIndex}`);
  }
  return writer;
}

export function describeParts(mode: VerseMode, indexes: number[]): string {
  if (mode === "shirazu") {
    void indexes;
    return "短冊を回して一枠ずつ";
  }
  const labels = PART_LABELS[mode];
  return indexes.map((i) => labels[i] ?? `${toKanji(i + 1)}句`).join("・");
}
