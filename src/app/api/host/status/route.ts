import { NextRequest, NextResponse } from "next/server";
import { hostStatus } from "@/lib/hostkey";

// Polled by the host mod (Authorization: Bearer <host key>) to learn if ranked is on.
export async function GET(req: NextRequest) {
  const status = await hostStatus(req.headers.get("authorization"), new Date());
  if (!status) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ armed: status.armed, armedUntil: status.armedUntil });
}
