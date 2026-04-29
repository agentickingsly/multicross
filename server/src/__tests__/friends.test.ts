import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../index";
import pool from "../db/pool";

vi.mock("../db/redis", () => ({
  pub: { publish: vi.fn().mockResolvedValue(0) },
  getOnlineStatuses: vi.fn().mockResolvedValue({}),
  deleteGameKeys: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ws/ioInstance", () => ({
  emitToUser: vi.fn().mockResolvedValue(undefined),
  setIo: vi.fn(),
}));

const testEmail = () => `testuser+${randomUUID()}@test.multicross`;

async function purgeTestData() {
  await pool.query(`
    DELETE FROM friendships
    WHERE requester_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')
       OR addressee_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')
  `);
  await pool.query(`
    DELETE FROM game_invites
    WHERE inviter_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')
       OR invitee_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')
  `);
  await pool.query(`DELETE FROM game_cells WHERE game_id IN (SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM game_participants WHERE game_id IN (SELECT g.id FROM games g JOIN users u ON u.id = g.created_by WHERE u.email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM games WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM puzzles WHERE author_id IN (SELECT id FROM users WHERE email LIKE '%@test.multicross')`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@test.multicross'`);
}

beforeAll(async () => {
  await purgeTestData();
}, 15_000);

afterAll(async () => {
  await purgeTestData();
}, 15_000);

async function registerUser(displayName = "Friend Test User") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail(), displayName, password: "testpassword123" });
  if (res.status !== 201) throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createPuzzle(token: string) {
  const res = await request(app)
    .post("/api/puzzles")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Friend Test Puzzle",
      author: "Tester",
      width: 5,
      height: 5,
      grid: Array(5).fill(Array(5).fill("")),
      clues: { across: { "1": "Across" }, down: { "1": "Down" } },
      status: "published",
    });
  if (res.status !== 201) throw new Error(`createPuzzle failed: ${res.status}`);
  return res.body.puzzle as { id: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/request
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/friends/request", () => {
  let senderToken: string;
  let senderId: string;
  let recipientId: string;

  beforeAll(async () => {
    ({ token: senderToken, userId: senderId } = await registerUser("Sender"));
    ({ userId: recipientId } = await registerUser("Recipient"));
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/friends/request")
      .send({ addresseeId: recipientId });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid addresseeId (not a UUID)", async () => {
    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ addresseeId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when sending a request to yourself", async () => {
    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ addresseeId: senderId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
  });

  it("returns 404 when addressee does not exist", async () => {
    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ addresseeId: randomUUID() });
    expect(res.status).toBe(404);
  });

  it("returns 201 with friendshipId for a valid request", async () => {
    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ addresseeId: recipientId });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("friendshipId");
  });

  it("returns 409 when a request already exists", async () => {
    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ addresseeId: recipientId });
    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/friends/requests
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/friends/requests", () => {
  let addresseeToken: string;
  let requesterId: string;

  beforeAll(async () => {
    let addresseeId: string;
    ({ userId: requesterId } = await registerUser("Requester"));
    let requesterToken: string;
    ({ token: requesterToken } = await registerUser("Requester2"));
    ({ token: addresseeToken, userId: addresseeId } = await registerUser("Addressee"));

    await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ addresseeId });
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/friends/requests");
    expect(res.status).toBe(401);
  });

  it("returns 200 with pending requests array", async () => {
    const res = await request(app)
      .get("/api/friends/requests")
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.requests)).toBe(true);
  });

  it("includes the pending request in the list", async () => {
    const res = await request(app)
      .get("/api/friends/requests")
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.body.requests.length).toBeGreaterThanOrEqual(1);
    const req = res.body.requests[0];
    expect(req).toHaveProperty("friendshipId");
    expect(req).toHaveProperty("requesterId");
    expect(req).toHaveProperty("displayName");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/:id/accept
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/friends/:id/accept", () => {
  let requesterToken: string;
  let addresseeToken: string;
  let friendshipId: string;

  beforeAll(async () => {
    let addresseeId: string;
    ({ token: requesterToken } = await registerUser("AcceptRequester"));
    ({ token: addresseeToken, userId: addresseeId } = await registerUser("AcceptAddressee"));

    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ addresseeId });
    friendshipId = res.body.friendshipId;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post(`/api/friends/${friendshipId}/accept`);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await request(app)
      .post("/api/friends/not-a-uuid/accept")
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the requester tries to accept their own request", async () => {
    const res = await request(app)
      .post(`/api/friends/${friendshipId}/accept`)
      .set("Authorization", `Bearer ${requesterToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 for a valid accept by the addressee", async () => {
    const res = await request(app)
      .post(`/api/friends/${friendshipId}/accept`)
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  it("returns 404 when trying to accept an already-accepted request", async () => {
    const res = await request(app)
      .post(`/api/friends/${friendshipId}/accept`)
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/:id/decline
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/friends/:id/decline", () => {
  let requesterToken: string;
  let addresseeToken: string;
  let friendshipId: string;

  beforeAll(async () => {
    let addresseeId: string;
    ({ token: requesterToken } = await registerUser("DeclineRequester"));
    ({ token: addresseeToken, userId: addresseeId } = await registerUser("DeclineAddressee"));

    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ addresseeId });
    friendshipId = res.body.friendshipId;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post(`/api/friends/${friendshipId}/decline`);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await request(app)
      .post("/api/friends/not-a-uuid/decline")
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 200 for a valid decline", async () => {
    const res = await request(app)
      .post(`/api/friends/${friendshipId}/decline`)
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  it("returns 404 when trying to decline an already-processed request", async () => {
    const res = await request(app)
      .post(`/api/friends/${friendshipId}/decline`)
      .set("Authorization", `Bearer ${addresseeToken}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/friends
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/friends", () => {
  let userToken: string;
  let friendId: string;

  beforeAll(async () => {
    let userId: string;
    let friendToken: string;
    ({ token: userToken, userId } = await registerUser("FriendListUser"));
    ({ token: friendToken, userId: friendId } = await registerUser("FriendListFriend"));

    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ addresseeId: friendId });
    const fid = res.body.friendshipId;

    await request(app)
      .post(`/api/friends/${fid}/accept`)
      .set("Authorization", `Bearer ${friendToken}`);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/friends");
    expect(res.status).toBe(401);
  });

  it("returns 200 with friends array", async () => {
    const res = await request(app)
      .get("/api/friends")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.friends)).toBe(true);
  });

  it("includes the accepted friend", async () => {
    const res = await request(app)
      .get("/api/friends")
      .set("Authorization", `Bearer ${userToken}`);
    const friend = res.body.friends.find((f: { userId: string }) => f.userId === friendId);
    expect(friend).toBeDefined();
    expect(friend).toHaveProperty("friendshipId");
    expect(friend).toHaveProperty("displayName");
    expect(friend).toHaveProperty("online");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/friends/:id
// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/friends/:id", () => {
  let userToken: string;
  let friendToken: string;
  let friendshipId: string;

  beforeAll(async () => {
    let userId: string;
    let friendId: string;
    ({ token: userToken, userId } = await registerUser("RemoveUser"));
    ({ token: friendToken, userId: friendId } = await registerUser("RemoveFriend"));

    const res = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ addresseeId: friendId });
    friendshipId = res.body.friendshipId;

    await request(app)
      .post(`/api/friends/${friendshipId}/accept`)
      .set("Authorization", `Bearer ${friendToken}`);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete(`/api/friends/${friendshipId}`);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await request(app)
      .delete("/api/friends/not-a-uuid")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 200 for a valid removal", async () => {
    const res = await request(app)
      .delete(`/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  it("returns 404 when friendship no longer exists", async () => {
    const res = await request(app)
      .delete(`/api/friends/${friendshipId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/games/:id/invite
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/games/:id/invite", () => {
  let inviterToken: string;
  let inviterId: string;
  let friendToken: string;
  let friendId: string;
  let strangerToken: string;
  let strangerId: string;
  let gameId: string;

  beforeAll(async () => {
    ({ token: inviterToken, userId: inviterId } = await registerUser("GameInviter"));
    ({ token: friendToken, userId: friendId } = await registerUser("GameInvitee"));
    ({ token: strangerToken, userId: strangerId } = await registerUser("GameStranger"));

    // Establish friendship between inviter and friend
    const fRes = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ addresseeId: friendId });
    const fid = fRes.body.friendshipId;
    await request(app)
      .post(`/api/friends/${fid}/accept`)
      .set("Authorization", `Bearer ${friendToken}`);

    // Create a game
    const puzzle = await createPuzzle(inviterToken);
    const gRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ puzzleId: puzzle.id });
    gameId = gRes.body.game.id;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/invite`)
      .send({ inviteeId: friendId });
    expect(res.status).toBe(401);
  });

  it("returns 400 when inviteeId is missing", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when inviting a non-friend", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ inviteeId: strangerId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/friend/i);
  });

  it("returns 404 when game not found", async () => {
    const res = await request(app)
      .post(`/api/games/${randomUUID()}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ inviteeId: friendId });
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-participant tries to invite", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/invite`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ inviteeId: friendId });
    expect(res.status).toBe(403);
  });

  it("returns 201 with inviteId for a valid invite to a friend", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ inviteeId: friendId });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("inviteId");
  });

  it("returns 409 when a pending invite already exists", async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ inviteeId: friendId });
    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/invites + POST /api/invites/:id/accept + /decline
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/invites", () => {
  let inviteeToken: string;

  beforeAll(async () => {
    let inviterToken: string;
    let inviterId: string;
    let inviteeId: string;
    ({ token: inviterToken, userId: inviterId } = await registerUser("InviteListInviter"));
    ({ token: inviteeToken, userId: inviteeId } = await registerUser("InviteListInvitee"));

    const fRes = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ addresseeId: inviteeId });
    await request(app)
      .post(`/api/friends/${fRes.body.friendshipId}/accept`)
      .set("Authorization", `Bearer ${inviteeToken}`);

    const puzzle = await createPuzzle(inviterToken);
    const gRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ puzzleId: puzzle.id });
    await request(app)
      .post(`/api/games/${gRes.body.game.id}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ inviteeId });
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/invites");
    expect(res.status).toBe(401);
  });

  it("returns 200 with invites array containing the pending invite", async () => {
    const res = await request(app)
      .get("/api/invites")
      .set("Authorization", `Bearer ${inviteeToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invites)).toBe(true);
    expect(res.body.invites.length).toBeGreaterThanOrEqual(1);
    const invite = res.body.invites[0];
    expect(invite).toHaveProperty("id");
    expect(invite).toHaveProperty("gameId");
    expect(invite).toHaveProperty("inviterDisplayName");
    expect(invite).toHaveProperty("puzzleTitle");
  });
});

