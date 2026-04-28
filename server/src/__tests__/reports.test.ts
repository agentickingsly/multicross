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

async function registerUser(displayName = "Reports Test User") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName, password: "password123" });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

const validPuzzleBody = {
  title: "Reports Test Puzzle",
  author: "Test Author",
  width: 5,
  height: 5,
  grid: Array(5).fill(Array(5).fill("")),
  clues: { across: { "1": "Across clue" }, down: { "1": "Down clue" } },
  status: "published",
};

describe("POST /api/games/:id/report", () => {
  let reporterToken: string;
  let reporterId: string;
  let reportedToken: string;
  let reportedId: string;
  let gameId: string;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    ({ token: reporterToken, userId: reporterId } = await registerUser("Reporter User"));
    ({ token: reportedToken, userId: reportedId } = await registerUser("Reported User"));
    ({ token: adminToken, userId: adminId } = await registerUser("Reports Admin"));
    await pool.query("UPDATE users SET is_admin = true WHERE id = $1", [adminId]);

    // create puzzle + game
    const puzzleRes = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${reporterToken}`)
      .send(validPuzzleBody);
    const puzzleId = puzzleRes.body.puzzle.id as string;

    const gameRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ puzzleId });
    gameId = gameRes.body.game.id as string;
  });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .send({ reportedUserId: reportedId, reason: "Cheating" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing reason", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reportedUserId: reportedId });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing reportedUserId", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reason: "Cheating" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid reportedUserId (not uuid)", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reportedUserId: "not-a-uuid", reason: "Cheating" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason exceeds 500 chars", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reportedUserId: reportedId, reason: "x".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when reporting yourself", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reportedUserId: reporterId, reason: "Self report" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "You cannot report yourself");
  });

  it("returns 404 for unknown game", async () => {
    const res = await request(app)
      .post(`/api/games/${randomUUID()}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reportedUserId: reportedId, reason: "Cheating" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown reported user", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reportedUserId: randomUUID(), reason: "Cheating" });
    expect(res.status).toBe(404);
  });

  it("creates a report — happy path", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/report`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({ reportedUserId: reportedId, reason: "Using offensive language" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("success", true);

    const { rows } = await pool.query(
      "SELECT * FROM game_reports WHERE game_id = $1 AND reporter_id = $2 AND reported_user_id = $3",
      [gameId, reporterId, reportedId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("Using offensive language");
  });

  it("GET /api/admin/reports returns the report", async () => {
    const res = await request(app)
      .get("/api/admin/reports")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("reports");
    expect(Array.isArray(res.body.reports)).toBe(true);

    const report = res.body.reports.find((r: { gameId: string }) => r.gameId === gameId);
    expect(report).toBeDefined();
    expect(report).toHaveProperty("reporter");
    expect(report).toHaveProperty("reportedUser");
    expect(report.reporter).toHaveProperty("email");
    expect(report.reportedUser).toHaveProperty("email");
  });

  it("GET /api/admin/reports returns 403 for non-admin", async () => {
    const res = await request(app)
      .get("/api/admin/reports")
      .set("Authorization", `Bearer ${reporterToken}`);
    expect(res.status).toBe(403);
  });
});
