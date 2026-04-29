import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { logger } from "../logger";

const COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
];

const router = Router();

// GET /api/invites — list pending game invites for the current user
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await pool.query(
      `SELECT gi.id, gi.game_id, gi.inviter_id, gi.created_at,
              u.display_name AS inviter_display_name,
              p.title        AS puzzle_title,
              g.status       AS game_status
       FROM game_invites gi
       JOIN users u   ON u.id = gi.inviter_id
       JOIN games g   ON g.id = gi.game_id
       JOIN puzzles p ON p.id = g.puzzle_id
       WHERE gi.invitee_id = $1
         AND gi.status = 'pending'
         AND g.status IN ('waiting', 'active')
       ORDER BY gi.created_at DESC`,
      [userId]
    );
    res.json({
      invites: result.rows.map((r) => ({
        id: r.id,
        gameId: r.game_id,
        inviterId: r.inviter_id,
        inviterDisplayName: r.inviter_display_name,
        puzzleTitle: r.puzzle_title,
        gameStatus: r.game_status,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/invites/:id/accept — accept a game invite and join the game
router.post("/:id/accept", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid invite ID" });
      return;
    }
    const inviteId = idParsed.data;
    const userId = req.user!.userId;

    // Fetch and verify the invite in one query
    const inviteResult = await pool.query(
      `SELECT gi.game_id, g.status AS game_status
       FROM game_invites gi
       JOIN games g ON g.id = gi.game_id
       WHERE gi.id = $1 AND gi.invitee_id = $2 AND gi.status = 'pending'`,
      [inviteId, userId]
    );
    if (!inviteResult.rows[0]) {
      res.status(404).json({ error: "Pending invite not found" });
      return;
    }
    const { game_id: gameId, game_status: gameStatus } = inviteResult.rows[0];

    if (gameStatus !== "waiting" && gameStatus !== "active") {
      res.status(400).json({ error: "Game is no longer active" });
      return;
    }

    // Mark invite accepted and join the game in a transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE game_invites SET status = 'accepted', updated_at = now() WHERE id = $1`,
        [inviteId]
      );

      const existingParticipant = await client.query(
        "SELECT id FROM game_participants WHERE game_id = $1 AND user_id = $2",
        [gameId, userId]
      );

      if (!existingParticipant.rows[0]) {
        const usedColors = await client.query(
          "SELECT color FROM game_participants WHERE game_id = $1",
          [gameId]
        );
        const usedSet = new Set(usedColors.rows.map((r: { color: string }) => r.color));
        const color =
          COLORS.find((c) => !usedSet.has(c)) ??
          COLORS[usedColors.rows.length % COLORS.length];

        await client.query(
          "INSERT INTO game_participants (game_id, user_id, color) VALUES ($1, $2, $3)",
          [gameId, userId, color]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    logger.info({ inviteId, userId, gameId }, "Game invite accepted");
    res.json({ success: true, gameId });
  } catch (err) {
    next(err);
  }
});

// POST /api/invites/:id/decline
router.post("/:id/decline", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid invite ID" });
      return;
    }
    const userId = req.user!.userId;

    const result = await pool.query(
      `UPDATE game_invites SET status = 'declined', updated_at = now()
       WHERE id = $1 AND invitee_id = $2 AND status = 'pending'
       RETURNING id`,
      [idParsed.data, userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Pending invite not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
