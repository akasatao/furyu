/** 披露で飛ばせるスタンプ */
export type StampId = "good" | "bad" | "furyu" | "question";

export const STAMP_IDS: StampId[] = ["good", "bad", "question", "furyu"];

export const STAMP_LABEL: Record<StampId, string> = {
  good: "いいね",
  bad: "いまいち",
  furyu: "風流",
  question: "？",
};

export interface StampPayload {
  stamp: StampId;
  playerId: string;
  name: string;
}

function isStampId(value: unknown): value is StampId {
  return typeof value === "string" && (STAMP_IDS as string[]).includes(value);
}

/** broadcast で届いた payload を検証する。不正なら null */
export function parseStampPayload(payload: unknown): StampPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (!isStampId(body.stamp)) return null;
  if (typeof body.playerId !== "string" || !body.playerId) return null;
  if (typeof body.name !== "string") return null;
  const name = body.name.trim().slice(0, 24);
  return { stamp: body.stamp, playerId: body.playerId, name };
}
