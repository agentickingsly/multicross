import pool from "../db/pool";
import { deleteGameKeys } from "../db/redis";
import { logger } from "../logger";

const WAITING_TTL_HOURS = 24;
const ACTIVE_TTL_DAYS = 7;
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Marks stale games as 'expired' and cleans up their Redis keys.
 *
 * - waiting games with no activity for > 24 h → expired
 * - active games with no activity for > 7 days → expired
 *
 * Exported so integration tests can call it directly.
 */
export async function runExpiryJob(): Promise<void> {
  const result = await pool.query<{ id: string; reason: string }>(`
    WITH candidates AS (
      SELECT
        id,
        CASE
          WHEN status = 'waiting' THEN 'inactive_waiting'
          WHEN status = 'active'  THEN 'inactive_active'
        END AS reason
      FROM games
      WHERE
        (status = 'waiting' AND last_activity_at < now() - interval '${WAITING_TTL_HOURS} hours')
        OR
        (status = 'active'  AND last_activity_at < now() - interval '${ACTIVE_TTL_DAYS} days')
    )
    UPDATE games g
    SET status = 'expired'
    FROM candidates c
    WHERE g.id = c.id
    RETURNING g.id, c.reason
  `);

  for (const { id, reason } of result.rows) {
    logger.info({ gameId: id, reason }, "[expiry] game expired");
    try {
      await deleteGameKeys(id);
    } catch (err) {
      logger.error({ err, gameId: id }, "[expiry] failed to delete Redis keys");
    }
  }
}

/**
 * Starts the hourly expiry job.  Returns the interval handle so callers can
 * clear it (useful in tests or clean shutdown).
 */
export function startExpiryJob(): NodeJS.Timeout {
  runExpiryJob().catch((err) =>
    logger.error({ err }, "[expiry] startup run failed")
  );
  return setInterval(() => {
    runExpiryJob().catch((err) =>
      logger.error({ err }, "[expiry] periodic run failed")
    );
  }, INTERVAL_MS);
}
