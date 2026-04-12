import { generateRoomCode } from "../routes/games";

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
