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

async function registerUser(displayName = "Admin Test User") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName, password: "password123" });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function makeAdmin(userId: string) {
  await pool.query("UPDATE users SET is_admin = true WHERE id = $1", [userId]);
}

describe("Ban middleware — requireNotBanned", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ token, userId } = await registerUser("Ban MW User"));
  });

  it("allows access when user is not banned", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("returns 403 with Account suspended when user is banned", async () => {
    await pool.query("UPDATE users SET is_banned = true WHERE id = $1", [userId]);
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error", "Account suspended");
    // restore
    await pool.query("UPDATE users SET is_banned = false WHERE id = $1", [userId]);
  });
});

describe("requireAdmin middleware", () => {
  let nonAdminToken: string;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    ({ token: nonAdminToken } = await registerUser("Non Admin User"));
    ({ token: adminToken, userId: adminUserId } = await registerUser("Admin User"));
    await makeAdmin(adminUserId);
  });

  it("returns 403 for non-admin on admin route", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token on admin route", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("allows access for admin user", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/users/:id/ban", () => {
  let adminToken: string;
  let adminUserId: string;
  let targetUserId: string;
  let nonAdminToken: string;

  beforeAll(async () => {
    ({ token: adminToken, userId: adminUserId } = await registerUser("Ban Admin"));
    await makeAdmin(adminUserId);
    ({ token: nonAdminToken, userId: targetUserId } = await registerUser("Ban Target"));
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post(`/api/admin/users/${targetUserId}/ban`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${targetUserId}/ban`)
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid user ID", async () => {
    const res = await request(app)
      .post("/api/admin/users/not-a-uuid/ban")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown user", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${randomUUID()}/ban`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("bans a user with reason — happy path", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${targetUserId}/ban`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Repeated cheating" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);

    const { rows } = await pool.query(
      "SELECT is_banned, banned_reason FROM users WHERE id = $1",
      [targetUserId]
    );
    expect(rows[0].is_banned).toBe(true);
    expect(rows[0].banned_reason).toBe("Repeated cheating");
  });

  it("banned user cannot access protected routes", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account suspended");
  });
});

describe("POST /api/admin/users/:id/unban", () => {
  let adminToken: string;
  let adminUserId: string;
  let targetToken: string;
  let targetUserId: string;

  beforeAll(async () => {
    ({ token: adminToken, userId: adminUserId } = await registerUser("Unban Admin"));
    await makeAdmin(adminUserId);
    ({ token: targetToken, userId: targetUserId } = await registerUser("Unban Target"));
    // pre-ban the target
    await pool.query("UPDATE users SET is_banned = true, banned_at = now(), banned_reason = 'test' WHERE id = $1", [targetUserId]);
  });

  it("returns 403 for non-admin", async () => {
    const { token: other } = await registerUser("Unban Non-Admin");
    const res = await request(app)
      .post(`/api/admin/users/${targetUserId}/unban`)
      .set("Authorization", `Bearer ${other}`);
    expect(res.status).toBe(403);
  });

  it("unbans a user — happy path", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${targetUserId}/unban`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);

    const { rows } = await pool.query(
      "SELECT is_banned, banned_at, banned_reason FROM users WHERE id = $1",
      [targetUserId]
    );
    expect(rows[0].is_banned).toBe(false);
    expect(rows[0].banned_at).toBeNull();
    expect(rows[0].banned_reason).toBeNull();
  });

  it("unbanned user can access protected routes again", async () => {
    const res = await request(app)
      .get("/api/games/my-active")
      .set("Authorization", `Bearer ${targetToken}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/users", () => {
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    ({ token: adminToken, userId: adminUserId } = await registerUser("List Admin"));
    await makeAdmin(adminUserId);
  });

  it("returns paginated user list with ban status", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("users");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("limit");
    expect(res.body).toHaveProperty("totalPages");
    expect(Array.isArray(res.body.users)).toBe(true);

    const user = res.body.users[0];
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("isBanned");
    expect(user).toHaveProperty("isAdmin");
  });

  it("respects page and limit params", async () => {
    const res = await request(app)
      .get("/api/admin/users?page=1&limit=2")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeLessThanOrEqual(2);
    expect(res.body.limit).toBe(2);
  });
});
