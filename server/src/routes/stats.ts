import { Router } from "express";
import { z } from "zod";
import { getUserProfile, computeUserStats, getFriendsForProfile, areUsersFriends } from "../db/stats";
import { logger } from "../logger";

const router = Router();

// GET /api/users/:userId/stats — optional auth; public profiles visible to all
router.get("/:userId/stats", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.userId);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const targetUserId = idParsed.data;
    const viewerUserId = req.user?.userId ?? null;

    const profile = await getUserProfile(targetUserId);
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const isPrivate = !profile.isSearchable;
    const isOwnProfile = viewerUserId === targetUserId;
    let viewerIsFriend = false;

    if (isPrivate && viewerUserId && !isOwnProfile) {
      viewerIsFriend = await areUsersFriends(viewerUserId, targetUserId);
    }

    const canViewFull = !isPrivate || viewerIsFriend || isOwnProfile;

    const [stats, friends] = canViewFull
      ? await Promise.all([
          computeUserStats(targetUserId),
          getFriendsForProfile(targetUserId),
        ])
      : [{ gamesPlayed: 0, gamesCompleted: 0, averageCompletionTimeSeconds: null }, []];

    logger.debug({ targetUserId, viewerUserId, isPrivate, canViewFull }, "User stats fetched");

    res.json({
      user: { id: profile.id, displayName: profile.displayName },
      stats,
      friends,
      isPrivate,
      viewerIsFriend,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
