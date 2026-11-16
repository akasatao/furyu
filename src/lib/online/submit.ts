import {
  clampShirazuDraft,
  locateShirazuMora,
  normalizeShirazuMora,
  SHIRAZU_MORA_PER_POEM,
} from "@/lib/shirazu";
import { EMPTY_FALLBACK } from "@/lib/constants";
import {
  clampText,
  finalizeLine,
  partLimit,
  totalSteps,
} from "@/lib/utils";
import { writerForStep } from "@/lib/roles";
import type {
  LineTurnState,
  Poem,
  Player,
  ShirazuTurnState,
} from "@/types/game";

const SHIRAZU_AUTHOR = {
  authorId: "shirazu",
  authorName: "詠み人知らず",
} as const;

function applyLine(
  poem: Poem,
  stepIndex: number,
  text: string,
  writer: Player,
): Poem {
  const limit = partLimit(poem.mode, stepIndex);
  const line = {
    text: finalizeLine(clampText(text, limit)) || EMPTY_FALLBACK,
    authorId: writer.id,
    authorName: writer.name,
  };
  const lines = [...poem.lines];
  lines[stepIndex] = line;
  return { ...poem, lines };
}

/** 指定短冊の指定ラウンド位置に一音を追記 */
export function applyShirazuCharToPoem(
  poems: Poem[],
  poemIndex: number,
  roundIndex: number,
  raw: string,
): Poem[] {
  const unit =
    normalizeShirazuMora(raw) ||
    normalizeShirazuMora(clampShirazuDraft(raw)) ||
    "ん";
  const { lineIndex } = locateShirazuMora(roundIndex);
  return poems.map((poem, pi) => {
    if (pi !== poemIndex) return poem;
    const lines = [...poem.lines];
    const prev = lines[lineIndex]?.text ?? "";
    lines[lineIndex] = {
      text: prev + unit,
      ...SHIRAZU_AUTHOR,
    };
    return { ...poem, lines };
  });
}

export function applyOnlineSubmit(args: {
  poems: Poem[];
  stepIndex: number;
  draft: string;
  writer: Player;
  playerCount: number;
  roster: Player[];
}): {
  poems: Poem[];
  done: boolean;
  nextStep: number;
  nextWriterId: string;
} {
  const { poems, stepIndex, draft, writer, playerCount, roster } = args;
  const verseMode = poems[0]?.mode ?? "haiku";
  if (verseMode === "shirazu") {
    throw new Error("shirazu は applyShirazuRoundSubmit を使ってください");
  }

  const updated = [applyLine(poems[0], stepIndex, draft, writer)];
  const total = totalSteps(verseMode, playerCount);
  if (stepIndex >= total - 1) {
    return {
      poems: updated,
      done: true,
      nextStep: stepIndex,
      nextWriterId: writer.id,
    };
  }

  const nextStep = stepIndex + 1;
  const nextWriter = writerForStep(roster, nextStep);
  return {
    poems: updated,
    done: false,
    nextStep,
    nextWriterId: nextWriter.id,
  };
}

export function applyShirazuRoundSubmit(args: {
  poems: Poem[];
  turn: ShirazuTurnState;
  poemIndex: number;
  draft: string;
  playerId: string;
  playerCount: number;
}): {
  poems: Poem[];
  done: boolean;
  nextTurn: ShirazuTurnState | null;
} {
  const { poems, turn, poemIndex, draft, playerId, playerCount } = args;

  if (turn.submittedIds.includes(playerId)) {
    return { poems, done: false, nextTurn: turn };
  }

  const updated = applyShirazuCharToPoem(
    poems,
    poemIndex,
    turn.roundIndex,
    draft,
  );
  const submittedIds = [...turn.submittedIds, playerId];

  if (submittedIds.length < playerCount) {
    return {
      poems: updated,
      done: false,
      nextTurn: { ...turn, submittedIds },
    };
  }

  // 全員提出 → 短冊を回す（次ラウンド）または完成
  if (turn.roundIndex >= SHIRAZU_MORA_PER_POEM - 1) {
    return { poems: updated, done: true, nextTurn: null };
  }

  return {
    poems: updated,
    done: false,
    nextTurn: {
      kind: "shirazu",
      roundIndex: turn.roundIndex + 1,
      submittedIds: [],
    },
  };
}

export type { LineTurnState };
