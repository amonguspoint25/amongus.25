"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

// Bootstrap the FIRST admin. Works only while zero admins exist, then locks forever.
// Any signed-in user can claim until someone does — the site owner claims right after
// deploy. The flip is a single atomic conditional UPDATE (admins-count = 0 in the WHERE),
// so the check-then-act window is one statement, not app-level read-then-write.
// ponytail: under READ COMMITTED two truly-simultaneous claims could still both pass;
// negligible for a one-time bootstrap and revocable from the panel.
export async function claimAdminAction(): Promise<void> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return;
  await prisma.$executeRaw`
    UPDATE "User" SET "isAdmin" = true
    WHERE "discordId" = ${discordId}
      AND (SELECT COUNT(*) FROM "User" WHERE "isAdmin" = true) = 0`;
  revalidatePath("/admin");
  redirect("/admin");
}

// Grant admin to another user by Discord username (existing admins only). Discord
// usernames are NOT unique, so refuse when more than one account matches — granting to
// the wrong person is a privilege-escalation hazard. The admin must disambiguate.
export async function grantAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const username = String(formData.get("username") ?? "").trim();
  if (!username) redirect("/admin");

  const matches = await prisma.user.findMany({
    where: { username: { equals: username, mode: "insensitive" } },
    take: 2,
    select: { id: true },
  });
  if (matches.length === 0) redirect(`/admin?nouser=${encodeURIComponent(username)}`);
  if (matches.length > 1) redirect(`/admin?ambiguous=${encodeURIComponent(username)}`);

  await prisma.user.update({ where: { id: matches[0].id }, data: { isAdmin: true } });
  revalidatePath("/admin");
  redirect(`/admin?granted=${encodeURIComponent(username)}`);
}

// Revoke admin from a user (existing admins only). Never lets the last admin remove
// admin access — there must always be at least one.
export async function revokeAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin");

  // Atomic last-admin guard: a single conditional UPDATE flips isAdmin off only while
  // more than one admin exists. No check-then-act window, so concurrent revokes of
  // different admins can never both succeed and drain the admin list to zero. Affects
  // 0 rows for the last admin or a bad userId (no crash).
  await prisma.$executeRaw`
    UPDATE "User" SET "isAdmin" = false
    WHERE "id" = ${userId}
      AND "isAdmin" = true
      AND (SELECT COUNT(*) FROM "User" WHERE "isAdmin" = true) > 1`;
  revalidatePath("/admin");
  redirect("/admin");
}
