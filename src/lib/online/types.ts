import type {
  GamePhase,
  Poem,
  Player,
  ShirazuStyle,
  TurnState,
  VerseMode,
} from "@/types/game";

/** 連衆は進行に入る。観戦は席を持たず、人数にも数えない */
export type MemberRole = "player" | "spectator";

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
  /** お題。空文字＝なし */
  theme: string;
  /** リレー流派。俳句・短歌は strict */
  shirazu_style: ShirazuStyle;
  /** 俳句・短歌: 結果まで自分の句以外を隠す。未移行は false */
  kumo_gakure?: boolean;
  /** 次の一宴だけ、たまき等の完成で破門する */
  no_more_tmc: boolean;
  /** 超破門。この宴が終わるまで再参加できない */
  banned_player_ids?: string[];
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
  /** 未移行の行は player として扱う */
  role?: MemberRole;
  created_at: string;
}

/** 和室一覧に並べる部屋（待機・制作中・披露中） */
export interface OpenRoomSummary {
  id: string;
  mode: VerseMode;
  phase: "lobby" | "writing" | "reveal";
  theme: string;
  shirazuStyle: ShirazuStyle;
  /** 俳句・短歌の雲隠れ */
  kumoGakure: boolean;
  hostName: string;
  /** 連衆だけ。観戦は含まない */
  playerCount: number;
  maxPlayers: number;
  /** 待機中で、まだ空きがある */
  joinable: boolean;
  createdAt: string;
}

export interface OnlineRoomSnapshot {
  room: RoomRow;
  /** 連衆。進行・定員・手番はこちらだけ */
  players: Player[];
  /** 観戦。席は持たない */
  spectators: Player[];
}

export function rowToPlayer(row: RoomPlayerRow): Player {
  return {
    id: row.player_id,
    name: row.name,
    isBot: false,
    isHost: row.is_host,
    color: row.color,
    partIndexes: row.part_indexes ?? [],
    seat: row.seat,
    joinedAt: row.created_at,
  };
}
