import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import {
  createHostKey, resolveHostKey, revokeHostKey,
  armHost, disarmHost, hostStatus, authorizeIngest,
} from "./hostkey";

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
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
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

  it("armHost arms the host's keys; status reflects armed then disarmed", async () => {
    const host = await makeHost("h4");
    const { raw } = await createHostKey(host.id, "PC");
    const now = new Date();

    let status = await hostStatus(`Bearer ${raw}`, now);
    expect(status).toEqual({ armed: false, armedUntil: null });

    const armedUntil = await armHost(host.id, now);
    status = await hostStatus(`Bearer ${raw}`, now);
    expect(status!.armed).toBe(true);
    expect(status!.armedUntil!.getTime()).toBe(armedUntil.getTime());

    // an armed key reads as not-armed once armedUntil has passed
    const later = new Date(armedUntil.getTime() + 1000);
    expect((await hostStatus(`Bearer ${raw}`, later))!.armed).toBe(false);

    await disarmHost(host.id);
    expect((await hostStatus(`Bearer ${raw}`, now))!.armed).toBe(false);
  });

  it("hostStatus returns null when the key is invalid", async () => {
    expect(await hostStatus("Bearer amrk_bad", new Date())).toBeNull();
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
