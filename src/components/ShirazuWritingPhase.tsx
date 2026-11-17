"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MODE_LABEL } from "@/lib/constants";
import {
  canSubmitShirazuUnit,
  clampShirazuDraft,
  formatShirazuLineWithSlots,
  locateShirazuMora,
  poemMoraCount,
  SHIRAZU_LINE_TARGETS,
  SHIRAZU_MORA_PER_POEM,
  shirazuRoundProgressLabel,
  shirazuUnitMoraCount,
} from "@/lib/shirazu";
import { shirazuOwnerLabel, toKanji } from "@/lib/utils";
import type { Poem } from "@/types/game";

const LINE_NAMES = ["上の句", "中の句", "下の句"] as const;

interface ShirazuWritingPhaseProps {
  poem: Poem;
  roundIndex: number;
  draft: string;
  playerCount: number;
  submittedCount: number;
  hasSubmitted: boolean;
  myId?: string;
  theme?: string;
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
  myId,
  theme = "",
  busy = false,
  onDraftChange,
  onSubmit,
}: ShirazuWritingPhaseProps) {
  const [composing, setComposing] = useState(false);
  const [localDraft, setLocalDraft] = useState(draft);
  const [inputFocused, setInputFocused] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportHeightRef = useRef(0);
  const filled = poemMoraCount(poem);
  const remaining = Math.max(0, SHIRAZU_MORA_PER_POEM - filled);
  const complete = remaining === 0;
  const progressLabel =
    filled < SHIRAZU_MORA_PER_POEM
      ? shirazuRoundProgressLabel(filled)
      : "完成";
  const moraLoc =
    filled < SHIRAZU_MORA_PER_POEM ? locateShirazuMora(filled) : null;
  const moraProgress = moraLoc
    ? `${toKanji(moraLoc.moraInLine + 1)}／${toKanji(moraLoc.lineTarget)}音`
    : "完成";
  const partHeading = moraLoc
    ? (LINE_NAMES[moraLoc.lineIndex] ?? "上の句")
    : "短冊は埋まりました";
  const unitMora = shirazuUnitMoraCount(draft);
  const finishesPoem = !complete && unitMora > 0 && unitMora >= remaining;
  const ownerLabel = shirazuOwnerLabel(poem, myId);
  /** スマホ＋キーボード時だけ横並びコンパクト表示 */
  const compact = inputFocused && isNarrow;

  const endInputMode = useCallback(() => {
    setInputFocused(false);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setComposing(false);
  }, [roundIndex, filled]);

  useEffect(() => {
    if (!composing) setLocalDraft(draft);
  }, [draft, composing]);

  useEffect(() => {
    if (!inputFocused) return;
    const vv = window.visualViewport;
    if (!vv) return;
    viewportHeightRef.current = vv.height;

    const onViewportResize = () => {
      const prev = viewportHeightRef.current;
      const next = vv.height;
      viewportHeightRef.current = next;
      if (next - prev > 80) {
        endInputMode();
        inputRef.current?.blur();
      }
    };

    vv.addEventListener("resize", onViewportResize);
    return () => vv.removeEventListener("resize", onViewportResize);
  }, [inputFocused, endInputMode]);

  useEffect(() => {
    if (!inputFocused) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflowX;
    const prevBody = body.style.overflowX;
    html.style.overflowX = "hidden";
    body.style.overflowX = "hidden";
    return () => {
      html.style.overflowX = prevHtml;
      body.style.overflowX = prevBody;
    };
  }, [inputFocused]);

  const canSubmit =
    !busy &&
    !hasSubmitted &&
    !composing &&
    (complete || canSubmitShirazuUnit(draft, remaining));

  const commitDraft = (raw: string) => {
    const next = clampShirazuDraft(raw);
    setLocalDraft(next);
    onDraftChange(next);
  };

  const submitLabel = complete || finishesPoem ? "短冊を渡す" : "短冊を回す";

  const handleFocus = () => {
    setInputFocused(true);
    const vv = window.visualViewport;
    if (vv) viewportHeightRef.current = vv.height;
  };

  const poemLines = poem.lines.map((line, i) => {
    const target = SHIRAZU_LINE_TARGETS[i] ?? 5;
    return {
      name: LINE_NAMES[i] ?? `${toKanji(i + 1)}句`,
      text: formatShirazuLineWithSlots(line?.text ?? "", target),
    };
  });

  return (
    <div
      className={`mx-auto flex w-full max-w-lg flex-col md:max-w-2xl ${
        compact || hasSubmitted
          ? "gap-2 overflow-hidden md:gap-5"
          : "gap-3 overflow-x-hidden md:gap-5"
      }`}
    >
      <header
        className={`shrink-0 text-center ${
          compact ? "space-y-0" : "space-y-0.5 md:space-y-1"
        }`}
      >
        <p
          className={`tracking-[0.35em] text-black/55 ${
            compact ? "text-[9px]" : "text-[10px] md:text-sm"
          }`}
        >
          {MODE_LABEL.shirazu}　{toKanji(filled)}／
          {toKanji(SHIRAZU_MORA_PER_POEM)}音
          {compact ? `　${progressLabel}` : ""}
        </p>
        {!compact && (
          <>
            <h2 className="text-xl tracking-widest md:text-[clamp(1.25rem,4dvh,2.25rem)]">
              {partHeading}
            </h2>
            <p className="text-[10px] tracking-[0.15em] text-black/50 md:text-sm">
              {moraProgress}
            </p>
            {theme.trim() ? (
              <p className="text-[10px] tracking-[0.2em] text-black/55 md:text-sm">
                お題：{theme.trim()}
              </p>
            ) : null}
          </>
        )}
        {compact && theme.trim() ? (
          <p className="text-[9px] tracking-[0.15em] text-black/50">
            お題：{theme.trim()}
          </p>
        ) : null}
      </header>

      <div
        className={`flex min-h-0 flex-1 flex-col items-center overscroll-contain ${
          compact
            ? "justify-between gap-2 overflow-hidden"
            : hasSubmitted
              ? "justify-center gap-4 overflow-hidden"
              : "justify-start gap-4 overflow-y-auto md:justify-center"
        }`}
      >
        <article
          className={`tanzaku relative flex w-full shrink-0 flex-col items-center ${
            compact
              ? "max-w-[7.5rem] px-2 py-2"
              : "max-w-[14rem] px-3 py-5 md:max-w-[min(18rem,38dvh)] md:px-4 md:py-[clamp(0.75rem,2.5dvh,1.5rem)]"
          }`}
        >
          <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
          {ownerLabel ? (
            <>
              <p
                className={`pointer-events-none absolute [writing-mode:vertical-rl] tracking-[0.15em] text-black/55 ${
                  compact
                    ? "top-1.5 right-1 text-[7px] leading-tight"
                    : "top-2.5 right-1.5 text-[10px] leading-relaxed md:top-3 md:right-2 md:text-xs"
                }`}
              >
                {ownerLabel}
              </p>
              <p
                className={`pointer-events-none absolute [writing-mode:vertical-rl] tracking-[0.15em] text-black/55 ${
                  compact
                    ? "bottom-1.5 left-1 text-[7px] leading-tight"
                    : "bottom-2.5 left-1.5 text-[10px] leading-relaxed md:bottom-3 md:left-2 md:text-xs"
                }`}
              >
                {ownerLabel}
              </p>
            </>
          ) : null}
          <div
            className={`flex items-center justify-center ${
              compact
                ? "py-1"
                : "min-h-[220px] py-3 md:min-h-[clamp(180px,36dvh,280px)] md:py-[clamp(0.5rem,1.5dvh,1rem)]"
            }`}
          >
            <p
              className={`[writing-mode:vertical-rl] ${
                compact
                  ? "text-[0.85rem] leading-[1.55] tracking-[0.2em]"
                  : "text-[1.35rem] leading-[2] tracking-[0.35em] md:text-[clamp(1.2rem,2.8dvh,1.6rem)]"
              }`}
              lang="ja"
            >
              {poemLines.map((line, i) => {
                const isLast = i === poemLines.length - 1;
                const offset = compact
                  ? i === 0
                    ? ""
                    : isLast
                      ? "mt-3"
                      : "mt-1.5"
                  : i === 0
                    ? ""
                    : isLast
                      ? "mt-10"
                      : "mt-4";
                return (
                  <span
                    key={line.name}
                    className={`${offset} block min-h-[1em]`.trim()}
                  >
                    {line.text}
                  </span>
                );
              })}
            </p>
          </div>
          {!ownerLabel && (
            <p
              className={`border-t-2 border-black text-center tracking-wider text-black/50 ${
                compact
                  ? "mt-0.5 max-w-[7rem] pt-1 text-[8px] leading-tight"
                  : "mt-1 max-w-[12rem] pt-1.5 text-[10px] leading-relaxed md:max-w-[16rem] md:pt-2 md:text-xs"
              }`}
            >
              <span className="block">{MODE_LABEL.shirazu}</span>
            </p>
          )}
        </article>

        {hasSubmitted ? (
          <section
            className={`brush-box w-full shrink-0 px-4 text-center ${
              compact ? "py-3" : "py-6"
            }`}
          >
            <p className="animate-pulse text-base tracking-widest text-black/70 md:text-[clamp(1rem,2.5dvh,1.25rem)]">
              他の連衆を待っています
            </p>
            <p className="mt-2 text-sm text-black/45">
              提出 {toKanji(submittedCount)}／{toKanji(playerCount)}
            </p>
          </section>
        ) : complete ? (
          <div className="w-full shrink-0 space-y-2 pb-2">
            <p className="text-center text-sm tracking-widest text-black/55">
              この短冊はすでに十七音です
            </p>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em]"
            >
              短冊を渡す
            </button>
          </div>
        ) : (
          <div className="w-full shrink-0 space-y-2 pb-1">
            {!compact && (
              <label
                htmlFor="shirazu-mora-input"
                className="text-sm tracking-widest text-black/70"
              >
                あなたの一音
              </label>
            )}
            <input
              ref={inputRef}
              id="shirazu-mora-input"
              type="text"
              inputMode="text"
              lang="ja"
              autoComplete="off"
              value={localDraft}
              placeholder=""
              disabled={busy}
              onFocus={handleFocus}
              onBlur={() => {
                window.setTimeout(() => {
                  if (document.activeElement !== inputRef.current) {
                    endInputMode();
                  }
                }, 120);
              }}
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
              className={`brush-input w-full px-4 text-center tracking-[0.5em] ${
                compact
                  ? "py-2 text-2xl"
                  : "py-3 text-3xl md:py-[clamp(0.75rem,2dvh,1rem)] md:text-[clamp(1.75rem,4.5dvh,2.25rem)]"
              }`}
              autoFocus
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className={`brush-btn w-full px-4 tracking-[0.25em] ${
                compact
                  ? "py-2 text-sm"
                  : "py-3 text-base md:py-[clamp(0.75rem,2dvh,1rem)]"
              }`}
            >
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
