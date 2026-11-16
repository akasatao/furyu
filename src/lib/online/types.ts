import type { GamePhase, Poem, Player, TurnState, VerseMode } from "@/types/game";

export interface RoomRow {
  id: string;
  code: string;
  mode: VerseMode;
  max_players: number;
  phase: GamePhase;
  host_id: string;
  step_index: number;
  poems: Poem[];
  turn: TurnState | null;
  created_at: string;
}

export interface RoomPlayerRow {
  id: string;
  room_id: string;
  player_id: string;
  name: string;
  color: string;
  is_host: boolean;
  seat: number;
  part_indexes: number[];
  created_at: string;
}

export interface OnlineRoomSnapshot {
  room: RoomRow;
  players: Player[];
}

export function rowToPlayer(row: RoomPlayerRow): Player {
  return {
    id: row.player_id,
    name: row.name,
    isBot: false,
    isHost: row.is_host,
    color: row.color,
    partIndexes: row.part_indexes ?? [],
  };
}
