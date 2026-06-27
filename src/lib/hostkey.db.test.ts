import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { createHostKey, resolveHostKey, revokeHostKey, authorizeIngest } from "./hostkey";

async function makeHost(tag: string) {
  return prisma.user.create({ data: { discordId: tag, username: tag, isHost: true } });
}

describe("host key DB functions", () => {
  beforeEach(async () => {
    // Clean the full FK chain (Player/Match → User) like the other DB tests, so
    // leftover rows from other suites don't block user.deleteMany.
    await prisma.hostKey.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.playerSeason.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
    await prisma.season.deleteMany();
  });

  it("createHostKey stores a hash (not the raw) and returns the raw once", async () => {
    const host = await makeHost("h1");
    const { id, raw, tokenPrefix } = await createHostKey(host.id, "Cole PC");
    const row = await prisma.hostKey.findUnique({ where: { id } });
    expect(row!.tokenHash).not.toBe(raw);          // raw never stored
    expect(row!.tokenPrefix).toBe(tokenPrefix);
    expect(row!.label).toBe("Cole PC");
  });

  it("resolveHostKey returns the key for a valid bearer and bumps lastUsedAt", async () => {
    const host = await makeHost("h2");
    const { raw } = await createHostKey(host.id, "PC");
    const key = await resolveHostKey(`Bearer ${raw}`);
    expect(key?.hostUserId).toBe(host.id);
    expect(key?.lastUsedAt).not.toBeNull();
  });

  it("resolveHostKey rejects unknown and revoked keys", async () => {
    const host = await makeHost("h3");
    const { id, raw } = await createHostKey(host.id, "PC");
    expect(await resolveHostKey("Bearer amrk_nope")).toBeNull();
    await revokeHostKey(id);
    expect(await resolveHostKey(`Bearer ${raw}`)).toBeNull();
  });

  it("authorizeIngest accepts a host key and still accepts INGEST_TOKEN", async () => {
    const host = await makeHost("h5");
    const { raw } = await createHostKey(host.id, "PC");
    expect(await authorizeIngest(`Bearer ${raw}`)).toBe(true);

    const prev = process.env.INGEST_TOKEN;
    process.env.INGEST_TOKEN = "demo-token";
    expect(await authorizeIngest("Bearer demo-token")).toBe(true);
    expect(await authorizeIngest("Bearer wrong")).toBe(false);
    process.env.INGEST_TOKEN = prev;
  });
});
