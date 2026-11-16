"use client";

import { uid } from "@/lib/utils";

const KEY = "furyu_player_id";

export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return uid("player");
  const existing = window.localStorage.getItem(KEY);
  if (existing) return existing;
  const next = uid("player");
  window.localStorage.setItem(KEY, next);
  return next;
}
