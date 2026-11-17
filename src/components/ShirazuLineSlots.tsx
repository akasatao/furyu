"use client";

import { useLayoutEffect, useRef } from "react";
import { FitSlot } from "@/components/FitSlot";
import { FreeSlotPeek } from "@/components/FreeSlotPeek";
import { shirazuLineSlotUnits } from "@/lib/shirazu";
import type { PoemLine } from "@/types/game";

interface ShirazuLineSlotsProps {
  line: PoemLine | null | undefined;
  target: number;
  /** 自由律：複数文字を枠に詰め縮小 */
  free?: boolean;
  /** 空枠〇を薄く */
  dimEmpty?: boolean;
  /** false なら枠タップで個別ポップアップしない（短冊全体の文字起こし用） */
  slotPeek?: boolean;
  /** 披露：枠を順に書き下ろす（先頭枠の delay） */
  writeDelayMs?: number;
  /** 披露：1枠を書き下ろす時間（次の枠はその直後から） */
  writeMsPerSlot?: number;
  className?: string;
}

/** 五・七・五の1行分の枠を並べる */
export function ShirazuLineSlots({
  line,
  target,
  free = false,
  dimEmpty = true,
  slotPeek = true,
  writeDelayMs = 0,
  writeMsPerSlot,
  className = "",
}: ShirazuLineSlotsProps) {
  const slots = shirazuLineSlotUnits(line, target);
  const containerRef = useRef<HTMLSpanElement>(null);
  const animateWrite =
    free &&
    !slotPeek &&
    writeMsPerSlot != null &&
    writeMsPerSlot > 0;
  const slotsKey = slots.join("\u0000");

  // 俳句・短歌の tanzaku-line と同じ、上から下への書き下ろし。
  // globals.css の配信に依存しないよう Web Animations で動かす
  useLayoutEffect(() => {
    if (!animateWrite || writeMsPerSlot == null) return;
    const container = containerRef.current;
    if (!container) return;
    const els = container.querySelectorAll<HTMLElement>("[data-free-slot]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const el of Array.from(els)) el.style.clipPath = "none";
      return;
    }

    const animations = Array.from(els).map((el, i) =>
      el.animate(
        [
          { clipPath: "inset(0 0 100% 0)" },
          { clipPath: "inset(0 0 0 0)" },
        ],
        {
          duration: writeMsPerSlot,
          delay: writeDelayMs + i * writeMsPerSlot,
          easing: "linear",
          fill: "both",
        },
      ),
    );
    return () => {
      for (const a of animations) a.cancel();
    };
  }, [animateWrite, writeDelayMs, writeMsPerSlot, slotsKey]);

  if (!free) {
    return (
      <span className={className}>
        {slots.map((unit, i) => {
          const empty = unit === "〇";
          return (
            <span
              key={i}
              className={empty && dimEmpty ? "text-black/30" : "text-black"}
            >
              {unit}
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span
      ref={containerRef}
      className={`inline-flex flex-col items-center gap-[0.2em] [writing-mode:horizontal-tb] ${className}`}
    >
      {slots.map((unit, i) => {
        const empty = unit === "〇";
        if (slotPeek) {
          return (
            <FreeSlotPeek
              key={i}
              text={unit}
              empty={empty}
              dimEmpty={dimEmpty}
            />
          );
        }
        return (
          <span
            key={i}
            data-free-slot
            className="relative box-border block h-[1.35em] w-[1.35em] shrink-0 overflow-hidden"
            style={animateWrite ? { clipPath: "inset(0 0 100% 0)" } : undefined}
          >
            <FitSlot
              text={unit}
              empty={empty}
              minFontPx={9}
              className={
                empty && dimEmpty ? "text-black/35" : "text-black"
              }
            />
          </span>
        );
      })}
    </span>
  );
}
