"use client";

import { useEffect, useState } from "react";
import { MODE_LABEL } from "@/lib/constants";
import {
  clampShirazuDraft,
  isValidShirazuMora,
  locateShirazuStep,
} from "@/lib/shirazu";
import {
  charCount,
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

  // IME変換中はローマ字を残すため、親 draft への同期を止める
  useEffect(() => {
    if (!composing) setLocalDraft(draft);
  }, [draft, composing]);

  const displayDraft = isShirazu ? localDraft : draft;
  const count = isShirazu
    ? isValidShirazuMora(draft)
      ? 1
      : 0
    : charCount(draft);
  const canSubmit = isShirazu
    ? !composing && isValidShirazuMora(draft)
    : Boolean(draft.trim());
  const total = totalSteps(mode, playerCount);
  const isMyTurn = writer.id === myId;
  const shirazuLoc = isShirazu ? locateShirazuStep(stepIndex) : null;

  const commitShirazu = (raw: string) => {
    const next = clampShirazuDraft(raw);
    setLocalDraft(next);
    onDraftChange(next);
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <header className="space-y-1 text-center">
        <p className="text-xs tracking-[0.35em] text-black/55">
          {MODE_LABEL[mode]}　{toKanji(stepIndex + 1)}／{toKanji(total)}
        </p>
        <h2 className="text-2xl tracking-widest sm:text-3xl">
          {isShirazu ? "一音を詠む" : label}
        </h2>
        {progressLabel && (
          <p className="text-xs tracking-[0.15em] text-black/50">{progressLabel}</p>
        )}
        <p className="text-xs tracking-[0.2em] text-black/45">
          担当：{writer.name}
        </p>
      </header>

      {promptLines.length > 0 && (
        <section className="brush-box px-4 py-3">
          <p className="mb-2 text-xs tracking-widest text-black/50">
            {isShirazu ? "ここまでの音" : "ここまでの句"}
          </p>
          <ul className="space-y-1.5">
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
        <section className="brush-box px-4 py-10 text-center">
          <p className="animate-pulse text-lg tracking-widest text-black/70">
            {writer.name} が合わせを考え中…
          </p>
          <p className="mt-2 text-sm text-black/45">
            {isShirazu ? "一音を選んでいます" : `${label}を練っています`}
          </p>
        </section>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <label htmlFor="line-input" className="text-sm tracking-widest text-black/70">
              {isShirazu ? "あなたの一音" : `あなたの${label}`}
            </label>
            <span className="text-sm tabular-nums tracking-wider text-black/45">
              {isShirazu
                ? `${toKanji(count)}／${toKanji(limit)}音`
                : `${toKanji(count)}／${toKanji(limit)}`}
            </span>
          </div>
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
                // PCのIMEは変換中にローマ字が入る。確定前に削ると「ひゅ」が打てない
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
            className={`brush-input w-full px-4 py-3.5 ${
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
            {isShirazu ? "次の人へ回す" : "詠み上げる"}
          </button>
        </div>
      )}
    </div>
  );
}
