"use client";

import { assignPartIndexes, writerForStep } from "@/lib/roles";
import { getSupabase } from "@/lib/supabase/client";
import {
  assignShirazuOwners,
  createBlankPoems,
  playerColor,
  randomRoomCode,
  uid,
} from "@/lib/utils";
import {
  applyOnlineSubmit,
  applyShirazuRoundSubmit,
  settleShirazuRound,
} from "@/lib/online/submit";
import {
  canSubmitShirazuUnit,
  poemMoraCount,
  SHIRAZU_MORA_PER_POEM,
  shirazuPoemForSeat,
  shirazuSeatOf,
} from "@/lib/shirazu";
import { THEME_MAX_LENGTH } from "@/lib/constants";
import type { Player, TurnState, VerseMode } from "@/types/game";
import { isLineTurn, isShirazuRevealTurn, isShirazuTurn } from "@/types/game";
import {
  rowToPlayer,
  type OnlineRoomSnapshot,
  type OpenRoomSummary,
  type RoomPlayerRow,
  type RoomRow,
} from "@/lib/online/types";

function asRoom(row: RoomRow): RoomRow {
  return {
    ...row,
    poems: Array.isArray(row.poems) ? row.poems : [],
    turn: row.turn ?? null,
    theme: typeof row.theme === "string" ? row.theme : "",
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
  theme?: string;
}): Promise<OnlineRoomSnapshot> {
  const supabase = getSupabase();
  let code = randomRoomCode();
  let room: RoomRow | null = null;
  const theme = (options.theme ?? "").trim().slice(0, THEME_MAX_LENGTH);

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
        theme,
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

/** 放置された部屋を一覧に出さないための上限 */
const OPEN_ROOM_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type OpenRoomRow = Pick<
  RoomRow,
  "id" | "mode" | "max_players" | "theme" | "created_at"
> & {
  room_players: Pick<RoomPlayerRow, "name" | "is_host">[] | null;
};

export async function listOpenRooms(): Promise<OpenRoomSummary[]> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - OPEN_ROOM_MAX_AGE_MS).toISOString();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, mode, max_players, theme, created_at, room_players(name, is_host)")
    .eq("phase", "lobby")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as OpenRoomRow[])
    .map((row) => {
      const members = row.room_players ?? [];
      const host = members.find((p) => p.is_host);
      return {
        id: row.id,
        mode: row.mode,
        theme: typeof row.theme === "string" ? row.theme : "",
        hostName: host?.name ?? "",
        playerCount: members.length,
        maxPlayers: row.max_players,
        createdAt: row.created_at,
      };
    })
    .filter(
      (room) =>
        room.hostName !== "" &&
        room.playerCount > 0 &&
        room.playerCount < room.maxPlayers,
    );
}

