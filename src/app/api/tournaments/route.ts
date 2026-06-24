import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createTournament } from "@/lib/tournament/create";

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const { name, slug, playerIds } = body ?? {};
  if (typeof name !== "string" || typeof slug !== "string" || !Array.isArray(playerIds) || playerIds.length < 2) {
    return NextResponse.json({ error: "name, slug, and >=2 playerIds required" }, { status: 400 });
  }
  try {
    const t = await createTournament({ name, slug, playerIds });
    return NextResponse.json({ id: t.id, slug: t.slug }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
