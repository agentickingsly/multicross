import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../index";
import pool from "../db/pool";

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

describe("POST /api/auth/register", () => {
  it("returns 201 with user and token for valid input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), displayName: "Test User", password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("token");
  });

  it("returns 400 for missing displayName", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), password: "password123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for password under 8 chars", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail(), displayName: "Test User", password: "short" });
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate email", async () => {
    const email = testEmail();
    await request(app)
      .post("/api/auth/register")
      .send({ email, displayName: "Test User", password: "password123" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, displayName: "Test User 2", password: "password123" });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  const email = testEmail();
  const password = "testpassword123";

  beforeAll(async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email, displayName: "Login Test User", password });
  });

  it("returns 200 with user and token for valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("token");
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail(), password: "anypassword123" });
    expect(res.status).toBe(401);
  });
});
