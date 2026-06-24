import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/db";

function genCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Discord],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;
      const discordId = String(profile.id);
      const username = String(
        (profile as { global_name?: string }).global_name ??
          profile.username ??
          "player"
      );
      const avatar =
        (profile as { image_url?: string }).image_url ?? null;
      const user = await prisma.user.upsert({
        where: { discordId },
        update: { username, avatar },
        create: { discordId, username, avatar },
      });
      await prisma.player.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          displayName: username,
          linkCode: genCode(),
        },
      });
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
