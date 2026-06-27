"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canRegenerate, issueLinkCode } from "@/lib/linkcode";
import { normalizeFriendCode } from "@/lib/friendCode";

// Register (or change) the signed-in user's Among Us friend code. The host mod reads
// every lobby player's friend code (see /api/lobby/roster) and uses this mapping to
// attribute matches — no in-game code to type, so mobile players work too.
// ponytail: claim-first model — a friend code is semi-public (EHR's /pi exposes it),
// so v1 trusts the unique constraint (one account per code). Future hardening:
// confirm ownership via an in-lobby challenge before marking isLinked.
export async function setFriendCode(formData: FormData): Promise<void> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) redirect("/link");

  const player = await prisma.player.findFirst({ where: { user: { discordId } } });
  if (!player) redirect("/link");

  const friendCode = normalizeFriendCode(formData.get("friendCode"));
  if (!friendCode) redirect("/link?fc=invalid");

  try {
    await prisma.player.update({
      where: { id: player.id },
      data: { friendCode, isLinked: true },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") redirect("/link?fc=taken");
    throw err;
  }
  revalidatePath("/link");
  redirect("/link?fc=ok");
}

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
