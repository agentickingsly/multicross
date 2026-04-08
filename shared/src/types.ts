// ============================================================
// Domain models (mirror DB schema)
// ============================================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Puzzle {
  id: string;
  title: string;
  author: string;
  width: number;
  height: number;
  /** 2-D array of cell definitions: null = black cell, string = letter */
  grid: (string | null)[][];
  clues: {
    across: Record<number, string>;
    down: Record<number, string>;
  };
  createdAt: string;
}

export type GameStatus = "waiting" | "active" | "complete";

export interface Game {
  id: string;
  puzzleId: string;
  roomCode: string;
  status: GameStatus;
  createdBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface GameParticipant {
  id: string;
  gameId: string;
  userId: string;
  joinedAt: string;
  /** Hex colour string used for cursor display, e.g. "#ff5733" */
  color: string;
}

export interface GameCell {
  id: string;
  gameId: string;
  row: number;
  col: number;
  value: string;
  filledBy: string | null;
  filledAt: string | null;
}

// ============================================================
// WebSocket event payloads
// ============================================================

// --- Client → Server ---

export interface JoinRoomPayload {
  gameId: string;
  userId: string;
}

export interface FillCellPayload {
  gameId: string;
  row: number;
  col: number;
  value: string;
  userId: string;
}

export interface MoveCursorPayload {
  gameId: string;
  row: number;
  col: number;
  userId: string;
}

export interface LeaveRoomPayload {
  gameId: string;
  userId: string;
}

// --- Server → Client ---

export interface RoomJoinedPayload {
  game: Game;
  participants: GameParticipant[];
  cells: GameCell[];
}

export interface CellUpdatedPayload {
  row: number;
  col: number;
  value: string;
  filledBy: string;
  correct: boolean;
}

export interface CursorMovedPayload {
  userId: string;
  row: number;
  col: number;
  color: string;
}

export interface ParticipantJoinedPayload {
  participant: GameParticipant;
  displayName: string;
}

export interface ParticipantLeftPayload {
  userId: string;
}

export interface GameCompletePayload {
  completedAt: string;
  stats: { userId: string; cellsFilled: number }[];
}

/** Union map of all WS event names to their payload types */
export interface ClientToServerEvents {
  join_room: (payload: JoinRoomPayload) => void;
  fill_cell: (payload: FillCellPayload) => void;
  move_cursor: (payload: MoveCursorPayload) => void;
  leave_room: (payload: LeaveRoomPayload) => void;
}

export interface ServerToClientEvents {
  room_joined: (payload: RoomJoinedPayload) => void;
  cell_updated: (payload: CellUpdatedPayload) => void;
  cursor_moved: (payload: CursorMovedPayload) => void;
  participant_joined: (payload: ParticipantJoinedPayload) => void;
  participant_left: (payload: ParticipantLeftPayload) => void;
  game_complete: (payload: GameCompletePayload) => void;
}

// ============================================================
// REST request / response shapes
// ============================================================

// POST /api/auth/register
export interface RegisterRequest {
  email: string;
  displayName: string;
  password: string;
}
export interface RegisterResponse {
  user: User;
  token: string;
}

// POST /api/auth/login
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  user: User;
  token: string;
}

// GET /api/puzzles
export interface ListPuzzlesResponse {
  puzzles: Puzzle[];
}

// GET /api/puzzles/:id
export interface GetPuzzleResponse {
  puzzle: Puzzle;
}

// POST /api/games
export interface CreateGameRequest {
  puzzleId: string;
}
export interface CreateGameResponse {
  game: Game;
}

// POST /api/games/:id/join
export interface JoinGameRequest {
  userId: string;
}
export interface JoinGameResponse {
  game: Game;
  participant: GameParticipant;
}

// GET /api/games/:id
export interface GetGameResponse {
  game: Game;
  participants: GameParticipant[];
  cells: GameCell[];
}
