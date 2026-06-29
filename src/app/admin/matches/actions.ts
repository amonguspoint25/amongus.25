"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { recomputeAll } from "@/lib/ingest/recompute";

// Void (or un-void) a match, then rebuild all ratings so the change is reflected exactly.
// The flag flip + full recompute run in one transaction (generous timeout for the replay),
// so ratings can never be left half-updated.
export async function toggleMatchVoidedAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;

  const matchId = String(formData.get("matchId") ?? "");
  const voided = formData.get("voided") === "true";
  if (!matchId) return;

  await prisma.$transaction(
    async (tx) => {
      await tx.match.update({
        where: { id: matchId },
        data: { voided, voidedAt: voided ? new Date() : null },
      });
      await recomputeAll(tx);
    },
    { timeout: 60_000 },
  );

  revalidatePath("/admin/matches");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
}
