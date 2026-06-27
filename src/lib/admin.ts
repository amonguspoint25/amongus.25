import { getSessionUser } from "@/lib/sessionUser";

/** Returns the admin user (id/username/role flags) if the session is an admin, else null. */
export async function requireAdmin() {
  const user = await getSessionUser();
  return user?.isAdmin ? user : null;
}
