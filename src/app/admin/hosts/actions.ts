"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { createHostKey, revokeHostKey } from "@/lib/hostkey";

export async function setHost(userId: string, isHost: boolean): Promise<void> {
  if (!(await requireAdmin())) return;
  await prisma.user.update({ where: { id: userId }, data: { isHost } });
  revalidatePath("/admin/hosts");
}

// Returns the raw key ONCE so the page can show it; it is never retrievable again.
export async function mintHostKey(userId: string, label: string): Promise<string | null> {
  if (!(await requireAdmin())) return null;
  const { raw } = await createHostKey(userId, label || "host");
  revalidatePath("/admin/hosts");
  return raw;
}

export async function revokeKey(id: string): Promise<void> {
  if (!(await requireAdmin())) return;
  await revokeHostKey(id);
  revalidatePath("/admin/hosts");
}
