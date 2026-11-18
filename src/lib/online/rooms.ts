"use client";

import { assignPartIndexes, shufflePlayers, writerForStep } from "@/lib/roles";
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
  canSubmitFreeShirazuUnit,
  canSubmitShirazuUnit,
  poemMoraCount,
  SHIRAZU_MORA_PER_POEM,
  shirazuPoemForSeat,
  shirazuSeatOf,
} from "@/lib/shirazu";
import {
  modeAllowsSolo,
  PLAYER_COUNT_RANGE,
  THEME_MAX_LENGTH,
} from "@/lib/constants";
import { parseStampPayload, type StampPayload } from "@/lib/stamps";
import type { Player, ShirazuStyle, TurnState, VerseMode } from "@/types/game";
import { isLineTurn, isShirazuRevealTurn, isShirazuTurn } from "@/types/game";
import {
  rowToPlayer,
  type OnlineRoomSnapshot,
  type OpenRoomSummary,
  type RoomPlayerRow,
  type RoomRow,
} from "@/lib/online/types";

function normalizeShirazuStyle(value: unknown): ShirazuStyle {
  return value === "free" ? "free" : "strict";
}

function asRoom(row: RoomRow): RoomRow {
  return {
    ...row,
    poems: Array.isArray(row.poems) ? row.poems : [],
    turn: row.turn ?? null,
    theme: typeof row.theme === "string" ? row.theme : "",
    shirazu_style: normalizeShirazuStyle(row.shirazu_style),
  };
}

async function fetchMembers(roomId: string): Promise<{
  players: Player[];
  spectators: Player[];
}> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat", { ascending: true });
  if (error) throw error;
  const players: Player[] = [];
  const spectators: Player[] = [];
  for (const row of (data ?? []) as RoomPlayerRow[]) {
    const member = rowToPlayer(row);
    if (row.role === "spectator") spectators.push(member);
    else players.push(member);
  }
  return { players, spectators };
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
  const { players, spectators } = await fetchMembers(roomId);
  return { room: asRoom(data as RoomRow), players, spectators };
}

