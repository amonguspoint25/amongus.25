import { NextRequest, NextResponse } from "next/server";
import { matchPayloadSchema } from "@/lib/ingest/schema";
import { processMatch } from "@/lib/ingest/processMatch";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.INGEST_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = matchPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await processMatch(parsed.data);
  return NextResponse.json(result, { status: 200 });
}
