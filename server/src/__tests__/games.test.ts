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
