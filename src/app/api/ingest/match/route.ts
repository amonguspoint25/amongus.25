import { NextRequest, NextResponse } from "next/server";
import { authorizeIngest } from "@/lib/hostkey";
import { matchPayloadSchema } from "@/lib/ingest/schema";
import { processMatch } from "@/lib/ingest/processMatch";
import { announceMatch } from "@/lib/discord/announce";
import { matchAnnounceEmbed } from "@/lib/discord/embeds";

export async function POST(req: NextRequest) {
  if (!(await authorizeIngest(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = matchPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await processMatch(parsed.data);

  // Auto-announce a freshly recorded match to Discord (best-effort; never blocks/breaks ingest).
  // Empty results = idempotent re-send or dropped match, so there's nothing to announce.
  if (result.matchId && result.results.length > 0) {
    await announceMatch(
      matchAnnounceEmbed(
        parsed.data.outcome,
        parsed.data.map ?? null,
        result.results.map((r) => ({ name: r.name, role: r.role, eloDelta: r.eloDelta })),
      ),
    );
  }

  return NextResponse.json(result, { status: 200 });
}
