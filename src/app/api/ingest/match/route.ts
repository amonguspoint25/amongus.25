import { NextRequest, NextResponse } from "next/server";
import { bearerOk } from "@/lib/serverAuth";
import { matchPayloadSchema } from "@/lib/ingest/schema";
import { processMatch } from "@/lib/ingest/processMatch";

export async function POST(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = matchPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await processMatch(parsed.data);
  return NextResponse.json(result, { status: 200 });
}
