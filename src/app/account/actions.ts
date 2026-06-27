"use server";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";

// Permanently delete the signed-in user and ALL their data. Order matters: the player's
// dependent rows (match participations, per-season ratings) are RESTRICT-linked, so they
// must go before the Player; host keys cascade when the User is deleted.
export async function deleteMyAccount(): Promise<void> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) redirect("/");

  const user = await prisma.user.findUnique({ where: { discordId }, include: { player: true } });
  if (!user) redirect("/");

  await prisma.$transaction(async (tx) => {
    if (user.player) {
      await tx.matchParticipant.deleteMany({ where: { playerId: user.player.id } });
      await tx.playerSeason.deleteMany({ where: { playerId: user.player.id } });
      await tx.player.delete({ where: { id: user.player.id } });
    }
    await tx.user.delete({ where: { id: user.id } }); // cascades the user's host keys
  });

  await signOut({ redirectTo: "/" });
}
