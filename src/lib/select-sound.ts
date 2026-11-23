"use client";

import { effectiveAudioVolume } from "@/lib/audio-prefs";

const SELECT_SRC = "/audio/select.mp3";
const KAIKAI_SRC = "/audio/kaikai.mp3";
const BACK_SRC = "/audio/back.mp3";
const BANISH_SRC = "/audio/banish.mp3";
const BANISH_VICTIM_SRC = "/audio/banish-victim.mp3";

function playSrc(src: string, gain = 1): void {
  if (typeof window === "undefined") return;
  const volume = effectiveAudioVolume();
  if (volume <= 0) return;
  try {
    const audio = new Audio(src);
    audio.volume = Math.min(1, volume * gain);
    void audio.play().catch(() => {
      // 自動再生制限など。次の操作で鳴る
    });
  } catch {
    // 再生できない環境は無視
  }
}

/** モード選択・ボタン押しなど、選択操作の拍子木 */
export function playSelectSound(): void {
  playSrc(SELECT_SRC);
}

/** 戻る・退出など、ひとつ前へ戻る操作 */
export function playBackSound(): void {
  playSrc(BACK_SRC);
}

/** 戻る系ボタンか（文言 or data-nav="back"） */
export function isBackControl(control: HTMLElement): boolean {
  if (control.dataset.nav === "back") return true;
  const label = `${control.getAttribute("aria-label") ?? ""} ${control.textContent ?? ""}`;
  return /戻る|和室を出る/.test(label);
}

/** 開宴ボタンか（ほら貝だけ鳴らし、拍子木は重ねない） */
export function isKaikaiControl(control: HTMLElement): boolean {
  if (control.dataset.nav === "kaikai") return true;
  const label = `${control.getAttribute("aria-label") ?? ""} ${control.textContent ?? ""}`;
  return /開宴/.test(label);
}

let lastKaikaiAt = 0;

/** 開宴のほら貝（亭主と購読で二重に来ても一度だけ） */
export function playKaikaiSound(): void {
  const now = Date.now();
  if (now - lastKaikaiAt < 1500) return;
  lastKaikaiAt = now;
  playSrc(KAIKAI_SRC);
}

let lastBanishAt = 0;

/** 破門を見た側の爆発音（亭主・他連衆。二重通知でも一度だけ） */
export function playBanishSound(): void {
  const now = Date.now();
  if (now - lastBanishAt < 1500) return;
  lastBanishAt = now;
  playSrc(BANISH_SRC);
}

/** 破門された本人のショック音。他の効果音より一段大きく */
export function playBanishVictimSound(): void {
  playSrc(BANISH_VICTIM_SRC, 1.5);
}
