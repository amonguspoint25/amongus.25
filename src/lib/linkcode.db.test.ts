import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { issueLinkCode, redeemLinkCode, LINK_CODE_TTL_MS } from "./linkcode";

async function makePlayer(tag: string) {
  const user = await prisma.user.create({ data: { discordId: tag, username: tag } });
  return prisma.player.create({ data: { userId: user.id, displayName: tag } });
}

describe("issueLinkCode / redeemLinkCode", () => {
  beforeEach(async () => {
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
  });

  it("issues a code with the expected expiry", async () => {
    const p = await makePlayer("issue1");
    const now = new Date("2026-06-24T12:00:00Z");
    const code = await issueLinkCode(p.id, now);
    const row = await prisma.player.findUnique({ where: { id: p.id } });
    expect(row!.linkCode).toBe(code);
    expect(row!.linkCodeExpiresAt!.getTime()).toBe(now.getTime() + LINK_CODE_TTL_MS);
  });

  it("redeems a valid code: links the player and clears the code", async () => {
    const p = await makePlayer("redeem1");
    const now = new Date();
    const code = await issueLinkCode(p.id, now);
    const res = await redeemLinkCode(code, now);
    expect(res).toEqual({ ok: true, playerId: p.id, discordId: "redeem1", displayName: "redeem1" });
    const row = await prisma.player.findUnique({ where: { id: p.id } });
    expect(row!.isLinked).toBe(true);
    expect(row!.linkCode).toBeNull();
    expect(row!.linkCodeExpiresAt).toBeNull();
  });

  it("rejects an expired code and does not link", async () => {
    const p = await makePlayer("redeem2");
    const issuedAt = new Date("2026-06-24T12:00:00Z");
    const code = await issueLinkCode(p.id, issuedAt);
    const later = new Date(issuedAt.getTime() + LINK_CODE_TTL_MS + 1000);
    const res = await redeemLinkCode(code, later);
    expect(res).toEqual({ ok: false });
    const row = await prisma.player.findUnique({ where: { id: p.id } });
    expect(row!.isLinked).toBe(false);
  });

  it("rejects an unknown / already-used code", async () => {
    const res = await redeemLinkCode("NOSUCH99", new Date());
    expect(res).toEqual({ ok: false });
  });
});