export function subscribeOpenRooms(
  onChange: (rooms: OpenRoomSummary[]) => void,
  onError?: (error: Error) => void,
): RoomSubscription {
  const supabase = getSupabase();
  let alive = true;

  const refresh = async () => {
    try {
      const rooms = await listOpenRooms();
      if (alive) onChange(rooms);
    } catch (error) {
      if (alive) onError?.(error as Error);
    }
  };

  const channel = supabase
    .channel(`open-rooms-${uid("ch")}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms" },
      () => {
        void refresh();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players" },
      () => {
        void refresh();
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void refresh();
    });

  void refresh();

  return {
    unsubscribe: () => {
      alive = false;
      void supabase.removeChannel(channel);
    },
  };
}

export async function joinOnlineRoom(options: {
  roomId: string;
  playerId: string;
  nickname: string;
}): Promise<OnlineRoomSnapshot> {
  const supabase = getSupabase();

  const { data: roomData, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", options.roomId)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!roomData) throw new Error("その和室はもう閉じられています。");

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
  let phase: string | null = null;
  let remainingGuests = 0;
  try {
    const snapshot = await loadRoomSnapshot(options.roomId);
    phase = snapshot.room.phase;
    remainingGuests = snapshot.players.filter(
      (p) => p.id !== options.playerId,
    ).length;
  } catch {
    // 部屋が既に無い場合はそのまま退出扱い
  }

  if (phase === "writing" && !options.isHost) {
    await removePlayerMidGame(options.roomId, options.playerId);
  } else {
    await deletePlayerRow(options.roomId, options.playerId);
  }

  // 披露中に他連衆が残る場合は部屋を残す（結果閲覧のため）。執筆中は閉じる
  const keepForGuests =
    options.isHost && remainingGuests > 0 && phase === "reveal";
  if (options.isHost && !keepForGuests) {
    await supabase.from("rooms").delete().eq("id", options.roomId);
  }
}

async function deletePlayerRow(roomId: string, playerId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("player_id", playerId);
  if (error) throw error;
}

/** 抜ける人の残りの句を、残る連衆に座席順で振り直す（俳句・短歌） */
async function reassignLineParts(
  snapshot: OnlineRoomSnapshot,
  targetId: string,
) {
  const { room, players } = snapshot;
  if (!isLineTurn(room.turn)) return;
  const target = players.find((p) => p.id === targetId);
  const remaining = players.filter((p) => p.id !== targetId);
  if (!target || remaining.length === 0) return;

  const stepIndex = room.turn.stepIndex;
  const moving = target.partIndexes
    .filter((i) => i >= stepIndex)
    .sort((a, b) => a - b);
  if (moving.length === 0) return;

  const nextParts = remaining.map((p) => [...p.partIndexes]);
  moving.forEach((partIndex, k) => {
    nextParts[k % remaining.length].push(partIndex);
  });

  const supabase = getSupabase();
  for (let i = 0; i < remaining.length; i += 1) {
    const parts = nextParts[i].sort((a, b) => a - b);
    if (parts.length === remaining[i].partIndexes.length) continue;
    const { error } = await supabase
      .from("room_players")
      .update({ part_indexes: parts })
      .eq("room_id", room.id)
      .eq("player_id", remaining[i].id);
    if (error) throw error;
  }
}

/** 抜けた人がいても進行が止まらないよう、手番を整える */
async function repairTurnAfterLeave(roomId: string) {
  const supabase = getSupabase();
  for (let attempt = 0; attempt < SUBMIT_MAX_RETRIES; attempt += 1) {
    const { room, players } = await loadRoomSnapshot(roomId);
    if (room.phase !== "writing" || players.length === 0) return;

    if (isLineTurn(room.turn)) {
      const turn = room.turn;
      if (players.some((p) => p.id === turn.writerId)) return;
      let writerId = players[0].id;
      try {
        writerId = writerForStep(players, turn.stepIndex).id;
      } catch {
        // 担当が見つからなければ先頭の連衆に任せる
      }
      const { data, error } = await supabase
        .from("rooms")
        .update({ turn: { ...turn, writerId, draft: "", status: "idle" } })
        .eq("id", roomId)
        .eq("step_index", room.step_index)
        .select("id");
      if (error) throw error;
      if (data?.length) return;
      continue;
    }

    if (isShirazuTurn(room.turn)) {
      const presentIds = new Set(players.map((p) => p.id));
      const submittedIds = room.turn.submittedIds.filter((id) =>
        presentIds.has(id),
      );
      const settled = settleShirazuRound(
        room.poems,
        { ...room.turn, submittedIds },
        players.length,
      );
      const unchanged =
        !settled.done &&
        isShirazuTurn(settled.nextTurn) &&
        settled.nextTurn.roundIndex === room.turn.roundIndex &&
        submittedIds.length === room.turn.submittedIds.length;
      if (unchanged) return;
      const { data, error } = await supabase
        .from("rooms")
        .update({
          phase: settled.done ? "reveal" : "writing",
          step_index: room.step_index + 1,
          turn: settled.nextTurn,
        })
        .eq("id", roomId)
        .eq("step_index", room.step_index)
        .select("id");
      if (error) throw error;
      if (data?.length) return;
      continue;
    }

    return;
  }
}

/** 執筆中に連衆が抜けたとき：担当を振り直してから行を消し、手番を整える */
async function removePlayerMidGame(roomId: string, targetId: string) {
  const snapshot = await loadRoomSnapshot(roomId);
  await reassignLineParts(snapshot, targetId);
  await deletePlayerRow(roomId, targetId);
  await repairTurnAfterLeave(roomId);
}

export async function kickOnlinePlayer(options: {
  roomId: string;
  hostId: string;
  targetId: string;
}): Promise<OnlineRoomSnapshot> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  if (snapshot.room.host_id !== options.hostId) {
    throw new Error("亭主だけが破門できます。");
  }
  if (options.targetId === options.hostId) {
    throw new Error("亭主は自分を破門できません。");
  }
  if (!snapshot.players.some((p) => p.id === options.targetId)) {
    return snapshot;
  }

  if (snapshot.room.phase === "lobby") {
    await deletePlayerRow(options.roomId, options.targetId);
  } else if (snapshot.room.phase === "writing") {
    await removePlayerMidGame(options.roomId, options.targetId);
  } else {
    throw new Error("披露中は破門できません。");
  }

  return loadRoomSnapshot(options.roomId);
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
  // 途中で抜けた人の提出は数えない
  const presentIds = new Set(players.map((p) => p.id));
  const turn = {
    ...room.turn,
    submittedIds: room.turn.submittedIds.filter((id) => presentIds.has(id)),
  };

  // 既に提出済みなら成功扱いで最新を返す
  if (turn.submittedIds.includes(options.playerId)) {
    return snapshot;
  }

  const seat = shirazuSeatOf(players, options.playerId);
  if (seat < 0) throw new Error("連衆情報が見つかりません。");

  const poemIndex = shirazuPoemForSeat(
    seat,
    turn.roundIndex,
    room.poems.length,
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

export async function advanceShirazuReveal(options: {
  roomId: string;
  hostId: string;
}): Promise<OnlineRoomSnapshot> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  if (snapshot.room.host_id !== options.hostId) {
    throw new Error("亭主だけが進められます。");
  }
  if (snapshot.room.phase !== "reveal") {
    throw new Error("いまは披露中ではありません。");
  }
  if (!isShirazuRevealTurn(snapshot.room.turn)) {
    throw new Error("リレーの披露進行が見つかりません。");
  }

  const poemCount = snapshot.room.poems.length;
  if (snapshot.room.turn.poemIndex >= poemCount) {
    return snapshot;
  }

  const nextIndex = snapshot.room.turn.poemIndex + 1;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rooms")
    .update({
      step_index: snapshot.room.step_index + 1,
      turn: { kind: "shirazu_reveal", poemIndex: nextIndex },
    })
    .eq("id", options.roomId)
    .eq("step_index", snapshot.room.step_index)
    .select("id");
  if (error) throw error;
  if (!data?.length) {
    return loadRoomSnapshot(options.roomId);
  }

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

const LEAVE_EVENT = "leave";

export function subscribeOnlineRoom(
  roomId: string,
  onChange: (snapshot: OnlineRoomSnapshot) => void,
  onError?: (error: Error) => void,
  onLeaveSignal?: (playerId: string) => void,
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
    .on("broadcast", { event: LEAVE_EVENT }, ({ payload }) => {
      const playerId = (payload as { playerId?: unknown } | undefined)
        ?.playerId;
      if (alive && typeof playerId === "string") onLeaveSignal?.(playerId);
    })
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

/**
 * リロード・タブを閉じる直前に、抜けることを他の連衆へ知らせる。
 * Realtime の WebSocket は pagehide で先に切断されるため、keepalive の REST で送る。
 */
export function sendLeaveOnUnload(roomId: string, playerId: string): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  void fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `room-${roomId}`,
          event: LEAVE_EVENT,
          payload: { playerId },
          private: false,
        },
      ],
    }),
  }).catch(() => {});
}

/** 早く入った順（亭主の引き継ぎ順） */
function byJoinOrder(a: Player, b: Player): number {
  return (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
}

/** 引き継ぎと後片付けを担当する連衆（亭主が抜けるなら次の亭主、それ以外は亭主） */
export function leaveProcessorId(
  players: Player[],
  leaverId: string,
): string | null {
  const leaver = players.find((p) => p.id === leaverId);
  if (!leaver) return null;
  const others = players.filter((p) => p.id !== leaverId);
  if (leaver.isHost) return [...others].sort(byJoinOrder)[0]?.id ?? null;
  return others.find((p) => p.isHost)?.id ?? null;
}

/**
 * リロード・タブを閉じて抜けた連衆の後片付け。
 * 亭主だった場合は、早く入った順で次の連衆を亭主にしてから行を消す。
 */
export async function handOverAndRemove(options: {
  roomId: string;
  leaverId: string;
}): Promise<void> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  const leaver = snapshot.players.find((p) => p.id === options.leaverId);
  if (!leaver) return;
  const others = snapshot.players
    .filter((p) => p.id !== options.leaverId)
    .sort(byJoinOrder);

  const supabase = getSupabase();
  if (others.length === 0) {
    await supabase.from("rooms").delete().eq("id", options.roomId);
    return;
  }

  if (leaver.isHost) {
    const nextHost = others[0];
    // 亭主不在の瞬間を作らないよう、先に新しい亭主を立てる
    const { error: playerError } = await supabase
      .from("room_players")
      .update({ is_host: true })
      .eq("room_id", options.roomId)
      .eq("player_id", nextHost.id);
    if (playerError) throw playerError;
    const { error: roomError } = await supabase
      .from("rooms")
      .update({ host_id: nextHost.id })
      .eq("id", options.roomId);
    if (roomError) throw roomError;
  }

  if (snapshot.room.phase === "writing") {
    await removePlayerMidGame(options.roomId, options.leaverId);
  } else {
    await deletePlayerRow(options.roomId, options.leaverId);
  }
}

/** ページを閉じる途中でも届くよう keepalive で部屋を消す（最後の一人用） */
export function deleteRoomOnUnload(roomId: string): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  void fetch(`${url}/rest/v1/rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: "DELETE",
    keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => {});
}
