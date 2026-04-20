import { randomUUID } from "crypto";
import { app } from "../index";
import pool from "../db/pool";
import request from "supertest";
import { runExpiryJob } from "../jobs/expiry";

const testEmail = () => `testuser+${randomUUID()}@test.multicross`;

let authToken: string;
let userId: string;
let testPuzzleId: string;

// IDs of games created in each test; collected for cleanup
const createdGameIds: string[] = [];

beforeAll(async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName: "Expiry Test User", password: "testpassword123" });
  authToken = res.body.token;
  userId = res.body.user.id;

  const result = await pool.query(
    `INSERT INTO puzzles (title, author, width, height, grid, clues)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     RETURNING id`,
    ["Expiry Test Puzzle", "Test Author", 5, 5, JSON.stringify([]), JSON.stringify({ across: [], down: [] })]
  );
  testPuzzleId = result.rows[0].id;
}, 15_000);

afterAll(async () => {
  if (createdGameIds.length > 0) {
    await pool.query(
      "DELETE FROM game_cells WHERE game_id = ANY($1::uuid[])",
      [createdGameIds]
    );
    await pool.query(
      "DELETE FROM game_participants WHERE game_id = ANY($1::uuid[])",
      [createdGameIds]
    );
    await pool.query("DELETE FROM games WHERE id = ANY($1::uuid[])", [createdGameIds]);
  }
  if (testPuzzleId) {
    await pool.query("DELETE FROM puzzles WHERE id = $1", [testPuzzleId]);
  }
});

/** Insert a game with a backdated last_activity_at, bypassing the REST API. */
async function insertStaleGame(
  status: "waiting" | "active",
  lastActivityOffset: string
): Promise<string> {
  // Ensure unique room code
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const roomCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  const { rows } = await pool.query(
    `INSERT INTO games (puzzle_id, room_code, status, created_by, last_activity_at)
     VALUES ($1, $2, $3::game_status, $4, now() - $5::interval)
     RETURNING id`,
    [testPuzzleId, roomCode, status, userId, lastActivityOffset]
  );
  const id: string = rows[0].id;
  createdGameIds.push(id);
  await pool.query(
    "INSERT INTO game_participants (game_id, user_id, color) VALUES ($1, $2, $3)",
    [id, userId, "#e74c3c"]
  );
  return id;
}

describe("runExpiryJob", () => {
  it("expires a waiting game inactive for > 24 hours", async () => {
    const id = await insertStaleGame("waiting", "25 hours");
    await runExpiryJob();
    const { rows } = await pool.query("SELECT status FROM games WHERE id = $1", [id]);
    expect(rows[0].status).toBe("expired");
  });

  it("expires an active game inactive for > 7 days", async () => {
    const id = await insertStaleGame("active", "8 days");
    await runExpiryJob();
    const { rows } = await pool.query("SELECT status FROM games WHERE id = $1", [id]);
    expect(rows[0].status).toBe("expired");
  });

  it("does not expire a waiting game inactive for < 24 hours", async () => {
    const id = await insertStaleGame("waiting", "23 hours");
    await runExpiryJob();
    const { rows } = await pool.query("SELECT status FROM games WHERE id = $1", [id]);
    expect(rows[0].status).toBe("waiting");
  });

  it("does not expire an active game inactive for < 7 days", async () => {
    const id = await insertStaleGame("active", "6 days");
    await runExpiryJob();
    const { rows } = await pool.query("SELECT status FROM games WHERE id = $1", [id]);
    expect(rows[0].status).toBe("active");
  });

  it("does not re-expire an already-complete game", async () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const roomCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const { rows } = await pool.query(
      `INSERT INTO games (puzzle_id, room_code, status, created_by, last_activity_at)
       VALUES ($1, $2, 'complete', $3, now() - interval '30 days')
       RETURNING id`,
      [testPuzzleId, roomCode, userId]
    );
    const id: string = rows[0].id;
    createdGameIds.push(id);
    await pool.query("INSERT INTO game_participants (game_id, user_id, color) VALUES ($1, $2, $3)", [id, userId, "#e74c3c"]);

    await runExpiryJob();
    const { rows: after } = await pool.query("SELECT status FROM games WHERE id = $1", [id]);
    expect(after[0].status).toBe("complete");
  });
});

describe("GET /api/games/my-active after expiry", () => {
  it("does not show expired games", async () => {
    const id = await insertStaleGame("waiting", "25 hours");
    await runExpiryJob();

    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${authToken}`);
    const ids = res.body.games.map((g: { id: string }) => g.id);
    expect(ids).not.toContain(id);
  });
});
