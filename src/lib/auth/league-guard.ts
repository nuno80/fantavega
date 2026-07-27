import { db } from "@/lib/db";

export async function hasLeagueAccess(
  userId: string,
  leagueId: number,
  role?: string
): Promise<boolean> {
  if (role === "admin") return true;
  const result = await db.execute({
    sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ? LIMIT 1",
    args: [leagueId, userId],
  });
  return result.rows.length > 0;
}

export async function requireLeagueAccess(
  userId: string,
  leagueId: number,
  role?: string
): Promise<void> {
  if (!(await hasLeagueAccess(userId, leagueId, role))) {
    throw new Error("League access denied");
  }
}
