import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/db";

function genCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

// linkCode is @unique; on the (astronomically rare) collision, retry rather
// than crash the sign-in. Ensures a Player exists for the user, idempotently.
async function ensurePlayer(userId: string, displayName: string): Promise<void> {
  const existing = await prisma.player.findUnique({ where: { userId } });
  if (existing) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.player.create({ data: { userId, displayName, linkCode: genCode() } });
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002" && attempt < 4) continue; // linkCode collision: regenerate
      if (code === "P2002") return; // userId already created by a concurrent sign-in
      throw err;
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Discord],
  callbacks: {
    async signIn({ user: authUser, profile }) {
      if (!profile?.id) return false;
      const discordId = String(profile.id);
      const username = String(
        (profile as { global_name?: string }).global_name ??
          profile.username ??
          "player"
      );
      // Auth.js normalizes the full Discord avatar URL onto `user.image`.
      const avatar = authUser?.image ?? null;
      const user = await prisma.user.upsert({
        where: { discordId },
        update: { username, avatar },
        create: { discordId, username, avatar },
      });
      await ensurePlayer(user.id, username);
      return true;
    },
    async jwt({ token, profile }) {
      if (profile?.id) token.discordId = String(profile.id);
      return token;
    },
    async session({ session, token }) {
      if (token.discordId && session.user) {
        (session.user as { id?: string }).id = String(token.discordId);
      }
      return session;
    },
  },
});
