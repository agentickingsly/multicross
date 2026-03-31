/**
 * Typed REST API client stubs.
 * All methods return mock data until Session 2 implements real endpoints.
 */
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  ListPuzzlesResponse,
  GetPuzzleResponse,
  CreateGameRequest,
  CreateGameResponse,
  JoinGameRequest,
  JoinGameResponse,
  GetGameResponse,
} from "@multicross/shared";

const BASE = "/api";

async function post<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<TResponse>;
}

async function get<TResponse>(path: string): Promise<TResponse> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<TResponse>;
}

export const api = {
  auth: {
    register: (body: RegisterRequest) =>
      post<RegisterRequest, RegisterResponse>("/auth/register", body),
    login: (body: LoginRequest) =>
      post<LoginRequest, LoginResponse>("/auth/login", body),
  },
  puzzles: {
    list: () => get<ListPuzzlesResponse>("/puzzles"),
    get: (id: string) => get<GetPuzzleResponse>(`/puzzles/${id}`),
  },
  games: {
    create: (body: CreateGameRequest) =>
      post<CreateGameRequest, CreateGameResponse>("/games", body),
    join: (id: string, body: JoinGameRequest) =>
      post<JoinGameRequest, JoinGameResponse>(`/games/${id}/join`, body),
    get: (id: string) => get<GetGameResponse>(`/games/${id}`),
  },
};
