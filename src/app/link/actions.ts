"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canRegenerate, issueLinkCode } from "@/lib/linkcode";

// Generate (or regenerate) the signed-in user's link code. Regenerating replaces any
// existing code immediately. Throttled by a short cooldown derived from the expiry.
export async function generateLinkCode(): Promise<void> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) redirect("/link");

  const player = await prisma.player.findFirst({ where: { user: { discordId } } });
  if (!player) redirect("/link");

  const now = new Date();
  if (!canRegenerate(player.linkCodeExpiresAt, now)) redirect("/link?slow=1");

  await issueLinkCode(player.id, now);
  revalidatePath("/link");
}
