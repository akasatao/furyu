"use client";

/** 披露の書き出し演出を、同じ和室では一度見たらやり直さない */
type SeenStore = {
  steps: number[];
  line: boolean;
};

function storageKey(roomId: string): string {
  return `furyu_reveal_seen_${roomId}`;
}

function readStore(roomId: string): SeenStore {
  if (typeof window === "undefined") return { steps: [], line: false };
  try {
    const raw = window.sessionStorage.getItem(storageKey(roomId));
    if (!raw) return { steps: [], line: false };
    const parsed = JSON.parse(raw) as SeenStore;
    return {
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      line: Boolean(parsed.line),
    };
  } catch {
    return { steps: [], line: false };
  }
}

function writeStore(roomId: string, store: SeenStore): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(roomId), JSON.stringify(store));
  } catch {
    // quota など
  }
}

/** リレー披露の何首目を見たか */
export function hasShirazuRevealStepSeen(
  roomId: string | null | undefined,
  stepIndex: number,
): boolean {
  if (!roomId) return false;
  return readStore(roomId).steps.includes(stepIndex);
}

export function markShirazuRevealStepSeen(
  roomId: string | null | undefined,
  stepIndex: number,
): void {
  if (!roomId || stepIndex < 0) return;
  const store = readStore(roomId);
  if (store.steps.includes(stepIndex)) return;
  writeStore(roomId, {
    ...store,
    steps: [...store.steps, stepIndex],
  });
}

/** 俳句・短歌の披露書き出しを見たか */
export function hasLineRevealSeen(roomId: string | null | undefined): boolean {
  if (!roomId) return false;
  return readStore(roomId).line;
}

export function markLineRevealSeen(roomId: string | null | undefined): void {
  if (!roomId) return;
  const store = readStore(roomId);
  if (store.line) return;
  writeStore(roomId, { ...store, line: true });
}

/** 再び宴を開くときなど、その和室の記録を消す */
export function clearRevealSeen(roomId: string | null | undefined): void {
  if (!roomId || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(roomId));
  } catch {
    // ignore
  }
}
