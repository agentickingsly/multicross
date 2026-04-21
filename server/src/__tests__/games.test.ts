import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../index";
import pool from "../db/pool";

vi.mock("../db/redis", () => ({
  pub: { publish: vi.fn().mockResolvedValue(0) },
  deleteGameKeys: vi.fn().mockResolvedValue(undefined),
}));

const testEmail = () => `testuser+${randomUUID()}@test.multicross`;

async function purgeTestData() {
  await pool.query(`DELETE FROM game_cells WHERE game_id IN (SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM game_participants WHERE game_id IN (SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM games WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM puzzles WHERE author_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@test.multicross'`);
}

beforeAll(async () => {
  await purgeTestData();
}, 15_000);

// Never set — kept only so the afterAll guard below compiles unchanged
let testPuzzleId: string;

const validPuzzleBody = {
  title: "Test Puzzle",
  author: "Test Author",
  width: 5,
  height: 5,
  grid: Array(5).fill(Array(5).fill("")),
  clues: { across: { "1": "Across clue" }, down: { "1": "Down clue" } },
  status: "published",
};

async function registerUser(displayName = "Games Test User") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName, password: "testpassword123" });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: expected 201, got ${res.status}. Body: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createPuzzle(token: string) {
  const res = await request(app)
    .post("/api/puzzles")
    .set("Authorization", `Bearer ${token}`)
    .send(validPuzzleBody);
  if (res.status !== 201) {
    throw new Error(`createPuzzle failed: expected 201, got ${res.status}. Body: ${JSON.stringify(res.body)}`);
  }
  return res.body.puzzle as { id: string };
}
describe("POST /api/games", () => {
  let authToken: string;
  let puzzleId: string;

  beforeAll(async () => {
    ({ token: authToken } = await registerUser("Post Games User"));
    const puzzle = await createPuzzle(authToken);
    puzzleId = puzzle.id;
  });

  it("returns 201 with game and roomCode for authenticated user", async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ puzzleId });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("game");
    expect(res.body).toHaveProperty("roomCode");
    expect(res.body.roomCode).toHaveLength(6);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/games")
      .send({ puzzleId });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/games?roomCode=", () => {
  let authToken: string;
  let roomCode: string;

  beforeAll(async () => {
    ({ token: authToken } = await registerUser("Get Games User"));
    const puzzle = await createPuzzle(authToken);
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ puzzleId: puzzle.id });
    roomCode = res.body.roomCode;
  });

  it("returns 200 with game id for valid room code", async () => {
    const res = await request(app)
      .get(`/api/games?roomCode=${roomCode}`)
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.game).toHaveProperty("id");
  });

  it("returns 404 for unknown room code", async () => {
    const res = await request(app)
      .get("/api/games?roomCode=AAAAAA")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/games/:id/join", () => {
  let authToken: string;
  let gameId: string;
  let secondUserToken: string;

  beforeAll(async () => {
    ({ token: authToken } = await registerUser("Join Games Creator"));
    const puzzle = await createPuzzle(authToken);
    const createRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ puzzleId: puzzle.id });
    gameId = createRes.body.game.id;

    const regRes = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), displayName: "Second Player", password: "testpassword123" });
    secondUserToken = regRes.body.token;
  });

  it("returns 200 with participant for authenticated user joining a waiting game", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/join`)
      .set("Authorization", `Bearer ${secondUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("participant");
  });

  it("returns 200 with existing participant if user tries to rejoin same game", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/join`)
      .set("Authorization", `Bearer ${secondUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("participant");
  });
});

describe("GET /api/games/my-active", () => {
  let ownerToken: string;
  let outsiderToken: string;
  let activeGameId: string;
  let completedGameId: string;

  beforeAll(async () => {
    ({ token: ownerToken } = await registerUser("Active Games Owner"));
    ({ token: outsiderToken } = await registerUser("Active Games Outsider"));
    const puzzle = await createPuzzle(ownerToken);

    // Create an active game (stays in 'waiting' status)
    const activeRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ puzzleId: puzzle.id });
    activeGameId = activeRes.body.game.id;

    // Create a game and mark it complete
    const completedRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ puzzleId: puzzle.id });
    completedGameId = completedRes.body.game.id;
    await pool.query(
      `UPDATE games SET status = 'complete', completed_at = now() WHERE id = $1`,
      [completedGameId]
    );
  });

  it("returns 200 with correct shape", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("games");
    expect(Array.isArray(res.body.games)).toBe(true);
  });

  it("includes active games the user is part of", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${ownerToken}`);
    const ids = res.body.games.map((g: { id: string }) => g.id);
    expect(ids).toContain(activeGameId);
  });

  it("excludes completed games", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${ownerToken}`);
    const ids = res.body.games.map((g: { id: string }) => g.id);
    expect(ids).not.toContain(completedGameId);
  });

  it("excludes games the user never joined", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${outsiderToken}`);
    const ids = res.body.games.map((g: { id: string }) => g.id);
    expect(ids).not.toContain(activeGameId);
  });

  it("returns the expected fields on each game entry", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${ownerToken}`);
    const game = res.body.games.find((g: { id: string }) => g.id === activeGameId);
    expect(game).toBeDefined();
    expect(game).toHaveProperty("id");
    expect(game).toHaveProperty("roomCode");
    expect(game).toHaveProperty("status");
    expect(game).toHaveProperty("createdAt");
    expect(game).toHaveProperty("puzzleTitle");
    expect(game).toHaveProperty("participantCount");
    expect(typeof game.participantCount).toBe("number");
  });

  it("returns empty array for user with no active games", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.games).toHaveLength(0);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/games/my-active");
    expect(res.status).toBe(401);
  });

  it("does not include abandoned or expired games", async () => {
    // Mark the active game as abandoned
    await pool.query(`UPDATE games SET status = 'abandoned' WHERE id = $1`, [activeGameId]);

    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${ownerToken}`);
    const ids = res.body.games.map((g: { id: string }) => g.id);
    expect(ids).not.toContain(activeGameId);

    // Restore for other tests (won't affect cleanup)
    await pool.query(`UPDATE games SET status = 'waiting' WHERE id = $1`, [activeGameId]);
  });
});

describe("PATCH /api/games/:id/abandon", () => {
  let creatorToken: string;
  let nonCreatorToken: string;
  let gameId: string;

  beforeAll(async () => {
    ({ token: creatorToken } = await registerUser("Abandon Creator"));
    ({ token: nonCreatorToken } = await registerUser("Abandon Non-Creator"));
    const puzzle = await createPuzzle(creatorToken);

    const createRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ puzzleId: puzzle.id });
    gameId = createRes.body.game.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).patch(`/api/games/${gameId}/abandon`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when a non-creator tries to abandon", async () => {
    const res = await request(app)
      .patch(`/api/games/${gameId}/abandon`)
      .set("Authorization", `Bearer ${nonCreatorToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 200 and sets status to abandoned for the creator", async () => {
    const res = await request(app)
      .patch(`/api/games/${gameId}/abandon`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);

    const { rows } = await pool.query(`SELECT status FROM games WHERE id = $1`, [gameId]);
    expect(rows[0].status).toBe("abandoned");
  });

  it("returns 400 when trying to abandon an already-abandoned game", async () => {
    const res = await request(app)
      .patch(`/api/games/${gameId}/abandon`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 400 when game ID is not a valid UUID", async () => {
    const res = await request(app)
      .patch("/api/games/not-a-uuid/abandon")
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(400);
  });
});
