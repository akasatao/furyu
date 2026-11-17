import {
  clampShirazuDraft,
  locateShirazuMora,
  normalizeShirazuMora,
  poemMoraCount,
  SHIRAZU_MORA_PER_POEM,
  splitShirazuUnit,
} from "@/lib/shirazu";
import { EMPTY_FALLBACK, MODE_LABEL } from "@/lib/constants";
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
  ShirazuRevealState,
  ShirazuTurnState,
  TurnState,
} from "@/types/game";

const SHIRAZU_AUTHOR = {
  authorId: "shirazu",
  authorName: MODE_LABEL.shirazu,
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

/**
 * 手元の短冊へ単位を追記する。
 * って＝2音は、五・七・五の境をまたいでも1音ずつ正しい句へ入れる。
 */
export function applyShirazuCharToPoem(
  poems: Poem[],
  poemIndex: number,
  _roundIndex: number,
  raw: string,
): Poem[] {
  return poems.map((poem, pi) => {
    if (pi !== poemIndex) return poem;

    const filled = poemMoraCount(poem);
    if (filled >= SHIRAZU_MORA_PER_POEM) return poem;

    const unit =
      normalizeShirazuMora(raw) ||
      normalizeShirazuMora(clampShirazuDraft(raw)) ||
      "ん";
    const parts = splitShirazuUnit(unit);
    if (parts.length === 0) return poem;
    if (filled + parts.length > SHIRAZU_MORA_PER_POEM) return poem;

    const lines = [...poem.lines];
    let moraPos = filled;
    for (const part of parts) {
      const { lineIndex } = locateShirazuMora(moraPos);
      const prev = lines[lineIndex]?.text ?? "";
      lines[lineIndex] = {
        text: prev + part,
        ...SHIRAZU_AUTHOR,
      };
      moraPos += 1;
    }
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
  nextTurn: TurnState | null;
} {
  const { poems, turn, poemIndex, draft, playerId, playerCount } = args;

  if (turn.submittedIds.includes(playerId)) {
    return { poems, done: false, nextTurn: turn };
  }

  const hand = poems[poemIndex];
  const filled = hand ? poemMoraCount(hand) : 0;
  const alreadyComplete = filled >= SHIRAZU_MORA_PER_POEM;

  // 完成済み短冊は書かずスキップ提出
  const updated = alreadyComplete
    ? poems
    : applyShirazuCharToPoem(poems, poemIndex, turn.roundIndex, draft);

  const submittedIds = [...turn.submittedIds, playerId];
  const settled = settleShirazuRound(
    updated,
    { ...turn, submittedIds },
    playerCount,
  );
  return { poems: updated, ...settled };
}

/** 提出数が人数に達していれば次のラウンド（全部埋まっていれば披露）へ */
export function settleShirazuRound(
  poems: Poem[],
  turn: ShirazuTurnState,
  playerCount: number,
): { done: boolean; nextTurn: TurnState } {
  if (turn.submittedIds.length < playerCount) {
    return { done: false, nextTurn: turn };
  }

  const allComplete = poems.every(
    (poem) => poemMoraCount(poem) >= SHIRAZU_MORA_PER_POEM,
  );
  if (allComplete) {
    const revealTurn: ShirazuRevealState = {
      kind: "shirazu_reveal",
      poemIndex: -1,
    };
    return { done: true, nextTurn: revealTurn };
  }

  return {
    done: false,
    nextTurn: {
      kind: "shirazu",
      roundIndex: turn.roundIndex + 1,
      submittedIds: [],
    },
  };
}

export type { LineTurnState };
