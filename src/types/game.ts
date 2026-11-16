export type GamePhase = "home" | "lobby" | "writing" | "reveal";

/** 俳句=3句 / 短歌=5句 / 詠み人知らず=一文字リレーで人数分の俳句 */
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

export interface TurnState {
  stepIndex: number;
  writerId: string;
  draft: string;
  status: PlayerStatus;
}

export interface ModeConfig {
  mode: VerseMode;
  playerCount: number;
}
