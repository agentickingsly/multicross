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

const validBody = {
  title: "Test Puzzle",
  author: "Test Author",
  width: 5,
  height: 5,
  grid: Array(5).fill(Array(5).fill("")),
  clues: { across: { "1": "Across clue" }, down: { "1": "Down clue" } },
  status: "draft",
};

async function registerUser(displayName = "Puzzle Test User") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName, password: "testpassword123" });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: expected 201, got ${res.status}. Body: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createPuzzle(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/puzzles")
    .set("Authorization", `Bearer ${token}`)
    .send({ ...validBody, ...overrides });
  if (res.status !== 201) {
    throw new Error(`createPuzzle failed: expected 201, got ${res.status}. Body: ${JSON.stringify(res.body)}`);
  }
  if (!res.body.puzzle) {
    throw new Error(`createPuzzle failed: res.body.puzzle is missing. Body: ${JSON.stringify(res.body)}`);
  }
  return res.body.puzzle as { id: string; authorId: string; status: string; [key: string]: unknown };
}

// ─── GET /api/puzzles ────────────────────────────────────────────────────────

describe("GET /api/puzzles", () => {
  let token: string;
  let publishedId: string;
  let draftId: string;

  beforeAll(async () => {
    ({ token } = await registerUser("Get Puzzles User"));
    const pub = await createPuzzle(token, { status: "published" });
    publishedId = pub.id;
    const draft = await createPuzzle(token, { status: "draft" });
    draftId = draft.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/puzzles");
    expect(res.status).toBe(401);
  });

  it("returns 200 with puzzles array", async () => {
    const res = await request(app)
      .get("/api/puzzles")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("puzzles");
    expect(Array.isArray(res.body.puzzles)).toBe(true);
  });

  it("includes published puzzles", async () => {
    const res = await request(app)
      .get("/api/puzzles")
      .set("Authorization", `Bearer ${token}`);
    const ids = res.body.puzzles.map((p: { id: string }) => p.id);
    expect(ids).toContain(publishedId);
  });

  it("excludes draft puzzles", async () => {
    const res = await request(app)
      .get("/api/puzzles")
      .set("Authorization", `Bearer ${token}`);
    const ids = res.body.puzzles.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(draftId);
  });
});

// ─── GET /api/puzzles/mine ───────────────────────────────────────────────────

describe("GET /api/puzzles/mine", () => {
  let ownerToken: string;
  let ownerId: string;
  let otherToken: string;
  let ownerPuzzleId: string;
  let otherPuzzleId: string;

  beforeAll(async () => {
    ({ token: ownerToken, userId: ownerId } = await registerUser("Mine Owner"));
    ({ token: otherToken } = await registerUser("Mine Other"));
    const ownerPuzzle = await createPuzzle(ownerToken);
    ownerPuzzleId = ownerPuzzle.id;
    const otherPuzzle = await createPuzzle(otherToken);
    otherPuzzleId = otherPuzzle.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/puzzles/mine");
    expect(res.status).toBe(401);
  });

  it("returns 200 with puzzles array", async () => {
    const res = await request(app)
      .get("/api/puzzles/mine")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("puzzles");
    expect(Array.isArray(res.body.puzzles)).toBe(true);
  });

  it("includes puzzles owned by the calling user", async () => {
    const res = await request(app)
      .get("/api/puzzles/mine")
      .set("Authorization", `Bearer ${ownerToken}`);
    const ids = res.body.puzzles.map((p: { id: string }) => p.id);
    expect(ids).toContain(ownerPuzzleId);
  });

  it("excludes puzzles owned by other users", async () => {
    const res = await request(app)
      .get("/api/puzzles/mine")
      .set("Authorization", `Bearer ${ownerToken}`);
    const ids = res.body.puzzles.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(otherPuzzleId);
  });
});

// ─── GET /api/puzzles/:id ────────────────────────────────────────────────────

