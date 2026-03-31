/**
 * Mock API client — returns realistic fake data.
 * Session 2 will replace these stubs with real fetch calls.
 */
import type {
  User,
  Puzzle,
  Game,
  GameParticipant,
  GameCell,
  RegisterResponse,
  LoginResponse,
  ListPuzzlesResponse,
  GetPuzzleResponse,
  CreateGameResponse,
  JoinGameResponse,
  GetGameResponse,
} from "@multicross/shared";

// ─── Mock puzzle data ─────────────────────────────────────────────────────────

const MOCK_PUZZLES: Puzzle[] = [
  {
    id: "puzzle-1",
    title: "Mini Classic",
    author: "Multicross",
    width: 5,
    height: 5,
    // prettier-ignore
    grid: [
      ["C", "A", "T", null, "D"],
      ["A", null, "O", null, "O"],
      ["R", "A", "N", "G", "E"],
      ["D", null, "E", null, "R"],
      [null, "A", "R", "T", null],
    ],
    clues: {
      across: {
        1: "Feline pet",
        4: "Vast open land",
        5: "Creative pursuit",
      },
      down: {
        1: "Business ___",
        2: "Printer cartridge",
        3: "One who takes action",
      },
    },
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "puzzle-2",
    title: "Quick Bite",
    author: "Multicross",
    width: 5,
    height: 5,
    // prettier-ignore
    grid: [
      ["B", "A", "S", "I", "C"],
      ["A", null, "T", null, "A"],
      ["T", "R", "A", "I", "N"],
      ["H", null, "Y", null, "E"],
      [null, "S", "A", "G", null],
    ],
    clues: {
      across: {
        1: "Elementary",
        4: "Rail transport",
        5: "Droop",
      },
      down: {
        1: "Soak tub",
        2: "Lingers",
        3: "Walking stick",
      },
    },
    createdAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "puzzle-3",
    title: "Word Play",
    author: "Multicross",
    width: 5,
    height: 5,
    // prettier-ignore
    grid: [
      ["S", "H", "A", "R", "P"],
      ["T", null, "C", null, "I"],
      ["A", "L", "E", "R", "T"],
      ["R", null, "S", null, "H"],
      [null, "B", "E", "T", null],
    ],
    clues: {
      across: {
        1: "Pointed, keen",
        4: "On the lookout",
        5: "Wager",
      },
      down: {
        1: "Celestial body",
        2: "Letter sequences",
        3: "Core essence",
      },
    },
    createdAt: "2026-01-03T00:00:00Z",
  },
];

// ─── Mock in-memory state ─────────────────────────────────────────────────────

interface MockGameEntry {
  game: Game;
  participants: GameParticipant[];
  cells: GameCell[];
}

const mockGames = new Map<string, MockGameEntry>();
const roomCodeIndex = new Map<string, string>(); // roomCode → gameId
let gameCounter = 1;

function makeDemoEntry(): MockGameEntry {
  return {
    game: {
      id: "game-demo",
      puzzleId: "puzzle-1",
      roomCode: "ABCD12",
      status: "active",
      createdBy: "user-demo",
      startedAt: "2026-03-31T10:00:00Z",
      completedAt: null,
      createdAt: "2026-03-31T09:55:00Z",
    },
    participants: [
      {
        id: "part-1",
        gameId: "game-demo",
        userId: "user-demo",
        joinedAt: "2026-03-31T10:00:00Z",
        color: "#2563eb",
      },
      {
        id: "part-2",
        gameId: "game-demo",
        userId: "user-ai",
        joinedAt: "2026-03-31T10:00:05Z",
        color: "#ef4444",
      },
    ],
    cells: [],
  };
}

// Seed the demo game
(function initStore() {
  const entry = makeDemoEntry();
  mockGames.set("game-demo", entry);
  roomCodeIndex.set("ABCD12", "game-demo");
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay<T>(value: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function randomRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getCurrentUser(): User {
  const raw = localStorage.getItem("multicross_user");
  if (raw) {
    try {
      return JSON.parse(raw) as User;
    } catch {
      /* fall through */
    }
  }
  return {
    id: "user-demo",
    email: "demo@example.com",
    displayName: "Demo Player",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function login(email: string, _password: string): Promise<LoginResponse> {
  const user: User = {
    id: `user-${Date.now()}`,
    email,
    displayName: email.split("@")[0],
    createdAt: new Date().toISOString(),
  };
  const token = btoa(JSON.stringify({ sub: user.id, email }));
  return delay({ user, token });
}

export function register(
  email: string,
  displayName: string,
  _password: string
): Promise<RegisterResponse> {
  const user: User = {
    id: `user-${Date.now()}`,
    email,
    displayName,
    createdAt: new Date().toISOString(),
  };
  const token = btoa(JSON.stringify({ sub: user.id, email }));
  return delay({ user, token });
}

// ─── Puzzles ──────────────────────────────────────────────────────────────────

export function getPuzzles(): Promise<ListPuzzlesResponse> {
  return delay({ puzzles: MOCK_PUZZLES });
}

export function getPuzzle(id: string): Promise<GetPuzzleResponse> {
  const puzzle = MOCK_PUZZLES.find((p) => p.id === id);
  if (!puzzle) return Promise.reject(new Error(`Puzzle ${id} not found`));
  return delay({ puzzle });
}

// ─── Games ───────────────────────────────────────────────────────────────────

export function getGame(gameId: string): Promise<GetGameResponse> {
  let entry = mockGames.get(gameId);
  if (!entry) {
    // Auto-create if missing (handles deep-link scenarios)
    entry = makeDemoEntry();
    entry.game.id = gameId;
    mockGames.set(gameId, entry);
  }
  const { game, participants, cells } = entry;
  return delay({ game, participants, cells });
}

export function createGame(puzzleId: string): Promise<CreateGameResponse & { roomCode: string }> {
  const currentUser = getCurrentUser();
  const gameId = `game-${gameCounter++}`;
  const roomCode = randomRoomCode();
  const game: Game = {
    id: gameId,
    puzzleId,
    roomCode,
    status: "active",
    createdBy: currentUser.id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  const participants: GameParticipant[] = [
    {
      id: `part-${Date.now()}`,
      gameId,
      userId: currentUser.id,
      joinedAt: new Date().toISOString(),
      color: "#2563eb",
    },
  ];
  mockGames.set(gameId, { game, participants, cells: [] });
  roomCodeIndex.set(roomCode, gameId);
  return delay({ game, roomCode });
}

export function joinGame(
  roomCodeOrGameId: string
): Promise<JoinGameResponse & { gameId: string }> {
  const currentUser = getCurrentUser();
  // Support both room code and game ID lookup
  const gameId = roomCodeIndex.get(roomCodeOrGameId.toUpperCase()) ?? roomCodeOrGameId;
  let entry = mockGames.get(gameId);
  if (!entry) {
    return Promise.reject(new Error(`Game not found: ${roomCodeOrGameId}`));
  }
  const participant: GameParticipant = {
    id: `part-${Date.now()}`,
    gameId,
    userId: currentUser.id,
    joinedAt: new Date().toISOString(),
    color: "#10b981",
  };
  // Add participant if not already present
  const alreadyIn = entry.participants.some((p) => p.userId === currentUser.id);
  if (!alreadyIn) {
    entry.participants.push(participant);
  }
  return delay({ game: entry.game, participant, gameId });
}

/** Look up gameId from a room code (for lobby join flow). */
export function findGameByRoomCode(roomCode: string): string | undefined {
  return roomCodeIndex.get(roomCode.toUpperCase());
}
