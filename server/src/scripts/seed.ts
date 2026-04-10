import "dotenv/config";
import pool from "../db/pool";
import { logger } from "../logger";

async function seed(): Promise<void> {
  const { rows } = await pool.query("SELECT COUNT(*) FROM puzzles");
  if (parseInt(rows[0].count) > 0) {
    console.log("Database already seeded, skipping");
    await pool.end();
    process.exit(0);
  }

  logger.info("Seed script — not yet implemented.");
  // TODO: Session 5 — insert sample puzzles from .puz / .ipuz files
  await pool.end();
}

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