export async function createOnlineRoom(options: {
  playerId: string;
  nickname: string;
  mode: VerseMode;
  maxPlayers: number;
  theme?: string;
  shirazuStyle?: ShirazuStyle;
}): Promise<OnlineRoomSnapshot> {
  const supabase = getSupabase();
  let code = randomRoomCode();
  let room: RoomRow | null = null;
  const theme = (options.theme ?? "").trim().slice(0, THEME_MAX_LENGTH);
  const shirazuStyle =
    options.mode === "shirazu"
      ? normalizeShirazuStyle(options.shirazuStyle)
      : "strict";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = {
      code,
      mode: options.mode,
      max_players: options.maxPlayers,
      phase: "lobby" as const,
      host_id: options.playerId,
      step_index: 0,
      poems: [] as unknown[],
      turn: null,
      theme,
      shirazu_style: shirazuStyle,
    };
    let { data, error } = await supabase
      .from("rooms")
      .insert(payload)
      .select("*")
      .single();

    // 未マイグレーション DB 向け：カラム無しなら style 抜きで再試行
    if (error && isMissingColumn(error, "shirazu_style")) {
      const { shirazu_style: _omit, ...legacy } = payload;
      ({ data, error } = await supabase
        .from("rooms")
        .insert(legacy)
        .select("*")
        .single());
    }

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

/** 在室中に「まだいる」と書く間隔 */
export const ROOM_HEARTBEAT_MS = 15_000;
/** このあいだ更新がなければ、誰もいない部屋として消す */
const ROOM_STALE_MS = 90_000;
/** last_seen 列が無いときの保険（作成からこの時間で一覧から外す） */
const OPEN_ROOM_MAX_AGE_MS = 2 * 60 * 60 * 1000;

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

function isMissingColumn(error: unknown, column: string): boolean {
  const message = errorMessage(error);
  return (
    new RegExp(column, "i").test(message) &&
    /does not exist|schema cache/i.test(message)
  );
}

function isMissingRoleColumn(error: unknown): boolean {
  return isMissingColumn(error, "role");
}

/** 抜けた座席を詰めず、空いているいちばん小さい番号を返す */
function vacantPlayerSeat(players: Player[], maxPlayers: number): number {
  const taken = new Set(
    players
      .map((player) => player.seat)
      .filter((seat): seat is number => seat != null && seat >= 0),
  );
  const limit = Math.max(maxPlayers, players.length + 1);
  for (let seat = 0; seat < limit; seat += 1) {
    if (!taken.has(seat)) return seat;
  }
  return players.length;
}

function toOpenPhase(phase: string): OpenRoomSummary["phase"] {
  if (phase === "writing" || phase === "reveal") return phase;
  return "lobby";
}

type OpenRoomRow = Pick<
  RoomRow,
  | "id"
  | "mode"
  | "phase"
  | "max_players"
  | "theme"
  | "created_at"
> & {
  shirazu_style?: ShirazuStyle;
  room_players: Pick<RoomPlayerRow, "name" | "is_host" | "role">[] | null;
};

function summarizeOpenRooms(rows: OpenRoomRow[]): OpenRoomSummary[] {
  return rows
    .map((row) => {
      const members = row.room_players ?? [];
      const players = members.filter((p) => p.role !== "spectator");
      const host = players.find((p) => p.is_host);
      const phase = toOpenPhase(row.phase);
      const playerCount = players.length;
      return {
        id: row.id,
        mode: row.mode,
        phase,
        theme: typeof row.theme === "string" ? row.theme : "",
        shirazuStyle: normalizeShirazuStyle(row.shirazu_style),
        hostName: host?.name ?? "",
        playerCount,
        maxPlayers: row.max_players,
        joinable: phase !== "reveal" && playerCount < row.max_players,
        createdAt: row.created_at,
      };
    })
    .filter((room) => {
      if (room.hostName === "" || room.playerCount <= 0) return false;
      // 俳句・短歌のひとりで詠むは観戦にも入門にも出さない
      if (modeAllowsSolo(room.mode) && room.maxPlayers <= 1) return false;
      return true;
    });
}

async function selectOpenRooms(
  freshAfter: string,
  withRole: boolean,
): Promise<{ rows: OpenRoomRow[] } | { missingRole: true } | { missingLastSeen: true }> {
  const supabase = getSupabase();
  const players = withRole
    ? "room_players(name, is_host, role)"
    : "room_players(name, is_host)";
  const withStyle = `id, mode, phase, max_players, theme, shirazu_style, created_at, ${players}`;
  const withoutStyle = `id, mode, phase, max_players, theme, created_at, ${players}`;
  let { data, error } = await supabase
    .from("rooms")
    .select(withStyle)
    .in("phase", ["lobby", "writing", "reveal"])
    .gte("last_seen", freshAfter)
    .order("last_seen", { ascending: false });
  if (error && isMissingColumn(error, "shirazu_style")) {
    ({ data, error } = await supabase
      .from("rooms")
      .select(withoutStyle)
      .in("phase", ["lobby", "writing", "reveal"])
      .gte("last_seen", freshAfter)
      .order("last_seen", { ascending: false }));
  }
  if (!error) {
    return { rows: (data ?? []) as unknown as OpenRoomRow[] };
  }
  if (isMissingColumn(error, "last_seen")) return { missingLastSeen: true };
  if (withRole && isMissingRoleColumn(error)) return { missingRole: true };
  throw error;
}

/** last_seen がまだ無い DB 向け。作成から2時間で一覧から外す */
async function listOpenRoomsByAge(): Promise<OpenRoomSummary[]> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - OPEN_ROOM_MAX_AGE_MS).toISOString();
  const listed = await supabase
    .from("rooms")
    .select(
      "id, mode, phase, max_players, theme, shirazu_style, created_at, room_players(name, is_host, role)",
    )
    .in("phase", ["lobby", "writing", "reveal"])
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (!listed.error) {
    return summarizeAndDropEmpty(
      (listed.data ?? []) as unknown as OpenRoomRow[],
    );
  }
  if (isMissingColumn(listed.error, "shirazu_style")) {
    const noStyle = await supabase
      .from("rooms")
      .select(
        "id, mode, phase, max_players, theme, created_at, room_players(name, is_host, role)",
      )
      .in("phase", ["lobby", "writing", "reveal"])
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (!noStyle.error) {
      return summarizeAndDropEmpty(
        (noStyle.data ?? []) as unknown as OpenRoomRow[],
      );
    }
    if (!isMissingRoleColumn(noStyle.error)) throw noStyle.error;
  } else if (!isMissingRoleColumn(listed.error)) {
    throw listed.error;
  }

  const legacy = await supabase
    .from("rooms")
    .select(
      "id, mode, phase, max_players, theme, created_at, room_players(name, is_host)",
    )
    .in("phase", ["lobby", "writing", "reveal"])
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (legacy.error) throw legacy.error;
  return summarizeAndDropEmpty(
    (legacy.data ?? []) as unknown as OpenRoomRow[],
  );
}

