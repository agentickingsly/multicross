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
  await pool.query(`DELETE FROM game_moves WHERE game_id IN (SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM game_cells WHERE game_id IN (SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM game_participants WHERE game_id IN (SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM games WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM puzzles WHERE author_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@test.multicross'`);
}

beforeAll(async () => {
  await purgeTestData();
}, 15_000);

const validPuzzleBody = {
  title: "History Test Puzzle",
  author: "Test Author",
  width: 5,
  height: 5,
  grid: Array(5).fill(Array(5).fill("A")),
  clues: { across: { "1": "Across clue" }, down: { "1": "Down clue" } },
  status: "published",
};

async function registerUser(displayName = "History Test User") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName, password: "testpassword123" });
  if (res.status !== 201) throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createPuzzleAndGame(token: string) {
  const pRes = await request(app)
    .post("/api/puzzles")
    .set("Authorization", `Bearer ${token}`)
    .send(validPuzzleBody);
  if (pRes.status !== 201) throw new Error(`createPuzzle failed: ${pRes.status}`);
  const puzzleId = pRes.body.puzzle.id as string;

  const gRes = await request(app)
    .post("/api/games")
    .set("Authorization", `Bearer ${token}`)
    .send({ puzzleId });
  if (gRes.status !== 201) throw new Error(`createGame failed: ${gRes.status}`);
  return { gameId: gRes.body.game.id as string, puzzleId };
}

describe("GET /api/games/:id/history", () => {
  let ownerToken: string;
  let ownerId: string;
  let outsiderToken: string;
  let gameId: string;

  beforeAll(async () => {
    ({ token: ownerToken, userId: ownerId } = await registerUser("History Owner"));
    ({ token: outsiderToken } = await registerUser("History Outsider"));
    ({ gameId } = await createPuzzleAndGame(ownerToken));
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get(`/api/games/${gameId}/history`);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await request(app)
      .get("/api/games/not-a-uuid/history")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 for non-existent game", async () => {
    const res = await request(app)
      .get(`/api/games/${randomUUID()}/history`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a game the user never joined", async () => {
    const res = await request(app)
      .get(`/api/games/${gameId}/history`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 with hasFull=false and empty moves when no history recorded", async () => {
    const res = await request(app)
      .get(`/api/games/${gameId}/history`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("moves");
    expect(res.body).toHaveProperty("hasFull");
    expect(Array.isArray(res.body.moves)).toBe(true);
    expect(res.body.moves).toHaveLength(0);
    expect(res.body.hasFull).toBe(false);
  });

  it("returns 200 with hasFull=true and ordered moves when history exists", async () => {
    // Insert moves directly to simulate fill_cell WS events
    await pool.query(
      `INSERT INTO game_moves (game_id, user_id, row, col, value, created_at)
       VALUES ($1, $2, 0, 0, 'A', now()), ($1, $2, 0, 1, 'B', now() + interval '1 second')`,
      [gameId, ownerId]
    );

    const res = await request(app)
      .get(`/api/games/${gameId}/history`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.hasFull).toBe(true);
    expect(res.body.moves.length).toBeGreaterThanOrEqual(2);

    const move = res.body.moves[0];
    expect(move).toHaveProperty("id");
    expect(move).toHaveProperty("gameId", gameId);
    expect(move).toHaveProperty("userId", ownerId);
    expect(move).toHaveProperty("row");
    expect(move).toHaveProperty("col");
    expect(move).toHaveProperty("value");
    expect(move).toHaveProperty("createdAt");

    // Moves should be in chronological order
    const timestamps = res.body.moves.map((m: { createdAt: string }) => new Date(m.createdAt).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it("includes deletion moves (empty value) in history", async () => {
    await pool.query(
      `INSERT INTO game_moves (game_id, user_id, row, col, value) VALUES ($1, $2, 2, 2, '')`,
      [gameId, ownerId]
    );

    const res = await request(app)
      .get(`/api/games/${gameId}/history`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const deletionMove = res.body.moves.find((m: { value: string }) => m.value === "");
    expect(deletionMove).toBeDefined();
  });
});
