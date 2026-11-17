"use client";

const KEY = "furyu_nickname";

export function loadNickname(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY) ?? "";
}

export function saveNickname(value: string): void {
  if (typeof window === "undefined") return;
  const trimmed = value.trim().slice(0, 12);
  if (!trimmed) {
    window.localStorage.removeItem(KEY);
    return;
  }
  window.localStorage.setItem(KEY, trimmed);
}
