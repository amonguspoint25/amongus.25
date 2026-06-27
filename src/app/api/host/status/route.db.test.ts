import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createHostKey, revokeHostKey } from "@/lib/hostkey";
import { GET } from "./route";

function req(auth: string | null) {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("http://test/api/host/status", { headers }) as unknown as import("next/server").NextRequest;
}

describe("GET /api/host/status (host key validation)", () => {
  beforeEach(async () => {
    await prisma.hostKey.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.match.deleteMany();
    await prisma.playerSeason.deleteMany();
    await prisma.player.deleteMany();
    await prisma.user.deleteMany();
    await prisma.season.deleteMany();
  });

  it("returns 401 without a key", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it("returns 200 valid for a good key, 401 once revoked", async () => {
    const host = await prisma.user.create({ data: { discordId: "s1", username: "s1", isHost: true } });
    const { id, raw } = await createHostKey(host.id, "PC");

    let res = await GET(req(`Bearer ${raw}`));
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(true);

    await revokeHostKey(id);
    res = await GET(req(`Bearer ${raw}`));
    expect(res.status).toBe(401);
  });
});
