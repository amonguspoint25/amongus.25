import { describe, it, expect } from "vitest";
import {
  genCode,
  isExpired,
  canRegenerate,
  LINK_CODE_TTL_MS,
  LINK_CODE_COOLDOWN_MS,
} from "./linkcode";

describe("genCode", () => {
  it("returns 8 chars from the unambiguous alphabet", () => {
    const code = genCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });
});

describe("isExpired", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  it("is true when there is no code", () => {
    expect(isExpired(null, now)).toBe(true);
  });
  it("is true at or past the expiry instant", () => {
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });
  it("is false while the code is still valid", () => {
    expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });
});

describe("canRegenerate", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  const expiresFor = (issuedMsAgo: number) =>
    new Date(now.getTime() - issuedMsAgo + LINK_CODE_TTL_MS);
  it("allows when there is no code", () => {
    expect(canRegenerate(null, now)).toBe(true);
  });
  it("blocks within the cooldown of a fresh code", () => {
    expect(canRegenerate(expiresFor(0), now)).toBe(false);
    expect(canRegenerate(expiresFor(LINK_CODE_COOLDOWN_MS - 1), now)).toBe(false);
  });
  it("allows once the cooldown has passed", () => {
    expect(canRegenerate(expiresFor(LINK_CODE_COOLDOWN_MS), now)).toBe(true);
  });
  it("allows when the code has already expired", () => {
    expect(canRegenerate(new Date(now.getTime() - 1000), now)).toBe(true);
  });
});

it("locks the TTL and cooldown values", () => {
  expect(LINK_CODE_TTL_MS).toBe(15 * 60 * 1000);
  expect(LINK_CODE_COOLDOWN_MS).toBe(30 * 1000);
});
