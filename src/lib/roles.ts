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

export function writerForStep(players: Player[], stepIndex: number): Player {
  const writer = players.find((p) => p.partIndexes.includes(stepIndex));
  if (!writer) {
    throw new Error(`No writer for step ${stepIndex}`);
  }
  return writer;
}

export function describeParts(mode: VerseMode, indexes: number[]): string {
  if (mode === "shirazu") {
    return `一音担当×${toKanji(indexes.length)}回`;
  }
  const labels = PART_LABELS[mode];
  return indexes.map((i) => labels[i] ?? `${toKanji(i + 1)}句`).join("・");
}
