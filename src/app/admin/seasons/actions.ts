"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { rolloverSeason } from "@/lib/season/season";

// End the active season and open the next one. Admin-only; safe to call when no
// season exists yet (creates Season 1).
export async function startNextSeasonAction(): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  await rolloverSeason(prisma);
  revalidatePath("/admin/seasons");
  revalidatePath("/leaderboard");
}
