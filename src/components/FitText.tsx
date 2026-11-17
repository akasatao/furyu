"use client";

import { useLayoutEffect, useRef } from "react";

interface FitTextProps {
  text: string;
  className?: string;
  /** これより小さくしない（px） */
  minFontPx?: number;
}

/** 親幅に収まるまで文字サイズを下げる（一行） */
export function FitText({
  text,
  className = "",
  minFontPx = 10,
}: FitTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      const parent = el.parentElement;
      if (!parent) return;
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (!Number.isFinite(base) || base <= 0) return;
      let size = base;
      el.style.fontSize = `${size}px`;
      // 親がまだ広がる前は測れないことがある
      const width = parent.clientWidth;
      if (width <= 0) return;
      while (size > minFontPx && el.scrollWidth > width + 0.5) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(() => fit());
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [text, minFontPx]);

  return (
    <span
      ref={ref}
      className={`block max-w-full overflow-hidden whitespace-nowrap ${className}`}
    >
      {text}
    </span>
  );
}
