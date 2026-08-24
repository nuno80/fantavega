import { currentUser } from "@clerk/nextjs/server";

export type AdminAuthorization =
  | { authorized: true; userId: string }
  | { authorized: false; status: 401 | 403 };

export async function authorizeAdminRequest(): Promise<AdminAuthorization> {
  const user = await currentUser();
  if (!user?.id) return { authorized: false, status: 401 };
  if (user.publicMetadata?.role !== "admin") return { authorized: false, status: 403 };
  return { authorized: true, userId: user.id };
}
