import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/db";

// Ensures a Player exists for the user, idempotently. Players start with no link
// code; they generate one on demand from /link. The only collision possible here is
// a concurrent sign-in creating the same userId — treat that as success.
async function ensurePlayer(userId: string, displayName: string): Promise<void> {
  const existing = await prisma.player.findUnique({ where: { userId } });
  if (existing) return;
  try {
    await prisma.player.create({ data: { userId, displayName } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return; // userId created by a concurrent sign-in
    throw err;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Pin cookie security so the PKCE cookie's encryption salt (derived from the
  // cookie name) is identical on the signin and callback requests; without this,
  // per-request secure-context detection can flip the cookie name and break PKCE
  // decryption ("pkceCodeVerifier could not be parsed").
  // Fail CLOSED in production: always require Secure cookies there, even if
  // AUTH_URL is misconfigured. Only http dev (localhost) gets non-secure cookies.
  useSecureCookies:
    process.env.NODE_ENV === "production"
      ? true
      : (process.env.AUTH_URL ?? "").startsWith("https://"),
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
