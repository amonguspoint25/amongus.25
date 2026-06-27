import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// The signed-in user's row + role flags, deduplicated per request via React cache().
// Nav (every page) and requireAdmin (admin pages) both need this — without the cache
// that's two identical DB round-trips per admin page render. Returns null when signed out.
export const getSessionUser = cache(async () => {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return null;
  return prisma.user.findUnique({
    where: { discordId },
    select: { id: true, username: true, isAdmin: true, isHost: true },
  });
});
