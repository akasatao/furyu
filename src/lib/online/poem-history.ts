"use client";

import { uid } from "@/lib/utils";
import type { Poem, ShirazuStyle, VerseMode } from "@/types/game";

const KEY = "furyu_poem_history";
const MAX_ENTRIES = 60;

export type PoemHistoryLine = {
  text: string;
  units?: string[];
  authorName?: string;
};

export type PoemHistoryEntry = {
  id: string;
  /** 同じ対局の句をまとめる */
  batchId: string;
  savedAt: string;
  mode: VerseMode;
  lines: PoemHistoryLine[];
  ownerId?: string;
  ownerName?: string;
  theme?: string;
  shirazuStyle?: ShirazuStyle;
};

function readRaw(): PoemHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PoemHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(entries: PoemHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function loadPoemHistory(): PoemHistoryEntry[] {
  return readRaw();
}

/** 履歴から一句消す */
export function removePoemFromHistory(entryId: string): PoemHistoryEntry[] {
  const next = readRaw().filter((entry) => entry.id !== entryId);
  writeRaw(next);
  return next;
}

/** 完成した句を履歴へ追記。既に同じ poem.id があれば何もしない */
export function appendPoemsToHistory(
  poems: Poem[],
  options?: { theme?: string },
): PoemHistoryEntry[] {
  if (poems.length === 0) return readRaw();

  const existing = readRaw();
  const existingIds = new Set(existing.map((e) => e.id));
  const fresh = poems.filter((p) => p.id && !existingIds.has(p.id));
  if (fresh.length === 0) return existing;

  const batchId = uid("batch");
  const savedAt = new Date().toISOString();
  const theme = options?.theme?.trim() || undefined;
  const additions: PoemHistoryEntry[] = fresh.map((poem) => ({
    id: poem.id,
    batchId,
    savedAt,
    mode: poem.mode,
    ownerId: poem.ownerId,
    ownerName: poem.ownerName,
    theme,
    shirazuStyle: poem.shirazuStyle,
    lines: poem.lines.map((line) => ({
      text: line?.text ?? "？",
      units: line?.units,
      authorName: line?.authorName,
    })),
  }));

  const next = [...additions, ...existing].slice(0, MAX_ENTRIES);
  writeRaw(next);
  return next;
}

export function historyEntryToPoem(entry: PoemHistoryEntry): Poem {
  return {
    id: entry.id,
    mode: entry.mode,
    ownerId: entry.ownerId,
    ownerName: entry.ownerName,
    shirazuStyle: entry.shirazuStyle,
    lines: entry.lines.map((line) => ({
      text: line.text,
      units: line.units,
      authorId: entry.ownerId ?? "",
      authorName: line.authorName ?? entry.ownerName ?? "—",
    })),
  };
}
