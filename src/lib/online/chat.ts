import { getSupabase } from "@/lib/supabase/client";
import { clampText } from "@/lib/utils";

/** 画面を流す一文の長さ */
export const CHAT_MAX_LENGTH = 40;
const CHAT_NAME_MAX = 24;

export interface RoomChat {
  id: string;
  playerId: string;
  name: string;
  body: string;
  createdAt: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}

function isMissingChatTable(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /room_chats/i.test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  );
}

function toChatError(error: unknown, action: "send" | "load"): Error {
  if (isMissingChatTable(error)) {
    return new Error(
      "コメントの準備がまだです。Supabase で room_chats を追加してください。",
    );
  }
  if (action === "load") return new Error("コメントを読み込めませんでした。");
  return new Error("コメントを送れませんでした。");
}

/** DB の行と broadcast の両方を受け取る */
export function parseRoomChat(payload: unknown): RoomChat | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const id = body.id;
  const playerId = body.playerId ?? body.player_id;
  const name = body.name;
  const text = body.body;
  const createdAt = body.createdAt ?? body.created_at;
  if (typeof id !== "string" || !id) return null;
  if (typeof playerId !== "string" || !playerId) return null;
  if (typeof name !== "string" || typeof text !== "string") return null;
  const trimmedName = name.trim().slice(0, CHAT_NAME_MAX);
  const trimmedBody = clampText(text.replace(/[\r\n\t]/g, "").trim(), CHAT_MAX_LENGTH);
  if (!trimmedName || !trimmedBody) return null;
  if (typeof createdAt !== "string" || !createdAt) return null;
  return {
    id,
    playerId,
    name: trimmedName,
    body: trimmedBody,
    createdAt,
  };
}

export async function listRoomChats(roomId: string): Promise<RoomChat[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("room_chats")
    .select("id, player_id, name, body, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw toChatError(error, "load");
  const chats: RoomChat[] = [];
  for (const row of data ?? []) {
    const chat = parseRoomChat(row);
    if (chat) chats.push(chat);
  }
  return chats;
}

export async function sendRoomChat(options: {
  roomId: string;
  playerId: string;
  name: string;
  body: string;
}): Promise<RoomChat> {
  const name = options.name.trim().slice(0, CHAT_NAME_MAX) || "名無し";
  const body = clampText(
    options.body.replace(/[\r\n\t]/g, "").trim(),
    CHAT_MAX_LENGTH,
  );
  if (!body) throw new Error("コメントを入力してください。");

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("room_chats")
    .insert({
      room_id: options.roomId,
      player_id: options.playerId,
      name,
      body,
    })
    .select("id, player_id, name, body, created_at")
    .single();
  if (error) throw toChatError(error, "send");
  const chat = parseRoomChat(data);
  if (!chat) throw new Error("コメントを送れませんでした。");
  return chat;
}
