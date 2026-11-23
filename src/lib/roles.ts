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

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const head = items[i];
    const rest = items.filter((_, j) => j !== i);
    for (const tail of permutations(rest)) {
      out.push([head, ...tail]);
    }
  }
  return out;
}

/**
 * 俳句・短歌の開宴順。
 * 直前に持っていた句は、次の宴では別の人に回す。
 * 一人が二句持つときも、その二句は隣り合わない。
 */
export function orderPlayersForVerse<T extends { partIndexes: number[] }>(
  players: T[],
  mode: VerseMode,
): T[] {
  const n = players.length;
  if (n <= 1) return [...players];
  const seats = assignPartIndexes(n, mode);
  let bestScore = Number.POSITIVE_INFINITY;
  const best: T[][] = [];
  for (const order of permutations(players)) {
    let score = 0;
    for (let seat = 0; seat < n; seat += 1) {
      const prev = new Set(order[seat]?.partIndexes ?? []);
      for (const line of seats[seat] ?? []) {
        if (prev.has(line)) score += 1;
      }
    }
    if (score < bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(order);
    } else if (score === bestScore) {
      best.push(order);
    }
  }
  const picked = best[Math.floor(Math.random() * best.length)];
  return picked ?? [...players];
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
