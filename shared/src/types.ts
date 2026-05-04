// ============================================================
// Domain models (mirror DB schema)
// ============================================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  inviteCode?: string;
  isSearchable?: boolean;
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
  updatedAt?: string;
  status?: 'draft' | 'published';
  authorId?: string;
  playCount?: number;
  ratingCount?: number;
  averageDifficulty?: number | null;
  averageEnjoyment?: number | null;
}

export interface PuzzleStats {
  averageDifficulty: number | null;
  averageEnjoyment: number | null;
  playCount: number;
  ratingCount: number;
}

export type GameStatus = "waiting" | "active" | "complete" | "abandoned" | "expired";

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

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export interface GameInvite {
  id: string;
  gameId: string;
  inviterId: string;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
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

export interface SpectateRoomPayload {
  gameId: string;
}

// --- Server → Client ---

export interface RoomJoinedPayload {
  game: Game;
  participants: GameParticipant[];
  cells: GameCell[];
  cursors: Record<string, { row: number; col: number }>;
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
  rejoining: boolean;
}

export interface ParticipantLeftPayload {
  userId: string;
}

export interface GameCompletePayload {
  completedAt: string;
  stats: { userId: string; cellsFilled: number }[];
}

export interface GameAbandonedPayload {
  gameId: string;
}

export interface WordCompletePayload {
  cells: Array<{ row: number; col: number }>;
}

export interface SpectatorCountPayload {
  gameId: string;
  count: number;
}

export interface FriendRequestPayload {
  friendshipId: string;
  requesterId: string;
  requesterDisplayName: string;
}

export interface GameInvitePayload {
  inviteId: string;
  inviterId: string;
  inviterDisplayName: string;
  gameId: string;
  puzzleTitle: string;
}

// ============================================================
// Competitive mode — WebSocket event payloads
// ============================================================

// Server → Client

export interface MatchInvitePayload {
  matchId: string;
  challengerName: string;
  puzzleTitle: string;
  timeLimitSeconds: number;
}

export interface MatchStartedPayload {
  matchId: string;
  puzzle: Puzzle;
  opponentId: string;
  timeLimitSeconds: number;
  startsAt: string;
}

export interface MatchCellUpdatedPayload {
  matchId: string;
  userId: string;
  row: number;
  col: number;
  filled: boolean;
}

export interface MatchCompletedPayload {
  matchId: string;
  winnerId: string | null;
  reason: 'completed' | 'timeout';
  challengerCells: number;
  opponentCells: number;
}

export interface MatchCancelledPayload {
  matchId: string;
}

// Client → Server

export interface MatchFillCellPayload {
  matchId: string;
  row: number;
  col: number;
  value: string;
}

export interface MatchAcceptPayload {
  matchId: string;
}

export interface MatchDeclinePayload {
  matchId: string;
}

/** Union map of all WS event names to their payload types */
export interface ClientToServerEvents {
  join_room: (payload: JoinRoomPayload) => void;
  spectate_room: (payload: SpectateRoomPayload) => void;
  fill_cell: (payload: FillCellPayload) => void;
  move_cursor: (payload: MoveCursorPayload) => void;
  leave_room: (payload: LeaveRoomPayload) => void;
  match_fill_cell: (payload: MatchFillCellPayload) => void;
  match_accept: (payload: MatchAcceptPayload) => void;
  match_decline: (payload: MatchDeclinePayload) => void;
}

export interface ServerToClientEvents {
  room_joined: (payload: RoomJoinedPayload) => void;
  cell_updated: (payload: CellUpdatedPayload) => void;
  cursor_moved: (payload: CursorMovedPayload) => void;
  participant_joined: (payload: ParticipantJoinedPayload) => void;
  participant_left: (payload: ParticipantLeftPayload) => void;
  game_complete: (payload: GameCompletePayload) => void;
  game_abandoned: (payload: GameAbandonedPayload) => void;
  word_complete: (payload: WordCompletePayload) => void;
  spectator_count: (payload: SpectatorCountPayload) => void;
  friend_request: (payload: FriendRequestPayload) => void;
  game_invite: (payload: GameInvitePayload) => void;
  match_invite: (payload: MatchInvitePayload) => void;
  match_started: (payload: MatchStartedPayload) => void;
  match_cell_updated: (payload: MatchCellUpdatedPayload) => void;
  match_completed: (payload: MatchCompletedPayload) => void;
  match_cancelled: (payload: MatchCancelledPayload) => void;
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

// GET /api/users/me
export interface GetMeResponse {
  user: User;
}

// PATCH /api/users/me/privacy
export interface UpdatePrivacyRequest {
  isSearchable: boolean;
}
export interface UpdatePrivacyResponse {
  success: boolean;
  isSearchable: boolean;
}

// POST /api/friends/request-by-code
export interface FriendRequestByCodeRequest {
  inviteCode: string;
}

// GET /api/puzzles
export interface ListPuzzlesResponse {
  puzzles: Puzzle[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

// GET /api/games/:id/history
export interface GameMove {
  id: string;
  gameId: string;
  userId: string;
  row: number;
  col: number;
  value: string;
  createdAt: string;
}

export interface GetGameHistoryResponse {
  moves: GameMove[];
  hasFull: boolean;
}

// GET /api/puzzles/:id/stats
export interface GetPuzzleStatsResponse {
  stats: PuzzleStats;
  userRating: { difficulty: number; enjoyment: number } | null;
}

// POST /api/puzzles/:id/rate
export interface RatePuzzleRequest {
  difficulty: number;
  enjoyment: number;
}
export interface RatePuzzleResponse {
  stats: PuzzleStats;
}

// GET /api/users/:userId/stats
export interface ProfileStats {
  gamesPlayed: number;
  gamesCompleted: number;
  averageCompletionTimeSeconds: number | null;
}

export interface ProfileFriend {
  userId: string;
  displayName: string;
}

export interface GetUserStatsResponse {
  user: {
    id: string;
    displayName: string;
  };
  stats: ProfileStats;
  friends: ProfileFriend[];
  isPrivate: boolean;
  viewerIsFriend: boolean;
}

// ============================================================
// Competitive mode — REST shapes
// ============================================================

export interface CompetitiveMatch {
  id: string;
  challengerId: string;
  opponentId: string;
  puzzleId: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'timed_out';
  timeLimitSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  winnerId: string | null;
  createdAt: string;
  puzzleTitle: string;
  challengerName: string;
  opponentName: string;
}

/** Opponent cell: value omitted — only filled/unfilled visible */
export interface OpponentCell {
  row: number;
  col: number;
}

export interface OwnCell {
  row: number;
  col: number;
  value: string;
}

// POST /api/competitive/challenge
export interface ChallengeRequest {
  opponentId: string;
  puzzleId: string;
  timeLimitSeconds?: number;
}
export interface ChallengeResponse {
  matchId: string;
}

// GET /api/competitive/matches
export interface ListMatchesResponse {
  matches: CompetitiveMatch[];
}

// GET /api/competitive/matches/:matchId
export interface GetMatchResponse {
  match: CompetitiveMatch;
  puzzle: Puzzle;
  ownCells: OwnCell[];
  opponentCells: OpponentCell[];
}
