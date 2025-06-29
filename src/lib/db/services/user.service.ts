// src/lib/db/services/user.service.ts v.1.5 (Verificato)
// Servizio utenti con query SQL confermata dallo schema del database.
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

// 3. Funzione per ottenere gli utenti con i dettagli delle leghe
export async function getUsersWithLeagueDetails(): Promise<
  UserWithLeagueDetails[]
> {
  console.log("Fetching user list with league details...");

  // 1. Fetch di tutti gli utenti da Clerk
  const userListResponse = await (
    await clerkClient()
  ).users.getUserList({ limit: 200, orderBy: "-created_at" });

  if (!userListResponse || !Array.isArray(userListResponse.data)) {
    console.error(
      "getUserList did not return a valid data array:",
      userListResponse
    );
    return [];
  }

  // 2. Prepara la query al DB una sola volta (con il nome colonna corretto)
  const getLeaguesForUserStmt = db.prepare(`
    SELECT al.id, al.name, al.status
    FROM auction_leagues al
    JOIN league_participants lp ON al.id = lp.league_id
    WHERE lp.user_id = ?
  `);

  // 3. Combina i dati di Clerk con quelli del DB locale
  const usersWithDetails: UserWithLeagueDetails[] = userListResponse.data.map(
    (user: User) => {
      const leagues = getLeaguesForUserStmt.all(user.id) as UserLeagueInfo[];

      return {
        id: user.id,
        primaryEmail: user.emailAddresses.find(
          (e: EmailAddress) => e.id === user.primaryEmailAddressId
        )?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        role: (user.publicMetadata?.role as string) || "manager",
        leagues: leagues,
      };
    }
  );

  return usersWithDetails;
}

// 4. Funzione per aggiornare il ruolo di un utente
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
    ).users.updateUserMetadata(userId, {
      publicMetadata: {
        role: role,
      },
    });
    console.log(`Ruolo per l'utente ${userId} aggiornato a ${role} in Clerk.`);
    return { success: true, message: "Ruolo aggiornato con successo." };
  } catch (error) {
    console.error(
      `Errore durante l'aggiornamento del ruolo per l'utente ${userId}:`,
      error
    );
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    return {
      success: false,
      message: `Aggiornamento fallito: ${errorMessage}`,
    };
  }
}
