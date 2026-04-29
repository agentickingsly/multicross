import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { pub, getOnlineStatuses } from "../db/redis";
import { emitToUser } from "../ws/ioInstance";
import { logger } from "../logger";

const router = Router();

// GET /api/friends/requests — must be registered before /:id routes
router.get("/requests", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await pool.query(
      `SELECT f.id, f.requester_id, f.created_at, u.display_name
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );
    res.json({
      requests: result.rows.map((r) => ({
        friendshipId: r.id,
        requesterId: r.requester_id,
        displayName: r.display_name,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/friends/search?q= — must be registered before /:id routes
router.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ users: [] });
      return;
    }
    const userId = req.user!.userId;
    const result = await pool.query(
      `SELECT id, display_name FROM users
       WHERE display_name ILIKE $1 AND id != $2 AND is_banned = false
       ORDER BY display_name ASC
       LIMIT 10`,
      [`%${q}%`, userId]
    );
    res.json({
      users: result.rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/friends — list accepted friends with online status
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await pool.query(
      `SELECT f.id,
              CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS friend_id,
              u.display_name
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
       ORDER BY u.display_name ASC`,
      [userId]
    );

    const friendIds = result.rows.map((r) => r.friend_id as string);
    let onlineStatuses: Record<string, boolean> = {};
    try {
      onlineStatuses = await getOnlineStatuses(friendIds);
    } catch {
      // Online status is best-effort; omit on Redis error
    }

    res.json({
      friends: result.rows.map((r) => ({
        friendshipId: r.id,
        userId: r.friend_id,
        displayName: r.display_name,
        online: onlineStatuses[r.friend_id as string] ?? false,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/friends/request — send a friend request
router.post("/request", async (req, res, next) => {
  try {
    const parsed = z
      .object({ addresseeId: z.string().uuid() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { addresseeId } = parsed.data;
    const requesterId = req.user!.userId;

    if (requesterId === addresseeId) {
      res.status(400).json({ error: "You cannot send a friend request to yourself" });
      return;
    }

    const addresseeCheck = await pool.query(
      "SELECT id, display_name FROM users WHERE id = $1",
      [addresseeId]
    );
    if (!addresseeCheck.rows[0]) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check for existing friendship in either direction
    const existing = await pool.query(
      `SELECT id FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [requesterId, addresseeId]
    );
    if (existing.rows[0]) {
      res.status(409).json({ error: "A friendship or pending request already exists with this user" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2) RETURNING id`,
      [requesterId, addresseeId]
    );
    const friendshipId = result.rows[0].id as string;

    const requesterResult = await pool.query(
      "SELECT display_name FROM users WHERE id = $1",
      [requesterId]
    );
    const requesterDisplayName: string =
      requesterResult.rows[0]?.display_name ?? "Someone";

    const wsPayload = { friendshipId, requesterId, requesterDisplayName };

    // Emit directly to addressee's personal Socket.io room
    await emitToUser(addresseeId, "friend_request", wsPayload);

    // Publish for other server instances
    await pub
      .publish(
        `channel:user:${addresseeId}`,
        JSON.stringify({ event: "friend_request", payload: wsPayload, sourceUserId: requesterId })
      )
      .catch((err) => logger.error({ err }, "Failed to publish friend_request"));

    logger.info({ friendshipId, requesterId, addresseeId }, "Friend request sent");
    res.status(201).json({ friendshipId });
  } catch (err) {
    next(err);
  }
});

// POST /api/friends/:id/accept
router.post("/:id/accept", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid friendship ID" });
      return;
    }
    const userId = req.user!.userId;

    const result = await pool.query(
      `UPDATE friendships SET status = 'accepted', updated_at = now()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING id`,
      [idParsed.data, userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Pending request not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/friends/:id/decline
router.post("/:id/decline", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid friendship ID" });
      return;
    }
    const userId = req.user!.userId;

    const result = await pool.query(
      `UPDATE friendships SET status = 'declined', updated_at = now()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING id`,
      [idParsed.data, userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Pending request not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/friends/:id — remove an accepted friend
router.delete("/:id", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid friendship ID" });
      return;
    }
    const userId = req.user!.userId;

    const result = await pool.query(
      `DELETE FROM friendships
       WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2) AND status = 'accepted'
       RETURNING id`,
      [idParsed.data, userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Friendship not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
