/**
 * 退避中の CPU 対戦。
 * ホーム・ロビー・GameApp からは未接続。画面には出さない。
 *
 * 戻すとき:
 * 1. createCpuRoster で席を埋める（いまの createHumanRoster の代わり）
 * 2. 自分の番以外で scheduleCpuTurn を呼ぶ
 * 3. HomeScreen に onBotMatch を戻し、ロビーの isBot 表示を戻す
 *
 * 句の中身は src/lib/bot.ts と src/lib/bot-phrases.ts。
 */
import { BOT_NAMES, botThinkDelayMs, pickBotLine } from "@/lib/bot";
import { assignPartIndexes } from "@/lib/roles";
import { locateShirazuStep, pickShirazuChar } from "@/lib/shirazu";
import {
  clampPlayerCount,
  defaultNickname,
  playerColor,
} from "@/lib/utils";
import type { Player, Poem, TurnState, VerseMode } from "@/types/game";

export const CPU_MATCH_ENABLED = false;

function builtLine(poems: Poem[], stepIndex: number): string {
  const verseMode = poems[0]?.mode;
  if (verseMode === "shirazu") {
    const { poemIndex, lineIndex } = locateShirazuStep(stepIndex);
    return poems[poemIndex]?.lines[lineIndex]?.text ?? "";
  }
  return poems[0].lines
    .slice(0, stepIndex)
    .map((line) => line?.text ?? "")
    .join("");
}

/** 足りない席を CPU で埋めた名簿。human は partIndexes[0]。 */
export function createCpuRoster(options: {
  humanId: string;
  humanName: string;
  mode: VerseMode;
  playerCount: number;
}): Player[] {
  const count = clampPlayerCount(options.mode, options.playerCount);
  const parts = assignPartIndexes(count, options.mode);
  const human: Player = {
    id: options.humanId,
    name: options.humanName.trim() || defaultNickname(),
    isBot: false,
    isHost: true,
    color: playerColor(0),
    partIndexes: parts[0] ?? [],
  };

  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const bots: Player[] = [];
  for (let i = 1; i < count; i += 1) {
    bots.push({
      id: `bot_${i - 1}`,
      name: names[i - 1] ?? `相方・${["一", "二", "三", "四", "五"][i - 1] ?? "六"}`,
      isBot: true,
      isHost: false,
      color: playerColor(i),
      partIndexes: parts[i] ?? [],
    });
  }
  return [human, ...bots];
}

type SetTurn = (
  updater: (prev: TurnState | null) => TurnState | null,
) => void;

/**
 * CPU の番を考える。戻り値のタイマー ID は離脱時に clearTimeout する。
 */
export function scheduleCpuTurn(options: {
  stepIndex: number;
  poems: Poem[];
  writer: Player;
  setTurn: SetTurn;
}): number[] {
  const { stepIndex, poems, writer, setTurn } = options;
  const verseMode = poems[0]?.mode ?? "haiku";
  const context = builtLine(poems, stepIndex);
  const think =
    verseMode === "shirazu"
      ? 700 + Math.floor(Math.random() * 900)
      : botThinkDelayMs(context.length);

  const timers: number[] = [];
  timers.push(
    window.setTimeout(() => {
      setTurn((prev) =>
        prev && prev.stepIndex === stepIndex
          ? { ...prev, status: "typing" }
          : prev,
      );
    }, Math.min(500, think / 3)),
  );

  timers.push(
    window.setTimeout(() => {
      const line =
        verseMode === "shirazu"
          ? pickShirazuChar(context, `${writer.id}-${stepIndex}-${context}`)
          : pickBotLine({
              mode: verseMode,
              stepIndex,
              poem: poems[0],
              seed: `${writer.id}-${stepIndex}-${context}`,
            });
      setTurn((prev) => {
        if (!prev || prev.stepIndex !== stepIndex) return prev;
        return { ...prev, draft: line, status: "submitted" };
      });
    }, think),
  );

  return timers;
}
