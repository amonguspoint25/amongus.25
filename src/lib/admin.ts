import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** Returns the admin User if the current session belongs to an admin, else null. */
export async function requireAdmin() {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return null;
  const user = await prisma.user.findUnique({ where: { discordId } });
  return user?.isAdmin ? user : null;
}
