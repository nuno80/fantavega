// src/app/no-access/page.tsx
import Link from "next/link";

import { auth } from "@clerk/nextjs/server";

import { Navbar } from "@/components/navbar";

// Rendi la funzione componente async
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  // Usa await per risolvere la Promise restituita da auth()
  const authData = await auth();
  const userId = authData?.userId; // Accedi a userId dopo await
  const resolvedSearchParams = await searchParams;
  const reason = resolvedSearchParams.reason;

  return (
    <div style={{ padding: "2rem" }}>
      <Navbar />
      <h1>Accesso Negato</h1>

      {reason === "no-league" ? (
        <div>
          <p>
            Non puoi accedere alla pagina delle aste perché non sei iscritto a
            nessuna lega.
          </p>
          <p>
            Per partecipare alle aste, devi prima essere aggiunto a una lega da
            un amministratore.
          </p>
        </div>
      ) : (
        <p>
          Non disponi delle autorizzazioni necessarie per visualizzare la
          risorsa richiesta.
        </p>
      )}

      {userId &&
        !reason && ( // Mostra l'ID solo se l'utente è effettivamente loggato e non c'è un motivo specifico
          <p>
            Sei autenticato come utente con ID: {userId}. Contatta un
            amministratore se credi sia un errore.
          </p>
        )}

      <Link href="/">Torna alla Homepage</Link>
    </div>
  );
}
