export type GamePhase = "home" | "lobby" | "writing" | "reveal";

/** 俳句=3句 / 短歌=5句 / リレーで風流=短冊回し一音リレーで人数分の俳句 */
export type VerseMode = "haiku" | "tanka" | "shirazu";

export type PlayerStatus = "idle" | "typing" | "submitted";

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  color: string;
  /** 担当する行インデックス（0始まり） */
  partIndexes: number[];
  /** オンラインの座席。リレーでは途中で抜けても詰めない */
  seat?: number;
  /** 和室に入った時刻（亭主の引き継ぎ順に使う） */
  joinedAt?: string;
}

export interface PoemLine {
  text: string;
  authorId: string;
  authorName: string;
}

export interface Poem {
  id: string;
  mode: VerseMode;
  lines: (PoemLine | null)[];
  /** リレー：最初の一音を書いた人（その短冊の主） */
  ownerId?: string;
  ownerName?: string;
}

/** 俳句・短歌：1人ずつ句を書く */
export interface LineTurnState {
  stepIndex: number;
  writerId: string;
  draft: string;
  status: PlayerStatus;
}

/** リレーで風流：全員同時に一音→短冊回し */
export interface ShirazuTurnState {
  kind: "shirazu";
  /** 0..16＝いま書く音の位置 */
  roundIndex: number;
  /** このラウンド提出済みの playerId */
  submittedIds: string[];
}

/** リレー披露：亭主が句送りする進行 */
export interface ShirazuRevealState {
  kind: "shirazu_reveal";
  /** -1＝披露前、0..n-1＝披露中の首、n＝gallery（一覧） */
  poemIndex: number;
}

export type TurnState = LineTurnState | ShirazuTurnState | ShirazuRevealState;

export function isShirazuTurn(
  turn: TurnState | null | undefined,
): turn is ShirazuTurnState {
  return turn != null && "kind" in turn && turn.kind === "shirazu";
}

export function isShirazuRevealTurn(
  turn: TurnState | null | undefined,
): turn is ShirazuRevealState {
  return turn != null && "kind" in turn && turn.kind === "shirazu_reveal";
}

export function isLineTurn(
  turn: TurnState | null | undefined,
): turn is LineTurnState {
  return (
    turn != null && !isShirazuTurn(turn) && !isShirazuRevealTurn(turn)
  );
}

export interface ModeConfig {
  mode: VerseMode;
  playerCount: number;
}
