import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../index";
import pool from "../db/pool";

const testEmail = () => `testuser+${randomUUID()}@test.multicross`;

let authToken: string;
let testPuzzleId: string;

beforeAll(async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName: "Games Test User", password: "testpassword123" });
  authToken = res.body.token;

  const result = await pool.query(
    `INSERT INTO puzzles (title, author, width, height, grid, clues)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     RETURNING id`,
    ["Test Puzzle", "Test Author", 5, 5, JSON.stringify([]), JSON.stringify({ across: [], down: [] })]
  );
  testPuzzleId = result.rows[0].id;
}, 15_000);

afterAll(async () => {
  if (testPuzzleId) {
    // Delete in FK-safe order before removing the puzzle
    await pool.query(
      "DELETE FROM game_cells WHERE game_id IN (SELECT id FROM games WHERE puzzle_id = $1)",
      [testPuzzleId]
    );
    await pool.query(
      "DELETE FROM game_participants WHERE game_id IN (SELECT id FROM games WHERE puzzle_id = $1)",
      [testPuzzleId]
    );
    await pool.query("DELETE FROM games WHERE puzzle_id = $1", [testPuzzleId]);
    await pool.query("DELETE FROM puzzles WHERE id = $1", [testPuzzleId]);
  }
});

describe("POST /api/games", () => {
  it("returns 201 with game and roomCode for authenticated user", async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ puzzleId: testPuzzleId });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("game");
    expect(res.body).toHaveProperty("roomCode");
    expect(res.body.roomCode).toHaveLength(6);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/games")
      .send({ puzzleId: testPuzzleId });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/games?roomCode=", () => {
  let roomCode: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ puzzleId: testPuzzleId });
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
  let gameId: string;
  let secondUserToken: string;

  beforeAll(async () => {
    const createRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ puzzleId: testPuzzleId });
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
    // Register owner and outsider
    const ownerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), displayName: "Active Games Owner", password: "testpassword123" });
    ownerToken = ownerRes.body.token;

    const outsiderRes = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), displayName: "Active Games Outsider", password: "testpassword123" });
    outsiderToken = outsiderRes.body.token;

    // Create an active game (stays in 'waiting' status)
    const activeRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ puzzleId: testPuzzleId });
    activeGameId = activeRes.body.game.id;

    // Create a game and mark it complete
    const completedRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ puzzleId: testPuzzleId });
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
    const creatorRes = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), displayName: "Abandon Creator", password: "testpassword123" });
    creatorToken = creatorRes.body.token;

    const nonCreatorRes = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), displayName: "Abandon Non-Creator", password: "testpassword123" });
    nonCreatorToken = nonCreatorRes.body.token;

    const createRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ puzzleId: testPuzzleId });
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