/** 連衆が誰もいない部屋を消してから一覧にする */
async function summarizeAndDropEmpty(
  rows: OpenRoomRow[],
): Promise<OpenRoomSummary[]> {
  const emptyIds = rows
    .filter((row) => {
      const players = (row.room_players ?? []).filter(
        (p) => p.role !== "spectator",
      );
      return players.length === 0;
    })
    .map((row) => row.id);
  if (emptyIds.length > 0) {
    const supabase = getSupabase();
    await supabase.from("rooms").delete().in("id", emptyIds);
  }
  return summarizeOpenRooms(
    rows.filter((row) => !emptyIds.includes(row.id)),
  );
}

export async function listOpenRooms(): Promise<OpenRoomSummary[]> {
  const supabase = getSupabase();
  const freshAfter = new Date(Date.now() - ROOM_STALE_MS).toISOString();
  const removed = await supabase.from("rooms").delete().lt("last_seen", freshAfter);
  if (removed.error && isMissingColumn(removed.error, "last_seen")) {
    return listOpenRoomsByAge();
  }

  const listed = await selectOpenRooms(freshAfter, true);
  if ("missingLastSeen" in listed) return listOpenRoomsByAge();
  if ("rows" in listed) return summarizeAndDropEmpty(listed.rows);

  const legacy = await selectOpenRooms(freshAfter, false);
  if ("missingLastSeen" in legacy) return listOpenRoomsByAge();
  if ("rows" in legacy) return summarizeAndDropEmpty(legacy.rows);
  throw new Error("和室一覧を読み込めませんでした。");
}

/** 和室を開いているあいだ呼ぶ。更新が途切れた部屋は一覧から消える */
export async function touchRoom(roomId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("rooms")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", roomId);
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
  // 誰も更新しない部屋は変更イベントが来ないので、一覧を開いているあいだ自分で見にいく
  const timer = window.setInterval(() => {
    void refresh();
  }, ROOM_HEARTBEAT_MS);

  return {
    unsubscribe: () => {
      alive = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    },
  };
}

