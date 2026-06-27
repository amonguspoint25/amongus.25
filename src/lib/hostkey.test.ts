import { describe, it, expect } from "vitest";
import { genHostKey, hashToken, parseBearer } from "./hostkey";

describe("host key crypto", () => {
  it("genHostKey returns a prefixed raw secret, its sha256 hash, and a display prefix", () => {
    const { raw, tokenHash, tokenPrefix } = genHostKey();
    expect(raw.startsWith("amrk_")).toBe(true);
    expect(raw.length).toBeGreaterThanOrEqual(24);
    expect(tokenHash).toBe(hashToken(raw));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw.startsWith(tokenPrefix)).toBe(true);
    expect(tokenPrefix.length).toBeLessThan(raw.length);
  });

  it("genHostKey is unique per call", () => {
    expect(genHostKey().raw).not.toBe(genHostKey().raw);
  });

  it("hashToken is deterministic and differs for different inputs", () => {
    expect(hashToken("a")).toBe(hashToken("a"));
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("parseBearer extracts the token after 'Bearer '", () => {
    expect(parseBearer("Bearer abc123")).toBe("abc123");
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
  });
});
