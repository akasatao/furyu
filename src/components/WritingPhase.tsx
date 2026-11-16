"use client";

import { useEffect, useState } from "react";
import { MODE_LABEL } from "@/lib/constants";
import {
  clampShirazuDraft,
  isValidShirazuMora,
  locateShirazuStep,
} from "@/lib/shirazu";
import {
  clampText,
  partLabel,
  partLimit,
  toKanji,
  totalSteps,
} from "@/lib/utils";
import type { Player, PoemLine, VerseMode } from "@/types/game";

interface WritingPhaseProps {
  mode: VerseMode;
  stepIndex: number;
  draft: string;
  promptLines: PoemLine[];
  progressLabel: string | null;
  playerCount: number;
  writer: Player;
  myId: string;
  waitingForPartner: boolean;
  isSolo?: boolean;
  busy?: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

export function WritingPhase({
  mode,
  stepIndex,
  draft,
  promptLines,
  progressLabel,
  playerCount,
  writer,
  myId,
  waitingForPartner,
  isSolo = false,
  busy = false,
  onDraftChange,
  onSubmit,
}: WritingPhaseProps) {
  const isShirazu = mode === "shirazu";
  const label = partLabel(mode, stepIndex);
  const limit = partLimit(mode, stepIndex);
  const [composing, setComposing] = useState(false);
  const [localDraft, setLocalDraft] = useState(draft);

  useEffect(() => {
    setComposing(false);
  }, [stepIndex]);

  useEffect(() => {
    if (!composing) setLocalDraft(draft);
  }, [draft, composing]);

  const displayDraft = isShirazu ? localDraft : draft;
  const canSubmit =
    !busy &&
    (isShirazu
      ? !composing && isValidShirazuMora(draft)
      : Boolean(draft.trim()));
  const total = totalSteps(mode, playerCount);
  const isMyTurn = writer.id === myId;
  const shirazuLoc = isShirazu ? locateShirazuStep(stepIndex) : null;
  const isLastStep = stepIndex >= total - 1;

  const commitShirazu = (raw: string) => {
    const next = clampShirazuDraft(raw);
    setLocalDraft(next);
    onDraftChange(next);
  };

  const submitLabel = isSolo
    ? isLastStep
      ? "完成させる"
      : isShirazu
        ? "次の音へ"
        : "次の句へ"
    : isShirazu
      ? "次の人へ回す"
      : "詠み上げる";

  if (isSolo) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 min-h-0 flex-col gap-4 md:flex-none md:gap-6">
        <header className="shrink-0 space-y-2 text-center">
          <p className="text-xs tracking-[0.4em] text-black/45">
            ひとりで詠む　{MODE_LABEL[mode]}
          </p>
          <h2 className="text-3xl tracking-[0.2em] md:text-4xl">
            {isShirazu ? "一音を詠む" : label}
          </h2>
          <p className="text-sm tracking-[0.25em] text-black/50">
            {toKanji(stepIndex + 1)}／{toKanji(total)}
            {progressLabel ? `　${progressLabel}` : ""}
          </p>
        </header>

        {promptLines.length > 0 && (
          <section className="min-h-0 overflow-y-auto px-1 py-1 text-center md:overflow-visible">
            <ul className="space-y-2">
              {promptLines.map((line, i) => {
                const displayLabel = isShirazu
                  ? (["上の句", "中の句", "下の句"][i] ??
                    `${toKanji(i + 1)}句`)
                  : partLabel(mode, i);
                const isCurrent =
                  isShirazu &&
                  shirazuLoc != null &&
                  i === shirazuLoc.lineIndex;
                return (
                  <li key={`${line.authorId}-${i}-${line.text}`}>
                    <p className="text-[10px] tracking-widest text-black/35">
                      {displayLabel}
                    </p>
                    <p className="text-xl tracking-widest md:text-2xl">
                      {line.text}
                      {isCurrent ? "…" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-auto space-y-3 md:mt-0">
          <input
            id="line-input"
            type="text"
            inputMode="text"
            lang="ja"
            autoComplete="off"
            value={displayDraft}
            placeholder={isShirazu ? "一音" : `${label}を詠む`}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(e) => {
              setComposing(false);
              if (isShirazu) {
                commitShirazu(e.currentTarget.value);
              }
            }}
            onChange={(e) => {
              const value = e.target.value;
              if (isShirazu) {
                const native = e.nativeEvent as InputEvent;
                if (composing || native.isComposing) {
                  setLocalDraft(value);
                  return;
                }
                commitShirazu(value);
                return;
              }
              onDraftChange(clampText(value, limit));
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter" && canSubmit) onSubmit();
            }}
            className={`brush-input w-full px-4 py-4 ${
              isShirazu
                ? "text-center text-4xl tracking-[0.5em]"
                : "text-center text-2xl tracking-widest"
            }`}
            autoFocus
          />
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="brush-btn w-full px-4 py-4 text-lg tracking-[0.3em]"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 min-h-0 flex-col gap-3 md:flex-none md:gap-5">
      <header className="shrink-0 space-y-0.5 text-center md:space-y-1">
        <p className="text-[10px] tracking-[0.35em] text-black/55 md:text-xs">
          {MODE_LABEL[mode]}　{toKanji(stepIndex + 1)}／{toKanji(total)}
        </p>
        <h2 className="text-xl tracking-widest md:text-3xl">
          {isShirazu ? "一音を詠む" : label}
        </h2>
        {progressLabel && (
          <p className="text-[10px] tracking-[0.15em] text-black/50 md:text-xs">
            {progressLabel}
          </p>
        )}
        <p className="text-[10px] tracking-[0.2em] text-black/45 md:text-xs">
          担当：{writer.name}
        </p>
      </header>

      {promptLines.length > 0 && (
        <section className="brush-box min-h-0 overflow-y-auto px-4 py-2.5 md:overflow-visible md:py-3">
          <p className="mb-1.5 text-xs tracking-widest text-black/50 md:mb-2">
            {isShirazu ? "ここまでの音" : "ここまでの句"}
          </p>
          <ul className="space-y-1 md:space-y-1.5">
            {promptLines.map((line, i) => {
              const displayLabel = isShirazu
                ? (["上の句", "中の句", "下の句"][i] ?? `${toKanji(i + 1)}句`)
                : partLabel(mode, i);
              const isCurrent =
                isShirazu &&
                shirazuLoc != null &&
                i === shirazuLoc.lineIndex;
              return (
                <li
                  key={`${line.authorId}-${i}-${line.text}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="shrink-0 text-[10px] tracking-widest text-black/40">
                    {displayLabel}
                  </span>
                  <span>
                    {line.text}
                    {isCurrent ? "…" : ""}
                  </span>
                  {!isShirazu && (
                    <span className="text-[10px] text-black/40">
                      — {line.authorName}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {waitingForPartner || !isMyTurn ? (
        <section className="brush-box mt-auto px-4 py-6 text-center md:mt-0 md:py-10">
          <p className="animate-pulse text-base tracking-widest text-black/70 md:text-lg">
            {writer.name} が合わせを考え中…
          </p>
          <p className="mt-2 text-sm text-black/45">
            {isShirazu ? "一音を選んでいます" : `${label}を練っています`}
          </p>
        </section>
      ) : (
        <div className="mt-auto space-y-2 md:mt-0">
          <label
            htmlFor="line-input"
            className="text-sm tracking-widest text-black/70"
          >
            {isShirazu ? "あなたの一音" : `あなたの${label}`}
          </label>
          <input
            id="line-input"
            type="text"
            inputMode="text"
            lang="ja"
            autoComplete="off"
            value={displayDraft}
            placeholder={isShirazu ? "" : `${label}をここに…`}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(e) => {
              setComposing(false);
              if (isShirazu) {
                commitShirazu(e.currentTarget.value);
              }
            }}
            onChange={(e) => {
              const value = e.target.value;
              if (isShirazu) {
                const native = e.nativeEvent as InputEvent;
                if (composing || native.isComposing) {
                  setLocalDraft(value);
                  return;
                }
                commitShirazu(value);
                return;
              }
              onDraftChange(clampText(value, limit));
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter" && canSubmit) onSubmit();
            }}
            className={`brush-input w-full px-4 py-3 md:py-3.5 ${
              isShirazu ? "text-center text-3xl tracking-[0.5em]" : "text-lg"
            }`}
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
  );
}