export async function joinOnlineRoom(options: {
  roomId: string;
  playerId: string;
  nickname: string;
  /** 一覧の「観戦する」。開宴後は指定がなくても観戦になる */
  asSpectator?: boolean;
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
  const current = await loadRoomSnapshot(room.id);
  const alreadyIn =
    current.players.some((p) => p.id === options.playerId) ||
    current.spectators.some((p) => p.id === options.playerId);
  if (alreadyIn) return current;

  const spectate = options.asSpectator || room.phase === "reveal";
  if (spectate && modeAllowsSolo(room.mode) && room.max_players <= 1) {
    throw new Error("ひとりで詠む和室は観戦できません。");
  }
  if (!spectate && current.players.length >= room.max_players) {
    throw new Error("この和室は定員です。");
  }

  const seat = spectate ? -1 : vacantPlayerSeat(current.players, room.max_players);
  const { error: insertError } = await supabase.from("room_players").insert({
    room_id: room.id,
    player_id: options.playerId,
    name: options.nickname,
    color: playerColor(seat < 0 ? current.spectators.length : seat),
    is_host: false,
    seat,
    part_indexes: [],
    ...(spectate ? { role: "spectator" } : {}),
  });
  if (insertError) {
    if (spectate && isMissingRoleColumn(insertError)) {
      throw new Error(
        "観戦の準備がまだです。Supabase で role 列を追加してください。",
      );
    }
    throw insertError;
  }

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
  let snapshot: OnlineRoomSnapshot | null = null;
  try {
    snapshot = await loadRoomSnapshot(options.roomId);
  } catch {
    // 部屋が既に無い場合はそのまま退出扱い
  }
  if (snapshot?.spectators.some((p) => p.id === options.playerId)) {
    await deletePlayerRow(options.roomId, options.playerId);
    return;
  }
  if (snapshot) {
    phase = snapshot.room.phase;
    remainingGuests = snapshot.players.filter(
      (p) => p.id !== options.playerId,
    ).length;
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
    await closeOnlineRoom(options.roomId);
  }
}

/** 観戦者にも届くよう知らせてから部屋を消す（絞り込み購読は DELETE を拾えないことがある） */
async function closeOnlineRoom(roomId: string): Promise<void> {
  await postRoomBroadcast(roomId, SYNC_EVENT, {});
  const supabase = getSupabase();
  await supabase.from("rooms").delete().eq("id", roomId);
}

async function deletePlayerRow(roomId: string, playerId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("player_id", playerId);
  if (error) throw error;
  // 絞り込み付きの購読には DELETE が届かないため、読み直しを明示的に知らせる
  await postRoomBroadcast(roomId, SYNC_EVENT, {});
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

  const target =
    snapshot.players.find((p) => p.id === options.targetId) ??
    snapshot.spectators.find((p) => p.id === options.targetId);
  if (!target) return snapshot;

  // 行を消す前に知らせる（自主退出の「筆を折りました」と区別する）
  await postRoomBroadcast(options.roomId, KICK_EVENT, {
    playerId: target.id,
    name: target.name,
  });

  const isSpectator = snapshot.spectators.some(
    (p) => p.id === options.targetId,
  );
  if (isSpectator) {
    // 観戦は進行に入っていないので、行を消すだけでよい
    await deletePlayerRow(options.roomId, options.targetId);
    return loadRoomSnapshot(options.roomId);
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

  // 俳句・短歌は入室順のまま上の句・中の句が固定しないよう、開宴のたびに並び替える
  const orderedPlayers =
    snapshot.room.mode === "shirazu"
      ? snapshot.players
      : shufflePlayers(snapshot.players);
  const count = orderedPlayers.length;
  const parts = assignPartIndexes(count, snapshot.room.mode);
  const supabase = getSupabase();

  for (let i = 0; i < orderedPlayers.length; i += 1) {
    const player = orderedPlayers[i];
    const { error } = await supabase
      .from("room_players")
      .update({ part_indexes: parts[i] ?? [], seat: i })
      .eq("room_id", options.roomId)
      .eq("player_id", player.id);
    if (error) throw error;
  }

  const roster = orderedPlayers.map((p, i) => ({
    ...p,
    partIndexes: parts[i] ?? [],
  }));
  const blank = createBlankPoems(
    snapshot.room.mode,
    count,
    uid("poem"),
    normalizeShirazuStyle(snapshot.room.shirazu_style),
  );
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
  const style = normalizeShirazuStyle(room.shirazu_style);
  if (remaining > 0) {
    const ok =
      style === "free"
        ? canSubmitFreeShirazuUnit(options.draft, remaining)
        : canSubmitShirazuUnit(options.draft, remaining);
    if (!ok) {
      throw new Error(
        style === "free" ? "空では提出できません。" : "その一音は使えません。",
      );
    }
  }
  const applied = applyShirazuRoundSubmit({
    poems: room.poems,
    turn,
    poemIndex,
    draft: options.draft,
    playerId: options.playerId,
    playerCount: players.length,
    style,
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

/** 披露の結果画面で、亭主が次のお題を考えているあいだだけ true */
export async function setHostPickingTheme(options: {
  roomId: string;
  hostId: string;
  picking: boolean;
}): Promise<void> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  if (snapshot.room.host_id !== options.hostId) {
    throw new Error("亭主だけがお題を選べます。");
  }
  if (snapshot.room.phase !== "reveal") return;

  const current = snapshot.room.turn;
  const turn = options.picking
    ? isShirazuRevealTurn(current)
      ? { ...current, pickingTheme: true }
      : { kind: "theme_pick" as const, pickingTheme: true as const }
    : isShirazuRevealTurn(current)
      ? { kind: "shirazu_reveal" as const, poemIndex: current.poemIndex }
      : null;

  const supabase = getSupabase();
  const { error } = await supabase
    .from("rooms")
    .update({ turn })
    .eq("id", options.roomId)
    .eq("host_id", options.hostId);
  if (error) throw error;
}

export async function resetRoomToLobby(options: {
  roomId: string;
  hostId: string;
  theme?: string;
  /** 指定したときだけモードを変える。無ければ今のモードのまま */
  mode?: VerseMode;
  shirazuStyle?: ShirazuStyle;
}): Promise<OnlineRoomSnapshot> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  if (snapshot.room.host_id !== options.hostId) {
    throw new Error("亭主だけがもう一度開けます。");
  }

  const theme = (options.theme ?? snapshot.room.theme ?? "")
    .trim()
    .slice(0, THEME_MAX_LENGTH);

  let mode = snapshot.room.mode;
  let shirazuStyle = normalizeShirazuStyle(snapshot.room.shirazu_style);
  if (options.mode) {
    const { min, max } = PLAYER_COUNT_RANGE[options.mode];
    const count = snapshot.players.length;
    if (count < min || count > max) {
      throw new Error("この人数ではそのモードを開けません。");
    }
    mode = options.mode;
    shirazuStyle =
      options.mode === "shirazu"
        ? normalizeShirazuStyle(options.shirazuStyle)
        : "strict";
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
      theme,
      mode,
      shirazu_style: shirazuStyle,
    })
    .eq("id", options.roomId);
  if (error) throw error;

  return loadRoomSnapshot(options.roomId);
}

export type RoomSubscription = {
  unsubscribe: () => void;
};

/** 和室の購読。披露スタンプも同じチャンネルで送る */
export type OnlineRoomSubscription = RoomSubscription & {
  sendStamp: (payload: StampPayload) => void;
};

const LEAVE_EVENT = "leave";
const SYNC_EVENT = "sync";
const KICK_EVENT = "kick";
const STAMP_EVENT = "stamp";

/** Realtime の broadcast を REST で送る（購読していなくても送れる） */
async function postRoomBroadcast(
  roomId: string,
  event: string,
  payload: Record<string, unknown>,
  keepalive = false,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      keepalive,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { topic: `room-${roomId}`, event, payload, private: false },
        ],
      }),
    });
  } catch {
    // 知らせが届かなくても、次の更新で読み直される
  }
}

