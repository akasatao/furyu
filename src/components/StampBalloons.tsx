"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { StampGlyph } from "@/components/StampGlyph";
import type { StampId } from "@/lib/stamps";

/** 下端から上端付近まで昇る時間 */
const RISE_MS = 3500;

export interface StampBalloon {
  key: string;
  stamp: StampId;
  name: string;
  /** 横位置（画面幅に対する %） */
  x: number;
  /** 揺れの向きと幅（-1..1） */
  sway: number;
}

function Balloon({
  balloon,
  onDone,
}: {
  balloon: StampBalloon;
  onDone: (key: string) => void;
}) {
  const riseRef = useRef<HTMLDivElement>(null);
  const swayRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);

  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // globals.css の配信に依存しないよう Web Animations で動かす
  useLayoutEffect(() => {
    const rise = riseRef.current;
    const sway = swayRef.current;
    if (!rise || !sway) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const fade = rise.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 1200,
        fill: "forwards",
      });
      fade.onfinish = () => onDoneRef.current(balloon.key);
      return () => fade.cancel();
    }

    const distance = window.innerHeight * 0.88;
    const riseAnim = rise.animate(
      [
        { transform: "translate(-50%, 0)", opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.08 },
        { opacity: 1, offset: 0.72 },
        { transform: `translate(-50%, -${distance}px)`, opacity: 0, offset: 1 },
      ],
      { duration: RISE_MS, easing: "cubic-bezier(0.33, 0, 0.67, 1)", fill: "forwards" },
    );
    const amp = 10 + Math.abs(balloon.sway) * 14;
    const dir = balloon.sway < 0 ? -1 : 1;
    const swayAnim = sway.animate(
      [
        { transform: "translateX(0) rotate(0deg)" },
        { transform: `translateX(${dir * amp}px) rotate(${dir * 5}deg)` },
        { transform: `translateX(${-dir * amp}px) rotate(${-dir * 5}deg)` },
        { transform: "translateX(0) rotate(0deg)" },
      ],
      { duration: 1600, iterations: Infinity, easing: "ease-in-out" },
    );
    riseAnim.onfinish = () => onDoneRef.current(balloon.key);
    return () => {
      riseAnim.cancel();
      swayAnim.cancel();
    };
  }, [balloon.key, balloon.sway]);

  return (
    <div
      ref={riseRef}
      className="absolute bottom-2"
      style={{
        left: `${balloon.x}%`,
        opacity: 0,
        transform: "translateX(-50%)",
      }}
    >
      <div ref={swayRef} className="flex flex-col items-center gap-1">
        {balloon.name ? (
          <span className="max-w-[8rem] truncate text-[11px] tracking-widest text-black/40 md:text-xs">
            {balloon.name}
          </span>
        ) : null}
        <StampGlyph stamp={balloon.stamp} />
      </div>
    </div>
  );
}

interface StampBalloonsProps {
  balloons: StampBalloon[];
  onDone: (key: string) => void;
}

/** 披露スタンプの風船。ViewportFit の transform を避けて body 直下に描く */
export function StampBalloons({ balloons, onDone }: StampBalloonsProps) {
  if (typeof document === "undefined" || balloons.length === 0) return null;
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[55] overflow-hidden [writing-mode:horizontal-tb]"
    >
      {balloons.map((b) => (
        <Balloon key={b.key} balloon={b} onDone={onDone} />
      ))}
    </div>,
    document.body,
  );
}
