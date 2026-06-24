import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { matchPayloadSchema } from "@/lib/ingest/schema";
import { processMatch } from "@/lib/ingest/processMatch";

function safeEqual(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const token = process.env.INGEST_TOKEN;
  // Fail CLOSED: with no configured token, reject everything (never accept "Bearer undefined").
  if (!token) {
    return NextResponse.json({ error: "ingestion not configured" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("authorization"), `Bearer ${token}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = matchPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await processMatch(parsed.data);
  return NextResponse.json(result, { status: 200 });
}
