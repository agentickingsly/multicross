import pool from "./pool";

export interface UserProfile {
  id: string;
  displayName: string;
  isSearchable: boolean;
}

export interface UserStats {
  gamesPlayed: number;
  gamesCompleted: number;
  averageCompletionTimeSeconds: number | null;
}

export interface ProfileFriend {
  userId: string;
  displayName: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const result = await pool.query(
    `SELECT id, display_name, is_searchable FROM users WHERE id = $1 AND is_banned = false`,
    [userId]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    isSearchable: row.is_searchable as boolean,
  };
}

export async function computeUserStats(userId: string): Promise<UserStats> {
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT gp.game_id)::int AS games_played,
       COUNT(DISTINCT CASE WHEN g.status = 'complete' THEN gp.game_id END)::int AS games_completed,
       AVG(
         CASE
           WHEN g.status = 'complete'
             AND g.started_at IS NOT NULL
             AND g.completed_at IS NOT NULL
           THEN EXTRACT(EPOCH FROM (g.completed_at - g.started_at))
         END
       ) AS avg_completion_seconds
     FROM game_participants gp
     JOIN games g ON g.id = gp.game_id
     WHERE gp.user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  return {
    gamesPlayed: (row.games_played as number) ?? 0,
    gamesCompleted: (row.games_completed as number) ?? 0,
    averageCompletionTimeSeconds:
      row.avg_completion_seconds != null
        ? Number(row.avg_completion_seconds)
        : null,
  };
}

export async function getFriendsForProfile(userId: string): Promise<ProfileFriend[]> {
  const result = await pool.query(
    `SELECT
       CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS friend_id,
       u.display_name
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
     ORDER BY u.display_name ASC`,
    [userId]
  );
  return result.rows.map((r) => ({
    userId: r.friend_id as string,
    displayName: r.display_name as string,
  }));
}

export async function areUsersFriends(userId1: string, userId2: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM friendships
     WHERE status = 'accepted'
       AND (
         (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)
       )`,
    [userId1, userId2]
  );
  return result.rows.length > 0;
}
