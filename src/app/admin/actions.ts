"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

// Bootstrap the FIRST admin. Works only while zero admins exist, then locks forever.
// Any signed-in user can claim until someone does — the site owner claims right after
// deploy. ponytail: a simultaneous double-claim could make two admins (count==0 read by
// both); harmless for a bootstrap and revocable from the panel.
export async function claimAdminAction(): Promise<void> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return;
  await prisma.$transaction(async (tx) => {
    const adminCount = await tx.user.count({ where: { isAdmin: true } });
    if (adminCount > 0) return; // already bootstrapped — claim is permanently closed
    await tx.user.update({ where: { discordId }, data: { isAdmin: true } });
  });
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