export function subscribeOnlineRoom(
  roomId: string,
  onChange: (snapshot: OnlineRoomSnapshot) => void,
  onError?: (error: Error) => void,
  onLeaveSignal?: (playerId: string) => void,
  onKickSignal?: (playerId: string, name: string) => void,
  onStampSignal?: (payload: StampPayload) => void,
): OnlineRoomSubscription {
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
    .on("broadcast", { event: KICK_EVENT }, ({ payload }) => {
      const body = payload as
        | { playerId?: unknown; name?: unknown }
        | undefined;
      const playerId = body?.playerId;
      const name = body?.name;
      if (
        alive &&
        typeof playerId === "string" &&
        typeof name === "string" &&
        name.trim()
      ) {
        onKickSignal?.(playerId, name.trim());
      }
    })
    .on("broadcast", { event: SYNC_EVENT }, () => {
      void refresh();
    })
    .on("broadcast", { event: STAMP_EVENT }, ({ payload }) => {
      const stamp = parseStampPayload(payload);
      if (alive && stamp) onStampSignal?.(stamp);
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
    sendStamp: (payload) => {
      if (!alive) return;
      void channel.send({ type: "broadcast", event: STAMP_EVENT, payload });
    },
  };
}

/**
 * リロード・タブを閉じる直前に、抜けることを他の連衆へ知らせる。
 * Realtime の WebSocket は pagehide で先に切断されるため、keepalive の REST で送る。
 */
export function sendLeaveOnUnload(roomId: string, playerId: string): void {
  void postRoomBroadcast(roomId, LEAVE_EVENT, { playerId }, true);
}

function supabaseRestKey(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/** ページを閉じる途中でも届くよう keepalive で自分の在席行を消す */
function deletePlayerOnUnload(roomId: string, playerId: string): void {
  const rest = supabaseRestKey();
  if (!rest) return;
  void fetch(
    `${rest.url}/rest/v1/room_players?room_id=eq.${encodeURIComponent(roomId)}&player_id=eq.${encodeURIComponent(playerId)}`,
    {
      method: "DELETE",
      keepalive: true,
      headers: {
        apikey: rest.key,
        Authorization: `Bearer ${rest.key}`,
      },
    },
  ).catch(() => {});
}

/** ページを閉じる途中でも届くよう keepalive で次の亭主を立てる */
function promoteHostOnUnload(roomId: string, nextHostId: string): void {
  const rest = supabaseRestKey();
  if (!rest) return;
  const headers = {
    apikey: rest.key,
    Authorization: `Bearer ${rest.key}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  void fetch(
    `${rest.url}/rest/v1/room_players?room_id=eq.${encodeURIComponent(roomId)}&player_id=eq.${encodeURIComponent(nextHostId)}`,
    {
      method: "PATCH",
      keepalive: true,
      headers,
      body: JSON.stringify({ is_host: true }),
    },
  ).catch(() => {});
  void fetch(
    `${rest.url}/rest/v1/rooms?id=eq.${encodeURIComponent(roomId)}`,
    {
      method: "PATCH",
      keepalive: true,
      headers,
      body: JSON.stringify({ host_id: nextHostId }),
    },
  ).catch(() => {});
}

/** ページを閉じる途中でも届くよう keepalive で部屋を消す（最後の一人用） */
export function deleteRoomOnUnload(roomId: string): void {
  const rest = supabaseRestKey();
  if (!rest) return;
  void fetch(`${rest.url}/rest/v1/rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: "DELETE",
    keepalive: true,
    headers: {
      apikey: rest.key,
      Authorization: `Bearer ${rest.key}`,
    },
  }).catch(() => {});
}

/**
 * リロード・タブ閉じで抜けるときの一括処理。
 * 他の連衆が全員同時に落ちても行が残らないよう、自分の行はここで消す。
 */
export function leaveRoomOnUnload(options: {
  roomId: string;
  playerId: string;
  players: Player[];
  watching: boolean;
}): void {
  if (options.watching) {
    deletePlayerOnUnload(options.roomId, options.playerId);
    return;
  }

  const others = options.players.filter((p) => p.id !== options.playerId);
  if (others.length === 0) {
    deleteRoomOnUnload(options.roomId);
    return;
  }

  const me = options.players.find((p) => p.id === options.playerId);
  if (me?.isHost) {
    const nextHost = [...others].sort(byJoinOrder)[0];
    if (nextHost) promoteHostOnUnload(options.roomId, nextHost.id);
  }

  deletePlayerOnUnload(options.roomId, options.playerId);
  // 残っている連衆に担当の振り直しなどを任せる
  sendLeaveOnUnload(options.roomId, options.playerId);
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

async function promoteHost(
  roomId: string,
  nextHostId: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error: playerError } = await supabase
    .from("room_players")
    .update({ is_host: true })
    .eq("room_id", roomId)
    .eq("player_id", nextHostId);
  if (playerError) throw playerError;
  const { error: roomError } = await supabase
    .from("rooms")
    .update({ host_id: nextHostId })
    .eq("id", roomId);
  if (roomError) throw roomError;
}

/**
 * リロード・タブを閉じて抜けた連衆の後片付け。
 * 亭主だった場合は、早く入った順で次の連衆を亭主にしてから行を消す。
 * 本人が pagehide で先に行を消している場合も、亭主と手番だけ直す。
 */
export async function handOverAndRemove(options: {
  roomId: string;
  leaverId: string;
}): Promise<void> {
  const snapshot = await loadRoomSnapshot(options.roomId);
  const leaver = snapshot.players.find((p) => p.id === options.leaverId);
  const supabase = getSupabase();

  if (!leaver) {
    if (snapshot.spectators.some((p) => p.id === options.leaverId)) {
      await deletePlayerRow(options.roomId, options.leaverId);
      return;
    }
    // 本人の keepalive 削除が先に届いた場合
    if (snapshot.players.length === 0) {
      await closeOnlineRoom(options.roomId);
      return;
    }
    if (snapshot.room.host_id === options.leaverId) {
      const nextHost = [...snapshot.players].sort(byJoinOrder)[0];
      if (nextHost) await promoteHost(options.roomId, nextHost.id);
    }
    if (snapshot.room.phase === "writing") {
      await repairTurnAfterLeave(options.roomId);
    }
    return;
  }

  const others = snapshot.players
    .filter((p) => p.id !== options.leaverId)
    .sort(byJoinOrder);

  if (others.length === 0) {
    await closeOnlineRoom(options.roomId);
    return;
  }

  if (leaver.isHost) {
    await promoteHost(options.roomId, others[0].id);
  }

  if (snapshot.room.phase === "writing") {
    await removePlayerMidGame(options.roomId, options.leaverId);
  } else {
    await deletePlayerRow(options.roomId, options.leaverId);
  }
}
