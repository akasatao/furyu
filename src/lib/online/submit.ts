import {
  clampShirazuDraft,
  locateShirazuStep,
  normalizeShirazuMora,
} from "@/lib/shirazu";
import { EMPTY_FALLBACK } from "@/lib/constants";
import {
  clampText,
  finalizeLine,
  partLimit,
  totalSteps,
} from "@/lib/utils";
import { writerForStep } from "@/lib/roles";
import type { Poem, Player } from "@/types/game";

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

function applyShirazuChar(
  poems: Poem[],
  stepIndex: number,
  raw: string,
): Poem[] {
  const unit = normalizeShirazuMora(raw) || normalizeShirazuMora(clampShirazuDraft(raw)) || "ん";
  const { poemIndex, lineIndex } = locateShirazuStep(stepIndex);
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
}): { poems: Poem[]; done: boolean; nextStep: number; nextWriterId: string } {
  const { poems, stepIndex, draft, writer, playerCount, roster } = args;
  const verseMode = poems[0]?.mode ?? "haiku";
  const updated =
    verseMode === "shirazu"
      ? applyShirazuChar(poems, stepIndex, draft)
      : [applyLine(poems[0], stepIndex, draft, writer)];

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
