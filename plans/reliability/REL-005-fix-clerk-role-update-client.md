# REL-005 — Correggere il cambio ruolo Clerk

## Obiettivo
Ripristinare l'endpoint amministrativo usando l'API Clerk tipizzata corrente.

## Problema
L'handler legge `.users` da `clerkClient` senza invocare/attendere la factory e nasconde l'errore con `@ts-expect-error`.

## Root Cause
Migrazione incompleta della SDK.

## Soluzione
Usare `const client = await clerkClient()`; validare il ruolo con schema/enum; aggiornare metadata con l'API supportata; mappare gli errori senza dettagli upstream.

## File coinvolti
`src/app/api/admin/set-user-role/route.ts` e relativo test.

## Modifiche
Rimozione suppression, chiamata corretta e risposta tipizzata.

## Compatibilità
Confermare il campo metadata letto dal middleware/UI e non sovrascrivere metadata non correlati.

## Test
Admin valido, non-admin, ruolo invalido, utente inesistente e errore Clerk.

## Verifica
Typecheck senza suppression e mock verifica la chiamata alla SDK corrente.

## Criteri di accettazione
- Endpoint funzionale.
- Nessun `@ts-expect-error` sul client.
- Ruoli fuori enum rifiutati.
- Errori sanitizzati.

## Rischi
Sovrascrittura metadata o ritardo propagazione session claim; testare refresh session e merge dei campi.
