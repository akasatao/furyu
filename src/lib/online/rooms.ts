"use client";

import { assignPartIndexes } from "@/lib/roles";
import { getSupabase } from "@/lib/supabase/client";
import {
  assignShirazuOwners,
  createBlankPoems,
  normalizeRoomCode,
  playerColor,
  randomRoomCode,
  uid,
} from "@/lib/utils";
import {
  applyOnlineSubmit,
  applyShirazuRoundSubmit,
} from "@/lib/online/submit";
import {
  canSubmitShirazuUnit,
  poemMoraCount,
  SHIRAZU_MORA_PER_POEM,
  shirazuPoemForSeat,
} from "@/lib/shirazu";
import type { Player, TurnState, VerseMode } from "@/types/game";
import { isLineTurn, isShirazuTurn } from "@/types/game";
import {
  rowToPlayer,
  type OnlineRoomSnapshot,
  type RoomPlayerRow,
  type RoomRow,
} from "@/lib/online/types";

function asRoom(row: RoomRow): RoomRow {
  return {
    ...row,
    poems: Array.isArray(row.poems) ? row.poems : [],
    turn: row.turn ?? null,
  };
}

async function fetchPlayers(roomId: string): Promise<Player[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RoomPlayerRow[]).map(rowToPlayer);
}

export async function loadRoomSnapshot(
  roomId: string,
): Promise<OnlineRoomSnapshot> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  if (error) throw error;
  const players = await fetchPlayers(roomId);
  return { room: asRoom(data as RoomRow), players };
}

export async function createOnlineRoom(options: {
  playerId: string;
  nickname: string;
  mode: VerseMode;
  maxPlayers: number;
}): Promise<OnlineRoomSnapshot> {
  const supabase = getSupabase();
  let code = randomRoomCode();
  let room: RoomRow | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        code,
        mode: options.mode,
        max_players: options.maxPlayers,
        phase: "lobby",
        host_id: options.playerId,
        step_index: 0,
        poems: [],
        turn: null,
      })
      .select("*")
      .single();

    if (!error && data) {
      room = asRoom(data as RoomRow);
      break;
    }
    // unique violation → 別コードで再試行
    code = randomRoomCode();
  }

  if (!room) throw new Error("部屋を作れませんでした。もう一度試してください。");

  const { error: playerError } = await supabase.from("room_players").insert({
    room_id: room.id,
    player_id: options.playerId,
    name: options.nickname,
    color: playerColor(0),
    is_host: true,
    seat: 0,
    part_indexes: [],
  });
  if (playerError) throw playerError;

  return loadRoomSnapshot(room.id);
}

export async function joinOnlineRoom(options: {
  code: string;
  playerId: string;
  nickname: string;
}): Promise<OnlineRoomSnapshot> {
  const supabase = getSupabase();
  const code = normalizeRoomCode(options.code);

  const { data: roomData, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!roomData) throw new Error("そのルームコードの和室は見つかりません。");

  const room = asRoom(roomData as RoomRow);
  if (room.phase !== "lobby") {
    throw new Error("この和室はすでに開宴しています。");
  }

  const players = await fetchPlayers(room.id);
  const existing = players.find((p) => p.id === options.playerId);
  if (existing) {
    return { room, players };
  }
  if (players.length >= room.max_players) {
    throw new Error("この和室は定員です。");
  }

  const seat = players.length;
  const { error: insertError } = await supabase.from("room_players").insert({
    room_id: room.id,
    player_id: options.playerId,
    name: options.nickname,
    color: playerColor(seat),
    is_host: false,
    seat,
    part_indexes: [],
  });
  if (insertError) throw insertError;

  return loadRoomSnapshot(room.id);
}

export async function leaveOnlineRoom(options: {
  roomId: string;
  playerId: string;
  isHost: boolean;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("room_players")
    .delete()
    .eq("room_id", options.roomId)
    .eq("player_id", options.playerId);
  if (error) throw error;

  if (options.isHost) {
    await supabase.from("rooms").delete().eq("id", options.roomId);
  }
}

export async function startOnlineGame(options: {
  roomId: string;
  hostId: string;
}): Promise<OnlineRoomSnapshot> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  if (snapshot.room.host_id !== options.hostId) {
    throw new Error("亭主だけが開宴できます。");
  }
  if (snapshot.room.phase !== "lobby") {
    return snapshot;
  }
  if (snapshot.players.length < 2) {
    throw new Error("二人以上揃うまで開宴できません。");
  }

  const count = snapshot.players.length;
  const parts = assignPartIndexes(count, snapshot.room.mode);
  const supabase = getSupabase();

  for (let i = 0; i < snapshot.players.length; i += 1) {
    const player = snapshot.players[i];
    const { error } = await supabase
      .from("room_players")
      .update({ part_indexes: parts[i] ?? [], seat: i })
      .eq("room_id", options.roomId)
      .eq("player_id", player.id);
    if (error) throw error;
  }

  const roster = snapshot.players.map((p, i) => ({
    ...p,
    partIndexes: parts[i] ?? [],
  }));
  const blank = createBlankPoems(snapshot.room.mode, count, uid("poem"));
  const poems =
    snapshot.room.mode === "shirazu"
      ? assignShirazuOwners(blank, roster)
      : blank;
  const turn: TurnState =
    snapshot.room.mode === "shirazu"
      ? { kind: "shirazu", roundIndex: 0, submittedIds: [] }
      : {
          stepIndex: 0,
          writerId:
            (roster.find((p) => p.partIndexes.includes(0)) ?? roster[0]).id,
          draft: "",
          status: "idle",
        };

  const { error: roomError } = await supabase
    .from("rooms")
    .update({
      phase: "writing",
      step_index: 0,
      poems,
      turn,
      max_players: count,
    })
    .eq("id", options.roomId);
  if (roomError) throw roomError;

  return loadRoomSnapshot(options.roomId);
}

