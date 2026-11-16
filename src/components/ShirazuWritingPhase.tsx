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
import { toKanji } from "@/lib/utils";
import type { Poem } from "@/types/game";

const LINE_NAMES = ["上の句", "中の句", "下の句"] as const;

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
  const partHeading =
    filled < SHIRAZU_MORA_PER_POEM
      ? (LINE_NAMES[locateShirazuMora(filled).lineIndex] ?? "上の句")
      : "短冊は埋まりました";
  const unitMora = shirazuUnitMoraCount(draft);
  const finishesPoem = !complete && unitMora > 0 && unitMora >= remaining;
  const ownerLabel = poem.ownerName ? `${poem.ownerName}の句` : null;
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
      className={`mx-auto flex w-full max-w-lg flex-1 min-h-0 flex-col md:flex-none ${
        compact ? "gap-2 overflow-hidden" : "gap-3 overflow-x-hidden md:gap-5"
      }`}
    >
      <header
        className={`shrink-0 text-center ${
          compact ? "space-y-0" : "space-y-0.5 md:space-y-1"
        }`}
      >
        <p
          className={`tracking-[0.35em] text-black/55 ${
            compact ? "text-[9px]" : "text-[10px] md:text-xs"
          }`}
        >
          {MODE_LABEL.shirazu}　{toKanji(filled)}／
          {toKanji(SHIRAZU_MORA_PER_POEM)}音
          {compact ? `　${progressLabel}` : ""}
        </p>
        {!compact && (
          <>
            <h2 className="text-xl tracking-widest md:text-3xl">
              {partHeading}
            </h2>
            <p className="text-[10px] tracking-[0.15em] text-black/50 md:text-xs">
              {progressLabel}
            </p>
          </>
        )}
      </header>

      <div
        className={`flex min-h-0 flex-1 flex-col items-center overscroll-contain ${
          compact
            ? "justify-between gap-2 overflow-hidden"
            : "justify-start gap-4 overflow-y-auto md:justify-center"
        }`}
      >
        {compact ? (
          <section className="brush-box w-full shrink-0 px-3 py-2.5">
            {ownerLabel && (
              <p className="mb-2 text-center text-[10px] tracking-widest text-black/55">
                {ownerLabel}
              </p>
            )}
            <ul className="space-y-1.5">
              {poemLines.map((line) => (
                <li
                  key={line.name}
                  className="flex items-baseline gap-2"
                >
                  <span className="w-10 shrink-0 text-[10px] tracking-widest text-black/40">
                    {line.name}
                  </span>
                  <span
                    className="min-w-0 flex-1 text-lg tracking-[0.2em]"
                    lang="ja"
                  >
                    {line.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <article className="tanzaku relative flex w-full max-w-[14rem] flex-col items-center px-3 py-5">
            <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
            <p className="mb-1 w-full text-center text-[10px] tracking-widest text-black/55">
              {ownerLabel ?? "俳句"}
            </p>
            <div className="flex min-h-[220px] items-center justify-center py-3">
              <p
                className="text-[1.35rem] leading-[2] tracking-[0.35em] [writing-mode:vertical-rl]"
                lang="ja"
              >
                {poemLines.map((line, i) => {
                  const isLast = i === poemLines.length - 1;
                  const offset =
                    i === 0 ? "" : isLast ? "mt-10" : "mt-4";
                  return (
                    <span
                      key={line.name}
                      className={`${offset} block min-h-[1.5em]`.trim()}
                    >
                      {line.text}
                    </span>
                  );
                })}
              </p>
            </div>
            <p className="mt-1 max-w-[12rem] border-t-2 border-black pt-1.5 text-center text-[10px] leading-relaxed tracking-wider text-black/50">
              <span className="block">
                {ownerLabel ?? MODE_LABEL.shirazu}
              </span>
            </p>
          </article>
        )}

        {hasSubmitted ? (
          <section
            className={`brush-box w-full px-4 text-center ${
              compact ? "py-3" : "py-6"
            }`}
          >
            <p className="animate-pulse text-base tracking-widest text-black/70 md:text-lg">
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
                compact ? "py-2 text-2xl" : "py-3 text-3xl md:py-3.5"
              }`}
              autoFocus
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className={`brush-btn w-full px-4 tracking-[0.25em] ${
                compact ? "py-2 text-sm" : "py-3 text-base"
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
