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
 * 縦書きの1枠に文字列を詰め、入りきらなければ font-size を下げる。
 * 雅号の FitText と同系統（親の幅・高さに収める）。
 */
export function FitSlot({
  text,
  className = "",
  minFontPx = 6,
  empty = false,
}: FitSlotProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || empty) return;

    const fit = () => {
      const parent = el.parentElement;
      if (!parent) return;
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (!Number.isFinite(base) || base <= 0) return;
      let size = base;
      el.style.fontSize = `${size}px`;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width <= 0 || height <= 0) return;
      while (
        size > minFontPx &&
        (el.scrollWidth > width + 0.5 || el.scrollHeight > height + 0.5)
      ) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(() => fit());
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [text, minFontPx, empty]);

  return (
    <span
      ref={ref}
      className={`inline-flex max-h-full max-w-full items-center justify-center overflow-hidden text-center leading-tight ${className}`}
    >
      {text}
    </span>
  );
}