describe("POST /api/invites/:id/accept", () => {
  let inviteeToken: string;
  let inviteId: string;
  let gameId: string;

  beforeAll(async () => {
    let inviterToken: string;
    let inviteeId: string;
    ({ token: inviterToken } = await registerUser("AcceptInviteInviter"));
    ({ token: inviteeToken, userId: inviteeId } = await registerUser("AcceptInviteInvitee"));

    const fRes = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ addresseeId: inviteeId });
    await request(app)
      .post(`/api/friends/${fRes.body.friendshipId}/accept`)
      .set("Authorization", `Bearer ${inviteeToken}`);

    const puzzle = await createPuzzle(inviterToken);
    const gRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ puzzleId: puzzle.id });
    gameId = gRes.body.game.id;

    const iRes = await request(app)
      .post(`/api/games/${gameId}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ inviteeId });
    inviteId = iRes.body.inviteId;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post(`/api/invites/${inviteId}/accept`);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid invite ID", async () => {
    const res = await request(app)
      .post("/api/invites/not-a-uuid/accept")
      .set("Authorization", `Bearer ${inviteeToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 200 with gameId for a valid accept", async () => {
    const res = await request(app)
      .post(`/api/invites/${inviteId}/accept`)
      .set("Authorization", `Bearer ${inviteeToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("gameId", gameId);
  });

  it("returns 404 when invite is no longer pending", async () => {
    const res = await request(app)
      .post(`/api/invites/${inviteId}/accept`)
      .set("Authorization", `Bearer ${inviteeToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/invites/:id/decline", () => {
  let inviteeToken: string;
  let inviteId: string;

  beforeAll(async () => {
    let inviterToken: string;
    let inviteeId: string;
    ({ token: inviterToken } = await registerUser("DeclineInviteInviter"));
    ({ token: inviteeToken, userId: inviteeId } = await registerUser("DeclineInviteInvitee"));

    const fRes = await request(app)
      .post("/api/friends/request")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ addresseeId: inviteeId });
    await request(app)
      .post(`/api/friends/${fRes.body.friendshipId}/accept`)
      .set("Authorization", `Bearer ${inviteeToken}`);

    const puzzle = await createPuzzle(inviterToken);
    const gRes = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ puzzleId: puzzle.id });

    const iRes = await request(app)
      .post(`/api/games/${gRes.body.game.id}/invite`)
      .set("Authorization", `Bearer ${inviterToken}`)
      .send({ inviteeId });
    inviteId = iRes.body.inviteId;
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post(`/api/invites/${inviteId}/decline`);
    expect(res.status).toBe(401);
  });

  it("returns 200 for a valid decline", async () => {
    const res = await request(app)
      .post(`/api/invites/${inviteId}/decline`)
      .set("Authorization", `Bearer ${inviteeToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });

  it("returns 404 for an already-declined invite", async () => {
    const res = await request(app)
      .post(`/api/invites/${inviteId}/decline`)
      .set("Authorization", `Bearer ${inviteeToken}`);
    expect(res.status).toBe(404);
  });
});