describe("GET /api/puzzles/:id", () => {
  let token: string;
  let puzzleId: string;

  beforeAll(async () => {
    ({ token } = await registerUser("Get By ID User"));
    const puzzle = await createPuzzle(token);
    puzzleId = puzzle.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get(`/api/puzzles/${puzzleId}`);
    expect(res.status).toBe(401);
  });

  it("returns 200 with puzzle for valid id", async () => {
    const res = await request(app)
      .get(`/api/puzzles/${puzzleId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("puzzle");
    expect(res.body.puzzle.id).toBe(puzzleId);
    expect(res.body.puzzle).toHaveProperty("title");
    expect(res.body.puzzle).toHaveProperty("grid");
    expect(res.body.puzzle).toHaveProperty("clues");
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .get(`/api/puzzles/${randomUUID()}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/puzzles ───────────────────────────────────────────────────────

describe("POST /api/puzzles", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ token, userId } = await registerUser("Post Puzzle User"));
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/puzzles").send(validBody);
    expect(res.status).toBe(401);
  });

  it("returns 201 with puzzle on valid body", async () => {
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("puzzle");
    expect(res.body.puzzle).toHaveProperty("id");
    expect(res.body.puzzle.title).toBe(validBody.title);
    expect(res.body.puzzle.status).toBe("draft");
  });

  it("sets authorId from JWT, not from request body", async () => {
    const fakeId = randomUUID();
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, author_id: fakeId });
    expect(res.status).toBe(201);
    expect(res.body.puzzle.authorId).toBe(userId);
    expect(res.body.puzzle.authorId).not.toBe(fakeId);
  });

  it("returns 400 when title is missing", async () => {
    const { title: _, ...body } = validBody;
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when width is below minimum (< 3)", async () => {
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, width: 2 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when width exceeds maximum (> 21)", async () => {
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, width: 22 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when height is below minimum (< 3)", async () => {
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, height: 2 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when height exceeds maximum (> 21)", async () => {
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, height: 22 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when width is not an integer", async () => {
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, width: 5.5 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when grid is missing", async () => {
    const { grid: _, ...body } = validBody;
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when clues is missing", async () => {
    const { clues: _, ...body } = validBody;
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is not a valid enum value", async () => {
    const res = await request(app)
      .post("/api/puzzles")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, status: "archived" });
    expect(res.status).toBe(400);
  });
});

// ─── PUT /api/puzzles/:id ────────────────────────────────────────────────────

