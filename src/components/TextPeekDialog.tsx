"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface TextPeekDialogProps {
  text: string;
  open: boolean;
  onClose: () => void;
  /** 読み上げ用ラベル */
  label?: string;
}

/** 全文を読むための中央ポップアップ（スクロールなし） */
export function TextPeekDialog({
  text,
  open,
  onClose,
  label,
}: TextPeekDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-4 [writing-mode:horizontal-tb]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label ?? text}
        className="brush-box m-1 w-full max-w-sm bg-white px-4 py-4 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="whitespace-pre-wrap break-words text-lg leading-relaxed tracking-wider text-black [overflow-wrap:anywhere]">
          {text}
        </p>
        <button
          type="button"
          className="brush-btn mt-4 w-full px-3 py-2 text-sm tracking-[0.3em]"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>,
    document.body,
  );
}
