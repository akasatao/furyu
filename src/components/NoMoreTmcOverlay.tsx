"use client";

import { useEffect, useState } from "react";

const LETTERS = ["N", "o", "M", "o", "r", "e", "T", "M", "C"] as const;
const LETTER_MS = 280;
const SLASH_MS = 2000;

/** 待機中に全員の画面へ出す。一文字ずつ入れ替えてから、斜めに全文を出す */
export function NoMoreTmcOverlay({ playId }: { playId: number }) {
  const [letterIndex, setLetterIndex] = useState(0);
  const [stage, setStage] = useState<"letter" | "slash" | "off">("off");

  useEffect(() => {
    if (playId === 0) {
      setStage("off");
      return;
    }
    setLetterIndex(0);
    setStage("letter");
    const timers: number[] = [];
    for (let i = 1; i < LETTERS.length; i += 1) {
      timers.push(
        window.setTimeout(() => {
          setLetterIndex(i);
        }, i * LETTER_MS),
      );
    }
    const slashAt = LETTERS.length * LETTER_MS;
    timers.push(
      window.setTimeout(() => {
        setStage("slash");
      }, slashAt),
    );
    timers.push(
      window.setTimeout(() => {
        setStage("off");
      }, slashAt + SLASH_MS),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [playId]);

  if (stage === "off") return null;
  const letter = LETTERS[letterIndex] ?? "N";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-white"
    >
      {stage === "letter" ? (
        <p className="text-[clamp(6rem,28vw,12rem)] leading-none">{letter}</p>
      ) : (
        <p
          className="whitespace-nowrap text-[clamp(2.75rem,9vw,7.5rem)] leading-none tracking-[0.08em]"
          style={{ transform: "rotate(28deg)" }}
        >
          No More TMC
        </p>
      )}
    </div>
  );
}
