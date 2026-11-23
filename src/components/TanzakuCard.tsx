"use client";

import { useState } from "react";
import { ChoonText } from "@/components/ChoonText";
import { ShirazuLineSlots } from "@/components/ShirazuLineSlots";
import { TextPeekDialog } from "@/components/TextPeekDialog";
import { MODE_LABEL, PART_LABELS, PART_TARGETS } from "@/lib/constants";
import { freePoemTranscript } from "@/lib/shirazu";
import { shirazuOwnerLabel } from "@/lib/utils";
import type { Poem } from "@/types/game";

/** 一文字あたりの表示時間（しっかり・俳句・短歌） */
const MS_PER_CHAR = 160;
/** 句が出し終わってから次の句までの待ち */
const GAP_MS = 500;
/** 自由律：1枠を1文字とみなし、俳句・短歌と同じ速さと間で書き下ろす */
const FREE_MS_PER_SLOT = MS_PER_CHAR;
const FREE_GAP_MS = GAP_MS;

const FREE_SLOT_TARGETS = PART_TARGETS.shirazu;

interface TanzakuCardProps {
  poem: Poem;
  /** 匿名表示（個別作者を隠す）。リレーで owner がある場合は「○○の句」優先 */
  anonymous?: boolean;
  /** 画像キャプチャ用：アニメなしで全句表示 */
  still?: boolean;
  /** false のあいだは短冊枠だけ出し、文字は隠したまま */
  writing?: boolean;
  /** 閲覧者。自分の句なら「あなたの句」 */
  viewerId?: string | null;
}

