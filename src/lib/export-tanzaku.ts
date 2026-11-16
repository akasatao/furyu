"use client";

import { toPng } from "html-to-image";

export async function captureElementPng(
  element: HTMLElement,
  options?: { pixelRatio?: number },
): Promise<string> {
  return toPng(element, {
    cacheBust: true,
    pixelRatio: options?.pixelRatio ?? 2,
    backgroundColor: "#ffffff",
  });
}

export function downloadPngDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
