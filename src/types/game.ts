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

export type TurnState = LineTurnState | ShirazuTurnState;

export function isShirazuTurn(
  turn: TurnState | null | undefined,
): turn is ShirazuTurnState {
  return turn != null && "kind" in turn && turn.kind === "shirazu";
}

export function isLineTurn(
  turn: TurnState | null | undefined,
): turn is LineTurnState {
  return turn != null && !isShirazuTurn(turn);
}

export interface ModeConfig {
  mode: VerseMode;
  playerCount: number;
}