export function TanzakuCard({
  poem,
  anonymous = false,
  still = false,
  writing = true,
  viewerId = null,
}: TanzakuCardProps) {
  const labels = PART_LABELS[poem.mode];
  const isShirazu = poem.mode === "shirazu";
  const tanka = poem.mode === "tanka";
  const free = isShirazu && poem.shirazuStyle === "free";
  const ownerLabel = shirazuOwnerLabel(poem, viewerId);
  const showAnonymous = (anonymous || isShirazu) && !ownerLabel;
  /** キャプチャ時は常に全文。それ以外は writing が立つまで実字を出さない */
  const showText = still || writing;
  /**
   * しっかり披露の待ち：〇で枠だけ見せる。
   * 自由律は〇が一瞬出ると目立つので、書き出しまで空白のままにする。
   */
  const showShirazuSlots = isShirazu && !free && !showText;
  const [peekOpen, setPeekOpen] = useState(false);
  const canPeekPoem = free && showText;
  const transcript = canPeekPoem ? freePoemTranscript(poem) : "";
  /** 自由律披露：枠ごとに delay を付けて順に出す */
  const animateFreeSlots = free && showText && !still;

  let delayMs = 0;
  const lineTimings = poem.lines.map((line, i) => {
    // 自由律は1枠＝1文字として、五・七・五の枠数で速度を揃える
    const chars = free
      ? (FREE_SLOT_TARGETS[i] ?? 5)
      : Math.max(1, [...(line?.text ?? "")].length);
    const step = free ? FREE_MS_PER_SLOT : MS_PER_CHAR;
    const gap = free ? FREE_GAP_MS : GAP_MS;
    const durationMs = chars * step;
    const timing = { delayMs, durationMs };
    delayMs += durationMs + gap;
    return timing;
  });

  const totalWriteMs = delayMs;

  const ownerCornerClass =
    "pointer-events-none absolute text-[10px] leading-relaxed tracking-[0.2em] text-black/55 [writing-mode:vertical-rl] md:text-[clamp(0.65rem,1.6dvh,0.875rem)] md:tracking-[0.25em]";

  return (
    <>
      <article
        className={`tanzaku relative mx-auto flex w-full max-w-[15rem] flex-col items-center px-3 py-5 md:max-w-[min(22rem,42dvh)] md:px-5 md:py-[clamp(1rem,3dvh,2rem)] ${
          canPeekPoem ? "cursor-pointer" : ""
        }`}
        data-write-ms={still ? undefined : totalWriteMs}
        role={canPeekPoem ? "button" : undefined}
        tabIndex={canPeekPoem ? 0 : undefined}
        aria-label={canPeekPoem ? "短冊の文字起こしを見る" : undefined}
        onClick={
          canPeekPoem
            ? () => {
                setPeekOpen(true);
              }
            : undefined
        }
        onKeyDown={
          canPeekPoem
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPeekOpen(true);
                }
              }
            : undefined
        }
      >
        <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
        {ownerLabel ? (
          <>
            <p className={`${ownerCornerClass} top-3 right-2 md:top-4 md:right-3`}>
              {ownerLabel}
            </p>
            <p
              className={`${ownerCornerClass} bottom-3 left-2 md:bottom-4 md:left-3`}
            >
              {ownerLabel}
            </p>
          </>
        ) : (
          <p className="mb-2 text-sm tracking-[0.35em] text-black/45 md:mb-[clamp(0.5rem,1.5dvh,1rem)] md:text-[clamp(0.875rem,2.5dvh,1.25rem)]">
            {still
              ? "風流オンライン"
              : MODE_LABEL[isShirazu ? "haiku" : poem.mode]}
          </p>
        )}
        <div className="flex min-h-[220px] items-center justify-center py-3 md:min-h-[clamp(220px,42dvh,340px)] md:py-[clamp(0.75rem,2dvh,1.25rem)]">
          {showText ? (
            <div
              key={animateFreeSlots ? "free-writing" : "writing"}
              className={
                free
                  ? "pointer-events-none text-[1.35rem] leading-none tracking-normal [writing-mode:vertical-rl] md:text-[clamp(1.25rem,3dvh,1.75rem)]"
                  : tanka
                    ? "tanzaku-tanka max-w-full [writing-mode:vertical-rl]"
                    : "text-[1.35rem] leading-[2] tracking-[0.35em] [writing-mode:vertical-rl] md:text-[clamp(1.35rem,3.2dvh,2rem)] md:leading-[2.15] md:tracking-[0.4em]"
              }
              lang="ja"
            >
              {poem.lines.map((line, i) => {
                const isLast = i === poem.lines.length - 1;
                const offset = free
                  ? i === 0
                    ? ""
                    : isLast
                      ? "mt-10 mr-6 md:mt-[clamp(1.5rem,4dvh,3.5rem)] md:mr-7"
                      : "mt-4 mr-5 md:mt-[clamp(0.75rem,2dvh,1.5rem)] md:mr-6"
                  : i === 0
                    ? ""
                    : isLast
                      ? "mt-10 md:mt-[clamp(1.5rem,4dvh,3.5rem)]"
                      : "mt-4 md:mt-[clamp(0.75rem,2dvh,1.5rem)]";
                const target = PART_TARGETS.shirazu[i] ?? 5;
                const animateLine = !still && !free;
                return (
                  <span
                    key={i}
                    className={`${animateLine ? "tanzaku-line " : ""}${offset} block`.trim()}
                    style={
                      animateLine
                        ? {
                            animationDelay: `${lineTimings[i].delayMs}ms`,
                            animationDuration: `${lineTimings[i].durationMs}ms`,
                          }
                        : undefined
                    }
                  >
                    {isShirazu ? (
                      <ShirazuLineSlots
                        line={line}
                        target={target}
                        free={free}
                        dimEmpty={false}
                        slotPeek={false}
                        writeDelayMs={
                          animateFreeSlots
                            ? lineTimings[i].delayMs
                            : undefined
                        }
                        writeMsPerSlot={
                          animateFreeSlots ? FREE_MS_PER_SLOT : undefined
                        }
                      />
                    ) : (
                      <ChoonText text={line?.text ?? "？"} />
                    )}
                  </span>
                );
              })}
            </div>
          ) : showShirazuSlots ? (
            <p
              key="slots"
              className={
                free
                  ? "text-[1.35rem] leading-none tracking-normal text-black/35 [writing-mode:vertical-rl] md:text-[clamp(1.25rem,3dvh,1.75rem)]"
                  : "text-[1.35rem] leading-[2] tracking-[0.35em] text-black/35 [writing-mode:vertical-rl] md:text-[clamp(1.35rem,3.2dvh,2rem)] md:leading-[2.15] md:tracking-[0.4em]"
              }
              lang="ja"
            >
              {PART_TARGETS.shirazu.map((target, i) => {
                const isLast = i === PART_TARGETS.shirazu.length - 1;
                const offset = free
                  ? i === 0
                    ? ""
                    : isLast
                      ? "mt-10 mr-6 md:mt-[clamp(1.5rem,4dvh,3.5rem)] md:mr-7"
                      : "mt-4 mr-5 md:mt-[clamp(0.75rem,2dvh,1.5rem)] md:mr-6"
                  : i === 0
                    ? ""
                    : isLast
                      ? "mt-10 md:mt-[clamp(1.5rem,4dvh,3.5rem)]"
                      : "mt-4 md:mt-[clamp(0.75rem,2dvh,1.5rem)]";
                return (
                  <span key={i} className={`${offset} block`.trim()}>
                    <ShirazuLineSlots
                      line={null}
                      target={target}
                      free={free}
                      slotPeek={false}
                    />
                  </span>
                );
              })}
            </p>
          ) : null}
        </div>
        {!ownerLabel && (
          <p className="mt-1 max-w-[12rem] border-t-2 border-black pt-2 text-center text-[10px] leading-relaxed tracking-wider text-black/50 md:mt-[clamp(0.25rem,1dvh,0.5rem)] md:max-w-[18rem] md:pt-[clamp(0.5rem,1.5dvh,0.75rem)] md:text-[clamp(0.65rem,1.5dvh,0.875rem)]">
            {showAnonymous ? (
              <span className="block">{MODE_LABEL.shirazu}</span>
            ) : (
              poem.lines.map((line, i) => (
                <span key={i} className="block">
                  {labels[i]}：{line?.authorName ?? "—"}
                </span>
              ))
            )}
          </p>
        )}
      </article>
      <TextPeekDialog
        text={transcript}
        open={peekOpen}
        onClose={() => setPeekOpen(false)}
        label="句の文字起こし"
      />
    </>
  );
}

/** 短冊の書き出し完了までの目安ms */
export function estimateTanzakuWriteMs(poem: Poem): number {
  const free = poem.mode === "shirazu" && poem.shirazuStyle === "free";
  let delayMs = 0;
  poem.lines.forEach((line, i) => {
    const chars = free
      ? (PART_TARGETS.shirazu[i] ?? 5)
      : Math.max(1, [...(line?.text ?? "")].length);
    const step = free ? FREE_MS_PER_SLOT : MS_PER_CHAR;
    const gap = free ? FREE_GAP_MS : GAP_MS;
    delayMs += chars * step + gap;
  });
  return delayMs;
}
