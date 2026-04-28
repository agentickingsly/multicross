import type {
  LoginResponse,
  RegisterResponse,
  ListPuzzlesResponse,
  GetPuzzleResponse,
  CreateGameResponse,
  GetGameResponse,
  GetGameHistoryResponse,
  GetPuzzleStatsResponse,
  RatePuzzleResponse,
} from "@multicross/shared";

const BASE_URL = `${import.meta.env.VITE_API_URL}/api`;

function getToken(): string {
  return localStorage.getItem("multicross_token") ?? "";
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (!skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (!skipAuth) {
      localStorage.removeItem("multicross_token");
      localStorage.removeItem("multicross_user");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    true
  );
}

export function register(
  email: string,
  displayName: string,
  password: string,
  inviteCode: string
): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>(
    "/auth/register",
    { method: "POST", body: JSON.stringify({ email, displayName, password, inviteCode }) },
    true
  );
}

// ─── Puzzles ──────────────────────────────────────────────────────────────────

export type PuzzleSortOption = "newest" | "most_played" | "most_difficult" | "most_enjoyable";

export function getPuzzles(params: { page?: number; limit?: number; sort?: PuzzleSortOption } = {}): Promise<ListPuzzlesResponse> {
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.sort !== undefined) q.set("sort", params.sort);
  const qs = q.toString();
  return apiFetch<ListPuzzlesResponse>(`/puzzles${qs ? `?${qs}` : ""}`);
}

export function getPuzzle(id: string): Promise<GetPuzzleResponse> {
  return apiFetch<GetPuzzleResponse>(`/puzzles/${id}`);
}

export function getMyPuzzles(params: { page?: number; limit?: number } = {}): Promise<ListPuzzlesResponse> {
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<ListPuzzlesResponse>(`/puzzles/mine${qs ? `?${qs}` : ""}`);
}

interface PuzzlePayload {
  title: string;
  author: string;
  width: number;
  height: number;
  grid: (string | null)[][];
  clues: { across: Record<string, string>; down: Record<string, string> };
  status: "draft" | "published";
}

export function createPuzzle(data: PuzzlePayload): Promise<GetPuzzleResponse> {
  return apiFetch<GetPuzzleResponse>("/puzzles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updatePuzzle(id: string, data: PuzzlePayload): Promise<GetPuzzleResponse> {
  return apiFetch<GetPuzzleResponse>(`/puzzles/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deletePuzzle(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/puzzles/${id}`, { method: "DELETE" });
}

// ─── Games ────────────────────────────────────────────────────────────────────

export interface ActiveGame {
  id: string;
  roomCode: string;
  status: "waiting" | "active";
  createdAt: string;
  puzzleTitle: string;
  participantCount: number;
}

export function getMyActiveGames(): Promise<{ games: ActiveGame[] }> {
  return apiFetch<{ games: ActiveGame[] }>("/games/my-active");
}

export function getGame(gameId: string): Promise<GetGameResponse> {
  return apiFetch<GetGameResponse>(`/games/${gameId}`);
}

export function abandonGame(gameId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/games/${gameId}/abandon`, { method: "PATCH" });
}

export function getGameHistory(gameId: string): Promise<GetGameHistoryResponse> {
  return apiFetch<GetGameHistoryResponse>(`/games/${gameId}/history`);
}

export function createGame(puzzleId: string): Promise<CreateGameResponse & { roomCode: string }> {
  return apiFetch<CreateGameResponse & { roomCode: string }>(
    "/games",
    { method: "POST", body: JSON.stringify({ puzzleId }) }
  );
}

/**
 * Join a game by room code.
 *
 * NOTE: The server does not expose GET /api/games?roomCode=X, so this flow is
 * blocked until that endpoint is added to server/src/routes/games.ts.
 * See /client/DONE.md for details.
 */
export async function joinGameByCode(roomCode: string): Promise<{ gameId: string }> {
  // Step 1: look up the game ID from the room code
  const { game } = await apiFetch<{ game: { id: string } }>(
    `/games?roomCode=${encodeURIComponent(roomCode)}`
  );

  // Step 2: join the game
  await apiFetch(`/games/${game.id}/join`, { method: "POST", body: JSON.stringify({}) });

  return { gameId: game.id };
}

/** Alias kept for internal backward-compat; prefer joinGameByCode. */
export const joinGame = joinGameByCode;

// ─── Puzzle ratings ───────────────────────────────────────────────────────────

export function getPuzzleStats(puzzleId: string): Promise<GetPuzzleStatsResponse> {
  return apiFetch<GetPuzzleStatsResponse>(`/puzzles/${puzzleId}/stats`);
}

export function ratePuzzle(
  puzzleId: string,
  difficulty: number,
  enjoyment: number
): Promise<RatePuzzleResponse> {
  return apiFetch<RatePuzzleResponse>(`/puzzles/${puzzleId}/rate`, {
    method: "POST",
    body: JSON.stringify({ difficulty, enjoyment }),
  });
}
