"use client";

import { useEffect, useState } from "react";
import { MODE_LABEL } from "@/lib/constants";
import {
  clampShirazuDraft,
  isValidShirazuMora,
  SHIRAZU_MORA_PER_POEM,
  shirazuRoundProgressLabel,
} from "@/lib/shirazu";
import { toKanji } from "@/lib/utils";
import type { Poem } from "@/types/game";

interface ShirazuWritingPhaseProps {
  poem: Poem;
  roundIndex: number;
  draft: string;
  playerCount: number;
  submittedCount: number;
  hasSubmitted: boolean;
  busy?: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

/** リレー執筆：手元の短冊に一音ずつ書き込む */
export function ShirazuWritingPhase({
  poem,
  roundIndex,
  draft,
  playerCount,
  submittedCount,
  hasSubmitted,
  busy = false,
  onDraftChange,
  onSubmit,
}: ShirazuWritingPhaseProps) {
  const [composing, setComposing] = useState(false);
  const [localDraft, setLocalDraft] = useState(draft);
  const progressLabel = shirazuRoundProgressLabel(roundIndex);
  const isLastRound = roundIndex >= SHIRAZU_MORA_PER_POEM - 1;

  useEffect(() => {
    setComposing(false);
  }, [roundIndex]);

  useEffect(() => {
    if (!composing) setLocalDraft(draft);
  }, [draft, composing]);

  const canSubmit =
    !busy && !hasSubmitted && !composing && isValidShirazuMora(draft);

  const commitDraft = (raw: string) => {
    const next = clampShirazuDraft(raw);
    setLocalDraft(next);
    onDraftChange(next);
  };

  const submitLabel = isLastRound ? "短冊を渡す" : "短冊を回す";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 min-h-0 flex-col gap-3 md:flex-none md:gap-5">
      <header className="shrink-0 space-y-0.5 text-center md:space-y-1">
        <p className="text-[10px] tracking-[0.35em] text-black/55 md:text-xs">
          {MODE_LABEL.shirazu}　{toKanji(roundIndex + 1)}／
          {toKanji(SHIRAZU_MORA_PER_POEM)}
        </p>
        <h2 className="text-xl tracking-widest md:text-3xl">一音を詠む</h2>
        <p className="text-[10px] tracking-[0.15em] text-black/50 md:text-xs">
          {progressLabel}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-4 overflow-y-auto overscroll-contain md:justify-center">
        <article className="tanzaku relative flex w-full max-w-[14rem] flex-col items-center px-3 py-5">
          <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
          <p className="mb-2 text-sm tracking-[0.35em] text-black/45">俳句</p>
          <div className="flex min-h-[220px] items-center justify-center py-3">
            <p
              className="text-[1.35rem] leading-[2] tracking-[0.35em] [writing-mode:vertical-rl]"
              lang="ja"
            >
              {poem.lines.map((line, i) => {
                const isLast = i === poem.lines.length - 1;
                const offset = i === 0 ? "" : isLast ? "mt-10" : "mt-4";
                const text = line?.text ?? "";
                return (
                  <span
                    key={i}
                    className={`${offset} block min-h-[1.5em]`.trim()}
                  >
                    {text || "\u3000"}
                  </span>
                );
              })}
            </p>
          </div>
          <p className="mt-1 max-w-[12rem] border-t-2 border-black pt-2 text-center text-[10px] leading-relaxed tracking-wider text-black/50">
            <span className="block">詠み人知らず</span>
          </p>
        </article>

        {hasSubmitted ? (
          <section className="brush-box w-full px-4 py-6 text-center">
            <p className="animate-pulse text-base tracking-widest text-black/70 md:text-lg">
              他の連衆を待っています
            </p>
            <p className="mt-2 text-sm text-black/45">
              提出 {toKanji(submittedCount)}／{toKanji(playerCount)}
            </p>
          </section>
        ) : (
          <div className="w-full space-y-2 pb-2">
            <label
              htmlFor="shirazu-mora-input"
              className="text-sm tracking-widest text-black/70"
            >
              あなたの一音
            </label>
            <input
              id="shirazu-mora-input"
              type="text"
              inputMode="text"
              lang="ja"
              autoComplete="off"
              value={localDraft}
              placeholder=""
              disabled={busy}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(e) => {
                setComposing(false);
                commitDraft(e.currentTarget.value);
              }}
              onChange={(e) => {
                const value = e.target.value;
                const native = e.nativeEvent as InputEvent;
                if (composing || native.isComposing) {
                  setLocalDraft(value);
                  return;
                }
                commitDraft(value);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter" && canSubmit) onSubmit();
              }}
              className="brush-input w-full px-4 py-3 text-center text-3xl tracking-[0.5em] md:py-3.5"
              autoFocus
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em]"
            >
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
