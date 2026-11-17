"use client";

import { FitSlot } from "@/components/FitSlot";
import { shirazuLineSlotUnits } from "@/lib/shirazu";
import type { PoemLine } from "@/types/game";

interface ShirazuLineSlotsProps {
  line: PoemLine | null | undefined;
  target: number;
  /** 自由律：複数文字を枠に詰め縮小 */
  free?: boolean;
  /** 空枠〇を薄く */
  dimEmpty?: boolean;
  className?: string;
}

/** 五・七・五の1行分の枠を並べる */
export function ShirazuLineSlots({
  line,
  target,
  free = false,
  dimEmpty = true,
  className = "",
}: ShirazuLineSlotsProps) {
  const slots = shirazuLineSlotUnits(line, target);

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
    <span className={className}>
      {slots.map((unit, i) => {
        const empty = unit === "〇";
        return (
          <span
            key={i}
            className="inline-flex h-[1.05em] w-[1.05em] items-center justify-center align-middle"
          >
            <FitSlot
              text={unit}
              empty={empty}
              minFontPx={5}
              className={
                empty && dimEmpty
                  ? "text-black/30 [writing-mode:vertical-rl]"
                  : "text-black [writing-mode:vertical-rl]"
              }
            />
          </span>
        );
      })}
    </span>
  );
}