const SUBMIT_MAX_RETRIES = 8;

export async function submitOnlineTurn(options: {
  roomId: string;
  playerId: string;
  draft: string;
}): Promise<OnlineRoomSnapshot> {
  for (let attempt = 0; attempt < SUBMIT_MAX_RETRIES; attempt += 1) {
    const snapshot = await loadRoomSnapshot(options.roomId);
    const { room, players } = snapshot;
    if (room.phase !== "writing" || !room.turn) {
      throw new Error("いまは提出できません。");
    }

    if (isShirazuTurn(room.turn)) {
      const result = await trySubmitShirazu(snapshot, options);
      if (result === "retry") continue;
      return result;
    }

    if (!isLineTurn(room.turn)) {
      throw new Error("いまは提出できません。");
    }
    if (room.turn.writerId !== options.playerId) {
      throw new Error("あなたの番ではありません。");
    }

    const writer = players.find((p) => p.id === options.playerId);
    if (!writer) throw new Error("連衆情報が見つかりません。");

    const result = applyOnlineSubmit({
      poems: room.poems,
      stepIndex: room.turn.stepIndex,
      draft: options.draft,
      writer,
      playerCount: players.length,
      roster: players,
    });

    const turn: TurnState | null = result.done
      ? null
      : {
          stepIndex: result.nextStep,
          writerId: result.nextWriterId,
          draft: "",
          status: "idle",
        };

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("rooms")
      .update({
        phase: result.done ? "reveal" : "writing",
        step_index: result.done ? room.turn.stepIndex : result.nextStep,
        poems: result.poems,
        turn,
      })
      .eq("id", options.roomId)
      .eq("step_index", room.step_index)
      .select("id");
    if (error) throw error;
    if (!data?.length) continue;

    return loadRoomSnapshot(options.roomId);
  }

  throw new Error("提出が混み合っています。もう一度試してください。");
}

async function trySubmitShirazu(
  snapshot: OnlineRoomSnapshot,
  options: { roomId: string; playerId: string; draft: string },
): Promise<OnlineRoomSnapshot | "retry"> {
  const { room, players } = snapshot;
  if (!isShirazuTurn(room.turn)) {
    throw new Error("いまは提出できません。");
  }
  const turn = room.turn;

  // 既に提出済みなら成功扱いで最新を返す
  if (turn.submittedIds.includes(options.playerId)) {
    return snapshot;
  }

  const seat = players.findIndex((p) => p.id === options.playerId);
  if (seat < 0) throw new Error("連衆情報が見つかりません。");

  const poemIndex = shirazuPoemForSeat(
    seat,
    turn.roundIndex,
    players.length,
  );
  const hand = room.poems[poemIndex];
  const filled = hand ? poemMoraCount(hand) : 0;
  const remaining = SHIRAZU_MORA_PER_POEM - filled;
  if (remaining > 0 && !canSubmitShirazuUnit(options.draft, remaining)) {
    throw new Error("その一音は使えません。");
  }
  const applied = applyShirazuRoundSubmit({
    poems: room.poems,
    turn,
    poemIndex,
    draft: options.draft,
    playerId: options.playerId,
    playerCount: players.length,
  });

  // 楽観ロック用：毎回 step_index を進める（ラウンド番号は turn が本体）
  const nextStepIndex = room.step_index + 1;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rooms")
    .update({
      phase: applied.done ? "reveal" : "writing",
      step_index: nextStepIndex,
      poems: applied.poems,
      turn: applied.nextTurn,
    })
    .eq("id", options.roomId)
    .eq("step_index", room.step_index)
    .select("id");
  if (error) throw error;
  if (!data?.length) return "retry";

  return loadRoomSnapshot(options.roomId);
}

export async function resetRoomToLobby(options: {
  roomId: string;
  hostId: string;
}): Promise<OnlineRoomSnapshot> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  if (snapshot.room.host_id !== options.hostId) {
    throw new Error("亭主だけがもう一度開けます。");
  }

  const supabase = getSupabase();
  await supabase
    .from("room_players")
    .update({ part_indexes: [] })
    .eq("room_id", options.roomId);

  const { error } = await supabase
    .from("rooms")
    .update({
      phase: "lobby",
      step_index: 0,
      poems: [],
      turn: null,
    })
    .eq("id", options.roomId);
  if (error) throw error;

  return loadRoomSnapshot(options.roomId);
}

export type RoomSubscription = {
  unsubscribe: () => void;
};

export function subscribeOnlineRoom(
  roomId: string,
  onChange: (snapshot: OnlineRoomSnapshot) => void,
  onError?: (error: Error) => void,
): RoomSubscription {
  const supabase = getSupabase();
  let alive = true;

  const refresh = async () => {
    try {
      const snapshot = await loadRoomSnapshot(roomId);
      if (alive) onChange(snapshot);
    } catch (error) {
      if (alive) onError?.(error as Error);
    }
  };

  const channel = supabase
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      () => {
        void refresh();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_players",
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        void refresh();
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void refresh();
    });

  return {
    unsubscribe: () => {
      alive = false;
      void supabase.removeChannel(channel);
    },
  };
}
