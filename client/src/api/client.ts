import type {
  LoginResponse,
  RegisterResponse,
  ListPuzzlesResponse,
  GetPuzzleResponse,
  CreateGameResponse,
  GetGameResponse,
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
  password: string
): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>(
    "/auth/register",
    { method: "POST", body: JSON.stringify({ email, displayName, password }) },
    true
  );
}

// ─── Puzzles ──────────────────────────────────────────────────────────────────

export function getPuzzles(): Promise<ListPuzzlesResponse> {
  return apiFetch<ListPuzzlesResponse>("/puzzles");
}

export function getPuzzle(id: string): Promise<GetPuzzleResponse> {
  return apiFetch<GetPuzzleResponse>(`/puzzles/${id}`);
}

// ─── Games ────────────────────────────────────────────────────────────────────

export function getGame(gameId: string): Promise<GetGameResponse> {
  return apiFetch<GetGameResponse>(`/games/${gameId}`);
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
