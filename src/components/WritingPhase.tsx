"use client";

import { useEffect, useState } from "react";
import { FitText } from "@/components/FitText";
import { hiddenPartMark, roomModeLabel } from "@/lib/constants";
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
  theme?: string;
  /** 俳句・短歌の雲隠れ。他人の句は？で出す */
  kumoGakure?: boolean;
  waitingForPartner: boolean;
  isSolo?: boolean;
  busy?: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
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
  theme = "",
  kumoGakure = false,
  waitingForPartner,
  isSolo = false,
  busy = false,
  onDraftChange,
  onSubmit,
  onBack,
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
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 md:max-w-2xl md:gap-6">
        {onBack && (
          <div className="flex shrink-0 items-center justify-between gap-2 px-1">
            <button
              type="button"
              disabled={busy}
              onClick={onBack}
              className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
            >
              ← 戻る
            </button>
            <p className="text-xs tracking-[0.4em] text-black/45">
              ひとりで詠む
            </p>
            <span className="w-12" aria-hidden />
          </div>
        )}

        <header className="shrink-0 space-y-1.5 text-center">
          {!onBack && (
            <p className="text-xs tracking-[0.4em] text-black/45">
              ひとりで詠む　{roomModeLabel(mode, "strict", kumoGakure)}
            </p>
          )}
          {onBack && (
            <p className="text-xs tracking-[0.35em] text-black/45">
              {roomModeLabel(mode, "strict", kumoGakure)}
            </p>
          )}
          <h2 className="text-2xl tracking-[0.2em] md:text-[clamp(1.5rem,5dvh,3rem)]">
            {isShirazu ? "一音を詠む" : label}
          </h2>
          <p className="text-sm tracking-[0.25em] text-black/50">
            {toKanji(stepIndex + 1)}／{toKanji(total)}
            {progressLabel ? `　${progressLabel}` : ""}
          </p>
          {theme.trim() ? (
            <p className="text-sm tracking-[0.2em] text-black/55">
              お題：{theme.trim()}
            </p>
          ) : null}
        </header>

        {/* 上寄りにまとめ、キーボードで高さが減っても内側だけスクロール */}
        <div className="flex min-h-0 flex-1 flex-col justify-start gap-4 overflow-y-auto overscroll-contain pt-2 md:justify-center md:gap-[clamp(0.75rem,2.5dvh,1rem)] md:pt-0">
          {promptLines.length > 0 && (
            <section className="shrink-0 px-1 py-1 text-center">
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
                  const hidden = kumoGakure && line.authorId !== myId;
                  const shown = hidden ? hiddenPartMark(mode, i) : line.text;
                  return (
                    <li key={`${line.authorId}-${i}-${shown}`}>
                      <p className="text-[10px] tracking-widest text-black/35">
                        {displayLabel}
                      </p>
                      <p className="text-xl tracking-widest md:text-[clamp(1.25rem,3.5dvh,1.875rem)]">
                        {shown}
                        {isCurrent ? "…" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="shrink-0 space-y-3 pb-2">
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
              className={`brush-input w-full px-4 py-4 md:py-[clamp(0.75rem,2.5dvh,1.25rem)] ${
                isShirazu
                  ? "text-center text-4xl tracking-[0.5em] md:text-[clamp(2rem,5dvh,3rem)]"
                  : "text-center text-2xl tracking-widest md:text-[clamp(1.5rem,4dvh,1.875rem)]"
              }`}
              autoFocus
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="brush-btn w-full px-4 py-4 text-lg tracking-[0.3em] md:py-[clamp(0.75rem,2.5dvh,1.25rem)] md:text-[clamp(1rem,2.5dvh,1.25rem)]"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 md:max-w-2xl md:gap-6">
      <header className="shrink-0 space-y-0.5 text-center md:space-y-1">
        <p className="text-[10px] tracking-[0.35em] text-black/55 md:text-xs">
          {roomModeLabel(mode, "strict", kumoGakure)}　{toKanji(stepIndex + 1)}／
          {toKanji(total)}
        </p>
        <h2 className="text-xl tracking-widest md:text-4xl">
          {isShirazu ? "一音を詠む" : label}
        </h2>
        {progressLabel && (
          <p className="text-[10px] tracking-[0.15em] text-black/50 md:text-sm">
            {progressLabel}
          </p>
        )}
        {theme.trim() ? (
          <p className="text-[10px] tracking-[0.2em] text-black/55 md:text-sm">
            お題：{theme.trim()}
          </p>
        ) : null}
        <div className="mx-auto w-full max-w-sm px-2 text-[10px] tracking-[0.2em] text-black/45 md:text-sm">
          <FitText text={`担当：${writer.name}`} minFontPx={9} />
        </div>
      </header>

      {promptLines.length > 0 && (
        <section className="brush-box shrink-0 px-4 py-2.5 md:px-5 md:py-[clamp(0.5rem,1.5dvh,1rem)]">
          <p className="mb-1.5 text-xs tracking-widest text-black/50">
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
              const hidden = kumoGakure && line.authorId !== myId;
              const shown = hidden ? hiddenPartMark(mode, i) : line.text;
              return (
                <li
                  key={`${line.authorId}-${i}-${shown}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="shrink-0 text-[10px] tracking-widest text-black/40">
                    {displayLabel}
                  </span>
                  <span>
                    {shown}
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
        <section className="brush-box mx-auto mt-auto w-full shrink-0 px-4 py-6 text-center md:mt-auto md:py-[clamp(1.5rem,4dvh,3rem)]">
          <div className="animate-pulse text-base tracking-widest text-black/70 md:text-[clamp(1rem,2.5dvh,1.25rem)]">
            <FitText text={`${writer.name} が合わせを考え中…`} minFontPx={11} />
          </div>
          <p className="mt-2 text-sm text-black/45">
            {isShirazu ? "一音を選んでいます" : `${label}を練っています`}
          </p>
        </section>
      ) : (
        <div className="mt-auto shrink-0 space-y-2">
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
            className={`brush-input w-full px-4 py-3 md:py-[clamp(0.75rem,2dvh,1rem)] ${
              isShirazu
                ? "text-center text-3xl tracking-[0.5em] md:text-[clamp(1.75rem,4.5dvh,2.25rem)]"
                : "text-lg md:text-xl"
            }`}
            autoFocus
          />
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
          >
            {submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}
