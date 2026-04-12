import pool from "../db/pool";
import { runMigrations } from "../db/migrate";

beforeAll(async () => {
  await runMigrations();
}, 30_000);

afterAll(async () => {
  // Delete in FK-safe order: cells → participants → games → users
  await pool.query(`
    DELETE FROM game_cells
    WHERE game_id IN (
      SELECT g.id FROM games g
      JOIN users u ON u.id = g.created_by
      WHERE u.email LIKE '%@test.multicross'
    )
  `);
  await pool.query(`
    DELETE FROM game_participants
    WHERE game_id IN (
      SELECT g.id FROM games g
      JOIN users u ON u.id = g.created_by
      WHERE u.email LIKE '%@test.multicross'
    )
  `);
  await pool.query(`
    DELETE FROM games
    WHERE created_by IN (
      SELECT id FROM users WHERE email LIKE '%@test.multicross'
    )
  `);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@test.multicross'`);
});
