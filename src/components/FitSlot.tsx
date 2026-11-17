"use client";

import { useLayoutEffect, useRef } from "react";

interface FitSlotProps {
  text: string;
  className?: string;
  /** これより小さくしない（px） */
  minFontPx?: number;
  /** 空枠（〇）など縮小しない表示 */
  empty?: boolean;
}

/**
 * 1枠に文字列を左斜め上→右斜め下へ並べ、入りきらなければ font-size を下げる。
 * 親は横書きの正方形セルを想定。
 */
export function FitSlot({
  text,
  className = "",
  minFontPx = 8,
  empty = false,
}: FitSlotProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const chars = [...text];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || empty) return;

    const fit = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) return;

      const n = Math.max(chars.length, 1);
      const cell = Math.min(width, height);
      const inset = n === 1 ? 0.5 : 0.12;
      const usable = cell * Math.SQRT2 * (n === 1 ? 1 : 1 - inset * 2);
      // 文字同士が軽く触れ合う程度まで大きく取る
      const spaced =
        n === 1
          ? cell * 0.82
          : usable / Math.max(1, (n - 1) * 0.78);
      const size = Math.max(minFontPx, Math.min(cell * 0.85, spaced));
      el.style.fontSize = `${size}px`;
    };

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, minFontPx, empty, chars.length]);

  if (empty || chars.length === 0) {
    return (
      <span
        ref={ref}
        className={`flex h-full w-full items-center justify-center overflow-hidden text-[1.05em] leading-none [writing-mode:horizontal-tb] ${className}`}
      >
        {text || "〇"}
      </span>
    );
  }

  const last = Math.max(chars.length - 1, 1);
  const inset = chars.length === 1 ? 0.5 : 0.12;

  return (
    <span
      ref={ref}
      className={`relative block h-full w-full overflow-hidden leading-none [writing-mode:horizontal-tb] ${className}`}
    >
      {chars.map((ch, i) => {
        const t =
          chars.length === 1 ? inset : inset + (i / last) * (1 - inset * 2);
        return (
          <span
            key={`${i}-${ch}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
            style={{
              left: `${t * 100}%`,
              top: `${t * 100}%`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