describe("PUT /api/puzzles/:id", () => {
  let ownerToken: string;
  let otherToken: string;
  let puzzleId: string;

  beforeAll(async () => {
    ({ token: ownerToken } = await registerUser("Put Owner User"));
    ({ token: otherToken } = await registerUser("Put Other User"));
    const puzzle = await createPuzzle(ownerToken);
    puzzleId = puzzle.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .put(`/api/puzzles/${puzzleId}`)
      .send(validBody);
    expect(res.status).toBe(401);
  });

  it("returns 200 with updated puzzle for the owner", async () => {
    const updated = { ...validBody, title: "Updated Title", status: "published" };
    const res = await request(app)
      .put(`/api/puzzles/${puzzleId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(updated);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("puzzle");
    expect(res.body.puzzle.title).toBe("Updated Title");
    expect(res.body.puzzle.status).toBe("published");
  });

  it("returns 403 when caller is not the owner", async () => {
    const res = await request(app)
      .put(`/api/puzzles/${puzzleId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown puzzle id", async () => {
    const res = await request(app)
      .put(`/api/puzzles/${randomUUID()}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it("returns 400 when title is missing", async () => {
    const { title: _, ...body } = validBody;
    const res = await request(app)
      .put(`/api/puzzles/${puzzleId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when width is out of range", async () => {
    const res = await request(app)
      .put(`/api/puzzles/${puzzleId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ ...validBody, width: 1 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when height is out of range", async () => {
    const res = await request(app)
      .put(`/api/puzzles/${puzzleId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ ...validBody, height: 25 });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/puzzles/:id ─────────────────────────────────────────────────

describe("DELETE /api/puzzles/:id", () => {
  let ownerToken: string;
  let otherToken: string;
  let puzzleId: string;

  beforeAll(async () => {
    ({ token: ownerToken } = await registerUser("Delete Owner User"));
    ({ token: otherToken } = await registerUser("Delete Other User"));
    const puzzle = await createPuzzle(ownerToken);
    puzzleId = puzzle.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete(`/api/puzzles/${puzzleId}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not the owner", async () => {
    const res = await request(app)
      .delete(`/api/puzzles/${puzzleId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 409 when puzzle has active games", async () => {
    const { token: gameOwnerToken } = await registerUser("Delete 409 User");
    const puzzle = await createPuzzle(gameOwnerToken, { status: "published" });
    await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${gameOwnerToken}`)
      .send({ puzzleId: puzzle.id });

    const res = await request(app)
      .delete(`/api/puzzles/${puzzle.id}`)
      .set("Authorization", `Bearer ${gameOwnerToken}`);
    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown puzzle id", async () => {
    const res = await request(app)
      .delete(`/api/puzzles/${randomUUID()}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 and deletes the puzzle when no active games exist", async () => {
    const puzzle = await createPuzzle(ownerToken);
    const res = await request(app)
      .delete(`/api/puzzles/${puzzle.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);

    const { rows } = await pool.query("SELECT id FROM puzzles WHERE id = $1", [puzzle.id]);
    expect(rows).toHaveLength(0);
  });
});

// ─── GET /api/puzzles — pagination and sorting ───────────────────────────────

describe("GET /api/puzzles — pagination and sorting", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await registerUser("Pagination Test User"));
    await createPuzzle(token, { status: "published", title: "Pagination Puzzle A" });
    await createPuzzle(token, { status: "published", title: "Pagination Puzzle B" });
  });

  it("returns paginated shape with defaults", async () => {
    const res = await request(app)
      .get("/api/puzzles")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(typeof res.body.total).toBe("number");
    expect(res.body).toHaveProperty("page", 1);
    expect(res.body).toHaveProperty("limit", 12);
    expect(res.body).toHaveProperty("totalPages");
    expect(typeof res.body.totalPages).toBe("number");
    expect(Array.isArray(res.body.puzzles)).toBe(true);
  });

  it("respects the limit param", async () => {
    const res = await request(app)
      .get("/api/puzzles?limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
    expect(res.body.puzzles.length).toBeLessThanOrEqual(1);
  });

  it("respects the page param and returns correct page", async () => {
    const res = await request(app)
      .get("/api/puzzles?page=2&limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(1);
  });

  it("accepts all valid sort values", async () => {
    for (const sort of ["newest", "most_played", "most_difficult", "most_enjoyable"]) {
      const res = await request(app)
        .get(`/api/puzzles?sort=${sort}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it("returns 400 for invalid sort value", async () => {
    const res = await request(app)
      .get("/api/puzzles?sort=invalid")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("returns 400 when limit exceeds maximum (> 50)", async () => {
    const res = await request(app)
      .get("/api/puzzles?limit=51")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("returns 400 when page is less than 1", async () => {
    const res = await request(app)
      .get("/api/puzzles?page=0")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("totalPages matches total and limit", async () => {
    const res = await request(app)
      .get("/api/puzzles?limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalPages).toBe(Math.ceil(res.body.total / 1));
  });
});

// ─── GET /api/puzzles/mine — pagination ──────────────────────────────────────

describe("GET /api/puzzles/mine — pagination", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await registerUser("Mine Pagination User"));
    await createPuzzle(token, { title: "Mine Pag Puzzle" });
  });

  it("returns paginated shape with defaults", async () => {
    const res = await request(app)
      .get("/api/puzzles/mine")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(typeof res.body.total).toBe("number");
    expect(res.body).toHaveProperty("page", 1);
    expect(res.body).toHaveProperty("limit", 12);
    expect(res.body).toHaveProperty("totalPages");
    expect(Array.isArray(res.body.puzzles)).toBe(true);
  });

  it("respects the limit param", async () => {
    const res = await request(app)
      .get("/api/puzzles/mine?limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
    expect(res.body.puzzles.length).toBeLessThanOrEqual(1);
  });

  it("returns 400 when limit exceeds maximum (> 50)", async () => {
    const res = await request(app)
      .get("/api/puzzles/mine?limit=51")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("returns 400 when page is less than 1", async () => {
    const res = await request(app)
      .get("/api/puzzles/mine?page=0")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
