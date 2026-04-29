import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import pool from "../db/pool";
import { pub, getSpectatorCount } from "../db/redis";
import { emitToUser } from "../ws/ioInstance";
import { requireAuth } from "../middleware/auth";
import { logger } from "../logger";

const router = Router();

const COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
];

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

// POST /api/games
router.post("/", requireAuth, async (req, res) => {
  const parsed = z.object({ puzzleId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { puzzleId } = parsed.data;
  const userId = req.user!.userId;

  const puzzleCheck = await pool.query("SELECT id FROM puzzles WHERE id = $1", [puzzleId]);
  if (!puzzleCheck.rows[0]) {
    res.status(404).json({ error: "Puzzle not found" });
    return;
  }

  // Generate unique room code
  let roomCode = "";
  for (let attempts = 0; attempts < 10; attempts++) {
    const candidate = generateRoomCode();
    const exists = await pool.query("SELECT id FROM games WHERE room_code = $1", [candidate]);
    if (!exists.rows[0]) {
      roomCode = candidate;
      break;
    }
  }
  if (!roomCode) {
    res.status(500).json({ error: "Could not generate unique room code" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameResult = await client.query(
      `INSERT INTO games (puzzle_id, room_code, status, created_by)
       VALUES ($1, $2, 'waiting', $3)
       RETURNING id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at`,
      [puzzleId, roomCode, userId]
    );
    const g = gameResult.rows[0];

    const color = COLORS[0];
    await client.query(
      `INSERT INTO game_participants (game_id, user_id, color) VALUES ($1, $2, $3)`,
      [g.id, userId, color]
    );
    await client.query("COMMIT");

    const game = {
      id: g.id,
      puzzleId: g.puzzle_id,
      roomCode: g.room_code,
      status: g.status,
      createdBy: g.created_by,
      startedAt: g.started_at,
      completedAt: g.completed_at,
      createdAt: g.created_at,
    };
    res.status(201).json({ game, roomCode: g.room_code });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/games/:id/join
router.post("/:id/join", requireAuth, async (req, res, next) => {
  try {
    const gameId = req.params.id;
    const userId = req.user!.userId;

    const gameResult = await pool.query(
      `SELECT id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at
       FROM games WHERE id = $1`,
      [gameId]
    );
    if (!gameResult.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    const g = gameResult.rows[0];
    if (g.status === "complete" || g.status === "abandoned" || g.status === "expired") {
      res.status(400).json({ error: "Game is no longer active" });
      return;
    }

    const existingParticipant = await pool.query(
      "SELECT id, game_id, user_id, joined_at, color FROM game_participants WHERE game_id = $1 AND user_id = $2",
      [gameId, userId]
    );
    if (existingParticipant.rows[0]) {
      const p = existingParticipant.rows[0];
      res.status(200).json({
        participant: {
          id: p.id,
          gameId: p.game_id,
          userId: p.user_id,
          joinedAt: p.joined_at,
          color: p.color,
        },
      });
      return;
    }

    // Pick a color not already used
    const usedColors = await pool.query(
      "SELECT color FROM game_participants WHERE game_id = $1",
      [gameId]
    );
    const usedSet = new Set(usedColors.rows.map((r: any) => r.color));
    const color = COLORS.find((c) => !usedSet.has(c)) ?? COLORS[usedColors.rows.length % COLORS.length];

    const participantResult = await pool.query(
      `INSERT INTO game_participants (game_id, user_id, color)
       VALUES ($1, $2, $3)
       RETURNING id, game_id, user_id, joined_at, color`,
      [gameId, userId, color]
    );
    const p = participantResult.rows[0];
    res.status(200).json({
      participant: {
        id: p.id,
        gameId: p.game_id,
        userId: p.user_id,
        joinedAt: p.joined_at,
        color: p.color,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/games/:id/abandon — creator-only; sets status to abandoned + broadcasts WS event
router.patch("/:id/abandon", requireAuth, async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid game ID" });
      return;
    }
    const gameId = idParsed.data;
    const userId = req.user!.userId;

    const gameResult = await pool.query(
      `SELECT id, status, created_by FROM games WHERE id = $1`,
      [gameId]
    );
    if (!gameResult.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    const g = gameResult.rows[0];

    if (g.created_by !== userId) {
      res.status(403).json({ error: "Only the game creator can abandon this game" });
      return;
    }
    if (g.status === "complete" || g.status === "abandoned" || g.status === "expired") {
      res.status(400).json({ error: "Game is already finished" });
      return;
    }

    await pool.query(
      `UPDATE games SET status = 'abandoned' WHERE id = $1`,
      [gameId]
    );

    // Broadcast game_abandoned to all players in the room via Redis pub/sub relay
    const payload = { gameId };
    await pub.publish(
      `channel:game:${gameId}`,
      JSON.stringify({ event: "game_abandoned", payload, sourceSocketId: "__server__" })
    );

    // Clean up Redis keys for the game
    const { deleteGameKeys } = await import("../db/redis");
    await deleteGameKeys(gameId).catch((err) =>
      logger.error({ err, gameId }, "Failed to delete Redis keys on abandon")
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/watchable — active games the current user is NOT a participant of
router.get("/watchable", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await pool.query(
      `SELECT g.id, g.puzzle_id, g.room_code, g.status, g.created_at, p.title AS puzzle_title,
              COUNT(gp.id)::int AS participant_count
       FROM games g
       JOIN puzzles p ON p.id = g.puzzle_id
       LEFT JOIN game_participants gp ON gp.game_id = g.id
       WHERE g.status IN ('waiting', 'active')
         AND NOT EXISTS (
           SELECT 1 FROM game_participants WHERE game_id = g.id AND user_id = $1
         )
       GROUP BY g.id, g.puzzle_id, g.room_code, g.status, g.created_at, p.title
       ORDER BY g.created_at DESC
       LIMIT 20`,
      [userId]
    );
    res.json({
      games: result.rows.map((r) => ({
        id: r.id,
        puzzleId: r.puzzle_id,
        roomCode: r.room_code,
        status: r.status,
        createdAt: r.created_at,
        puzzleTitle: r.puzzle_title,
        participantCount: r.participant_count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/my-active — games the current user is part of that aren't complete
router.get("/my-active", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await pool.query(
      `SELECT
         g.id,
         g.room_code,
         g.status,
         g.created_at,
         p.title      AS puzzle_title,
         COUNT(gp2.id)::int AS participant_count
       FROM games g
       JOIN game_participants gp  ON gp.game_id = g.id AND gp.user_id = $1
       JOIN puzzles p             ON p.id = g.puzzle_id
       JOIN game_participants gp2 ON gp2.game_id = g.id
       WHERE g.status IN ('waiting', 'active')
       GROUP BY g.id, g.room_code, g.status, g.created_at, p.title
       ORDER BY g.created_at DESC`,
      [userId]
    );
    res.json({
      games: result.rows.map((r) => ({
        id: r.id,
        roomCode: r.room_code,
        status: r.status,
        createdAt: r.created_at,
        puzzleTitle: r.puzzle_title,
        participantCount: r.participant_count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/games?roomCode=
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { roomCode } = req.query;
    if (!roomCode) { res.status(400).json({ error: "roomCode required" }); return; }
    const result = await pool.query(
      `SELECT id FROM games WHERE room_code = $1`, [String(roomCode).toUpperCase()]
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Game not found" }); return; }
    res.json({ game: { id: result.rows[0].id } });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/:id/spectators — current spectator count (Redis-only, no DB)
router.get("/:id/spectators", requireAuth, async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid game ID" });
      return;
    }
    const gameId = idParsed.data;
    const gameCheck = await pool.query("SELECT id FROM games WHERE id = $1", [gameId]);
    if (!gameCheck.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    const count = await getSpectatorCount(gameId);
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// GET /api/games/:id/history — move history for a game (participants only)
router.get("/:id/history", requireAuth, async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid game ID" });
      return;
    }
    const gameId = idParsed.data;
    const userId = req.user!.userId;

    const [gameResult, membership] = await Promise.all([
      pool.query(`SELECT id FROM games WHERE id = $1`, [gameId]),
      pool.query(
        "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
        [gameId, userId]
      ),
    ]);

    if (!gameResult.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    if (!membership.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    const movesResult = await pool.query(
      `SELECT id, game_id, user_id, row, col, value, created_at
       FROM game_moves
       WHERE game_id = $1
       ORDER BY created_at ASC`,
      [gameId]
    );

    const moves = movesResult.rows.map((m) => ({
      id: m.id,
      gameId: m.game_id,
      userId: m.user_id,
      row: m.row,
      col: m.col,
      value: m.value,
      createdAt: m.created_at,
    }));

    res.json({ moves, hasFull: moves.length > 0 });
  } catch (err) {
    next(err);
  }
});

// POST /api/games/:id/report
router.post("/:id/report", requireAuth, async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid game ID" });
      return;
    }
    const gameId = idParsed.data;
    const reporterId = req.user!.userId;

    const bodyParsed = z.object({
      reportedUserId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }).safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: bodyParsed.error.issues[0].message });
      return;
    }
    const { reportedUserId, reason } = bodyParsed.data;

    if (reportedUserId === reporterId) {
      res.status(400).json({ error: "You cannot report yourself" });
      return;
    }

    const gameCheck = await pool.query("SELECT id FROM games WHERE id = $1", [gameId]);
    if (!gameCheck.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    const reportedCheck = await pool.query("SELECT id FROM users WHERE id = $1", [reportedUserId]);
    if (!reportedCheck.rows[0]) {
      res.status(404).json({ error: "Reported user not found" });
      return;
    }

    await pool.query(
      `INSERT INTO game_reports (game_id, reporter_id, reported_user_id, reason)
       VALUES ($1, $2, $3, $4)`,
      [gameId, reporterId, reportedUserId, reason]
    );

    logger.info({ gameId, reporterId, reportedUserId }, "Player reported");
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/games/:id/invite — invite a friend to a game
router.post("/:id/invite", requireAuth, async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid game ID" });
      return;
    }
    const gameId = idParsed.data;
    const inviterId = req.user!.userId;

    const bodyParsed = z.object({ inviteeId: z.string().uuid() }).safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: bodyParsed.error.issues[0].message });
      return;
    }
    const { inviteeId } = bodyParsed.data;

    if (inviterId === inviteeId) {
      res.status(400).json({ error: "You cannot invite yourself" });
      return;
    }

    // Verify game exists, is active, and inviter is a participant
    const [gameResult, participantCheck, friendshipCheck] = await Promise.all([
      pool.query(
        "SELECT id, puzzle_id, status FROM games WHERE id = $1",
        [gameId]
      ),
      pool.query(
        "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
        [gameId, inviterId]
      ),
      pool.query(
        `SELECT 1 FROM friendships
         WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
           AND status = 'accepted'`,
        [inviterId, inviteeId]
      ),
    ]);

    if (!gameResult.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    const game = gameResult.rows[0];
    if (game.status !== "waiting" && game.status !== "active") {
      res.status(400).json({ error: "Game is no longer active" });
      return;
    }
    if (!participantCheck.rows[0]) {
      res.status(403).json({ error: "You are not a participant in this game" });
      return;
    }
    if (!friendshipCheck.rows[0]) {
      res.status(400).json({ error: "You can only invite friends" });
      return;
    }

    // Check invitee is not already in the game
    const alreadyParticipant = await pool.query(
      "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
      [gameId, inviteeId]
    );
    if (alreadyParticipant.rows[0]) {
      res.status(409).json({ error: "User is already in this game" });
      return;
    }

    // Check for existing pending invite
    const existingInvite = await pool.query(
      "SELECT id FROM game_invites WHERE game_id = $1 AND invitee_id = $2 AND status = 'pending'",
      [gameId, inviteeId]
    );
    if (existingInvite.rows[0]) {
      res.status(409).json({ error: "A pending invite already exists for this user" });
      return;
    }

    const inviteResult = await pool.query(
      `INSERT INTO game_invites (game_id, inviter_id, invitee_id) VALUES ($1, $2, $3) RETURNING id`,
      [gameId, inviterId, inviteeId]
    );
    const inviteId = inviteResult.rows[0].id as string;

    // Fetch puzzle title and inviter display name for WS payload
    const [puzzleResult, inviterResult] = await Promise.all([
      pool.query("SELECT title FROM puzzles WHERE id = $1", [game.puzzle_id]),
      pool.query("SELECT display_name FROM users WHERE id = $1", [inviterId]),
    ]);
    const puzzleTitle: string = puzzleResult.rows[0]?.title ?? "Unknown puzzle";
    const inviterDisplayName: string = inviterResult.rows[0]?.display_name ?? "Someone";

    const wsPayload = { inviteId, inviterId, inviterDisplayName, gameId, puzzleTitle };

    await emitToUser(inviteeId, "game_invite", wsPayload);
    await pub
      .publish(
        `channel:user:${inviteeId}`,
        JSON.stringify({ event: "game_invite", payload: wsPayload, sourceUserId: inviterId })
      )
      .catch((err) => logger.error({ err }, "Failed to publish game_invite"));

    logger.info({ inviteId, inviterId, inviteeId, gameId }, "Game invite sent");
    res.status(201).json({ inviteId });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const gameId = req.params.id;
    const isSpectate = req.query.spectate === "true";

    const gameResult = await pool.query(
      `SELECT id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at
       FROM games WHERE id = $1`,
      [gameId]
    );
    if (!gameResult.rows[0]) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    const g = gameResult.rows[0];

    if (!isSpectate) {
      const membership = await pool.query(
        "SELECT 1 FROM game_participants WHERE game_id = $1 AND user_id = $2",
        [gameId, req.user!.userId]
      );
      if (!membership.rows[0]) {
        res.status(404).json({ error: "Game not found" });
        return;
      }
    }

    const participantsResult = await pool.query(
      `SELECT gp.id, gp.game_id, gp.user_id, gp.joined_at, gp.color, u.display_name
       FROM game_participants gp
       JOIN users u ON u.id = gp.user_id
       WHERE gp.game_id = $1`,
      [gameId]
    );
    const cellsResult = await pool.query(
      `SELECT id, game_id, row, col, value, filled_by, filled_at FROM game_cells WHERE game_id = $1`,
      [gameId]
    );

    res.json({
      game: {
        id: g.id,
        puzzleId: g.puzzle_id,
        roomCode: g.room_code,
        status: g.status,
        createdBy: g.created_by,
        startedAt: g.started_at,
        completedAt: g.completed_at,
        createdAt: g.created_at,
      },
      participants: participantsResult.rows.map((p) => ({
        id: p.id,
        gameId: p.game_id,
        userId: p.user_id,
        joinedAt: p.joined_at,
        color: p.color,
        displayName: p.display_name,
      })),
      cells: cellsResult.rows.map((c) => ({
        id: c.id,
        gameId: c.game_id,
        row: c.row,
        col: c.col,
        value: c.value,
        filledBy: c.filled_by,
        filledAt: c.filled_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
