import { NextRequest, NextResponse } from "next/server";
import { resolveHostKey } from "@/lib/hostkey";

// Called by the host mod on load to validate its host key (security layer 2: the mod
// disables all ranked features unless this returns 200). 200 = valid, 401 = missing,
// fake, or revoked key.
export async function GET(req: NextRequest) {
  const key = await resolveHostKey(req.headers.get("authorization"));
  if (!key) return NextResponse.json({ valid: false }, { status: 401 });
  return NextResponse.json({ valid: true });
}
