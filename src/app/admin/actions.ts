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

// Grant admin to another user by Discord username (existing admins only). Usernames are
// not unique on Discord, so this targets the first case-insensitive match.
export async function grantAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const username = String(formData.get("username") ?? "").trim();
  if (!username) redirect("/admin");

  const target = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  if (target) await prisma.user.update({ where: { id: target.id }, data: { isAdmin: true } });

  revalidatePath("/admin");
  redirect(target ? `/admin?granted=${encodeURIComponent(username)}` : `/admin?nouser=${encodeURIComponent(username)}`);
}

// Revoke admin from a user (existing admins only). Never lets the last admin remove
// admin access — there must always be at least one.
export async function revokeAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return;
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin");

  await prisma.$transaction(async (tx) => {
    const adminCount = await tx.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) return; // refuse to remove the last admin
    await tx.user.update({ where: { id: userId }, data: { isAdmin: false } });
  });
  revalidatePath("/admin");
  redirect("/admin");
}
