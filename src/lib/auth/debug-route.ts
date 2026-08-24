import { authorizeAdminRequest } from "@/lib/auth/admin-route";

type DebugAuthorization =
  | { authorized: true; userId: string }
  | {
      authorized: false;
      status: 401 | 403 | 404;
      error: "Unauthorized" | "Forbidden" | "Not found";
    };

export function isDebugApiEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.NODE_ENV !== "production" || environment.ENABLE_DEBUG_API === "true";
}

export async function authorizeDebugRequest(
  environment: Record<string, string | undefined> = process.env,
): Promise<DebugAuthorization> {
  const authorization = await authorizeAdminRequest();
  if (!authorization.authorized) {
    return {
      authorized: false,
      status: authorization.status,
      error: authorization.status === 401 ? "Unauthorized" : "Forbidden",
    };
  }
  if (!isDebugApiEnabled(environment)) {
    return { authorized: false, status: 404, error: "Not found" };
  }
  return authorization;
}
