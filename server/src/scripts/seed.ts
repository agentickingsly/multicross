import "dotenv/config";
import pool from "../db/pool";

async function seed(): Promise<void> {
  console.log("Seed script — not yet implemented.");
  // TODO: Session 5 — insert sample puzzles from .puz / .ipuz files
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
