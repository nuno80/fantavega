// src/lib/db/services/user.service.ts v.2.0 (Async Turso Migration)
// getEligibleUsersForLeague ora restituisce nome e cognome per una migliore UX.
// 1. Importazioni
import {
  type EmailAddress,
  type User,
  clerkClient,
} from "@clerk/nextjs/server";

import { db } from "@/lib/db";

// 2. Definizione dei Tipi
export interface UserLeagueInfo {
  id: number;
  name: string;
  status: string;
}
export interface UserWithLeagueDetails {
  id: string;
  primaryEmail: string | undefined;
  firstName: string | null;
  lastName: string | null;
  role: string | undefined;
  leagues: UserLeagueInfo[];
}
// NUOVO TIPO per gli utenti idonei
export interface EligibleUser {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

// 3. Funzione per ottenere gli utenti con i dettagli delle leghe
export async function getUsersWithLeagueDetails(): Promise<
  UserWithLeagueDetails[]
> {
  const userListResponse = await (
    await clerkClient()
  ).users.getUserList({ limit: 200, orderBy: "-created_at" });
  if (!userListResponse || !Array.isArray(userListResponse.data)) {
    return [];
  }

  const usersWithLeagues = await Promise.all(
    userListResponse.data.map(async (user: User) => {
      const leaguesResult = await db.execute({
        sql: `SELECT al.id, al.name, al.status FROM auction_leagues al JOIN league_participants lp ON al.id = lp.league_id WHERE lp.user_id = ?`,
        args: [user.id],
      });

      return {
        id: user.id,
        primaryEmail: user.emailAddresses.find(
          (e: EmailAddress) => e.id === user.primaryEmailAddressId
        )?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        role: (user.publicMetadata?.role as string) || "manager",
        leagues: leaguesResult.rows as unknown as UserLeagueInfo[],
      };
    })
  );

  return usersWithLeagues;
}

// 4. Funzione per aggiornare il ruolo di un utente (invariato)
export async function setUserRole(
  userId: string,
  role: string
): Promise<{ success: boolean; message: string }> {
  if (!userId || !role) {
    return { success: false, message: "User ID e ruolo sono obbligatori." };
  }
  try {
    await (
      await clerkClient()
    ).users.updateUserMetadata(userId, { publicMetadata: { role: role } });
    return { success: true, message: "Ruolo aggiornato con successo." };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    return {
      success: false,
      message: `Aggiornamento fallito: ${errorMessage}`,
    };
  }
}

// 5. Funzione CORRETTA per trovare utenti idonei
export async function getEligibleUsersForLeague(
  leagueId: number
): Promise<EligibleUser[]> {
  const allUsersResponse = await (
    await clerkClient()
  ).users.getUserList({ limit: 500 });
  if (!allUsersResponse || !Array.isArray(allUsersResponse.data)) {
    return [];
  }

  const allManagers = allUsersResponse.data.filter(
    (user) => ((user.publicMetadata?.role as string) || "manager") === "manager"
  );

  const participantsResult = await db.execute({
    sql: `SELECT user_id FROM league_participants WHERE league_id = ?`,
    args: [leagueId],
  });
  const participants = participantsResult.rows as unknown as { user_id: string }[];
  const participantIds = new Set(participants.map((p) => p.user_id));

  const eligibleUsers = allManagers
    .filter((manager) => !participantIds.has(manager.id))
    .map((user) => ({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
    }));

  eligibleUsers.sort((a, b) =>
    (a.lastName || "").localeCompare(b.lastName || "")
  );

  return eligibleUsers;
}
