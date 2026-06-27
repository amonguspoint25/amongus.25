"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { armHost, disarmHost } from "@/lib/hostkey";

async function currentHostUserId(): Promise<string | null> {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) return null;
  const user = await prisma.user.findUnique({ where: { discordId } });
  return user?.isHost ? user.id : null;
}

export async function armRanked(): Promise<void> {
  const id = await currentHostUserId();
  if (!id) redirect("/");
  await armHost(id, new Date());
  revalidatePath("/host");
}

export async function disarmRanked(): Promise<void> {
  const id = await currentHostUserId();
  if (!id) redirect("/");
  await disarmHost(id);
  revalidatePath("/host");
}
