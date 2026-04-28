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
  // FK-safe order: cells → participants → games → ratings → puzzles → users
  // Delete games and their dependents for both test users and test-authored puzzles
  await pool.query(`
    DELETE FROM game_cells WHERE game_id IN (
      SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross'
    )`);
  await pool.query(`
    DELETE FROM game_participants WHERE game_id IN (
      SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross'
    )`);
  await pool.query(`
    DELETE FROM games WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`
    DELETE FROM games WHERE puzzle_id IN (
      SELECT p.id FROM puzzles p JOIN users u ON u.id = p.author_id WHERE u.email LIKE '%@test.multicross'
    )`);
  await pool.query(`
    DELETE FROM puzzle_ratings WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`
    DELETE FROM puzzles WHERE author_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@test.multicross'`);
}

beforeAll(async () => {
  await purgeTestData();
}, 15_000);

const validPuzzleBody = {
  title: "Rating Test Puzzle",
  author: "Test Author",
  width: 5,
  height: 5,
  grid: Array(5).fill(Array(5).fill("")),
  clues: { across: { "1": "Across clue" }, down: { "1": "Down clue" } },
  status: "published",
};

async function registerUser(displayName = "Rating Test User") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName, password: "testpassword123" });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createPuzzle(token: string) {
  const res = await request(app)
    .post("/api/puzzles")
    .set("Authorization", `Bearer ${token}`)
    .send(validPuzzleBody);
  if (res.status !== 201) {
    throw new Error(`createPuzzle failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.puzzle as { id: string };
}

// ---------------------------------------------------------------------------
// POST /api/puzzles/:id/rate
// ---------------------------------------------------------------------------

describe("POST /api/puzzles/:id/rate", () => {
  let token: string;
  let puzzleId: string;

  beforeAll(async () => {
    ({ token } = await registerUser("Rate Puzzle User"));
    const puzzle = await createPuzzle(token);
    puzzleId = puzzle.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .send({ difficulty: 3, enjoyment: 4 });
    expect(res.status).toBe(401);
  });

  it("happy path: returns 200 with stats after rating", async () => {
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: 4, enjoyment: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("stats");
    const { stats } = res.body;
    expect(stats.ratingCount).toBe(1);
    expect(stats.averageDifficulty).toBe(4.0);
    expect(stats.averageEnjoyment).toBe(5.0);
    expect(typeof stats.playCount).toBe("number");
  });

  it("returns 400 when difficulty is below 1", async () => {
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: 0, enjoyment: 3 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when difficulty is above 5", async () => {
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: 6, enjoyment: 3 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when difficulty is not an integer", async () => {
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: 3.5, enjoyment: 3 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when enjoyment is missing", async () => {
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: 3 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown puzzle ID", async () => {
    const res = await request(app)
      .post(`/api/puzzles/${randomUUID()}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: 3, enjoyment: 3 });
    expect(res.status).toBe(404);
  });

  it("upsert: second rating updates the previous one and ratingCount stays at 1", async () => {
    // First rating already submitted in happy path test above (difficulty=4, enjoyment=5)
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ difficulty: 2, enjoyment: 3 });
    expect(res.status).toBe(200);
    const { stats } = res.body;
    expect(stats.ratingCount).toBe(1); // still 1, not 2
    expect(stats.averageDifficulty).toBe(2.0);
    expect(stats.averageEnjoyment).toBe(3.0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/puzzles/:id/stats
// ---------------------------------------------------------------------------

describe("GET /api/puzzles/:id/stats", () => {
  let raterToken: string;
  let otherToken: string;
  let puzzleId: string;

  beforeAll(async () => {
    ({ token: raterToken } = await registerUser("Stats Rater"));
    ({ token: otherToken } = await registerUser("Stats Other User"));
    const puzzle = await createPuzzle(raterToken);
    puzzleId = puzzle.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get(`/api/puzzles/${puzzleId}/stats`);
    expect(res.status).toBe(401);
  });

  it("returns 200 with zero stats for unrated puzzle", async () => {
    const res = await request(app)
      .get(`/api/puzzles/${puzzleId}/stats`)
      .set("Authorization", `Bearer ${raterToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.ratingCount).toBe(0);
    expect(res.body.stats.averageDifficulty).toBeNull();
    expect(res.body.stats.averageEnjoyment).toBeNull();
    expect(typeof res.body.stats.playCount).toBe("number");
    expect(res.body.userRating).toBeNull();
  });

  it("returns updated stats after a rating is submitted", async () => {
    await request(app)
      .post(`/api/puzzles/${puzzleId}/rate`)
      .set("Authorization", `Bearer ${raterToken}`)
      .send({ difficulty: 3, enjoyment: 4 });

    const res = await request(app)
      .get(`/api/puzzles/${puzzleId}/stats`)
      .set("Authorization", `Bearer ${raterToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.ratingCount).toBe(1);
    expect(res.body.stats.averageDifficulty).toBe(3.0);
    expect(res.body.stats.averageEnjoyment).toBe(4.0);
  });

  it("includes userRating when the requesting user has rated the puzzle", async () => {
    const res = await request(app)
      .get(`/api/puzzles/${puzzleId}/stats`)
      .set("Authorization", `Bearer ${raterToken}`);
    expect(res.body.userRating).toEqual({ difficulty: 3, enjoyment: 4 });
  });

  it("userRating is null for a user who has not rated", async () => {
    const res = await request(app)
      .get(`/api/puzzles/${puzzleId}/stats`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.body.userRating).toBeNull();
  });

  it("returns 404 for unknown puzzle ID", async () => {
    const res = await request(app)
      .get(`/api/puzzles/${randomUUID()}/stats`)
      .set("Authorization", `Bearer ${raterToken}`);
    expect(res.status).toBe(404);
  });
});
