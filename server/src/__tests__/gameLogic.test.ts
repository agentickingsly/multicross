import pool from "../db/pool";
import { generateRoomCode } from "../routes/games";

vi.mock("../db/redis", () => ({
  pub: { publish: vi.fn().mockResolvedValue(0) },
  deleteGameKeys: vi.fn().mockResolvedValue(undefined),
}));

afterAll(() => pool.end());

const ALLOWED_CHARS = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""));

describe("generateRoomCode", () => {
  it("returns exactly 6 characters", () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it("only contains characters from the allowed set", () => {
    const code = generateRoomCode();
    for (const char of code) {
      expect(ALLOWED_CHARS.has(char)).toBe(true);
    }
  });

  it("returns different values on consecutive calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
