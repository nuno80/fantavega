# SEC-001 — Aggiornare autenticazione e framework

## Obiettivo
Eliminare gli advisory critici/high di Clerk e quelli applicabili a Next.js, mantenendo invariati login, ruoli e protezione route.

## Problema
Il lockfile risolve Clerk 6.23.1 e Next 15.5.9; l'audit segnala un bypass della protezione middleware e altre vulnerabilità corrette in patch successive.

## Root Cause
Dipendenze non aggiornate e alcune route sensibili protette unicamente dal middleware.

## Soluzione
1. Registrare la matrice anonimo/utente/admin delle route sensibili.
2. Aggiornare Clerk almeno alla prima versione non vulnerabile compatibile e Next alla patch sicura più recente della linea supportata.
3. Rigenerare il lockfile senza aggiornamenti estranei.
4. Aggiungere un guard interno a ogni handler admin/debug/task.
5. Correggere le incompatibilità seguendo le migration guide ufficiali.

## File coinvolti
`package.json`, `pnpm-lock.yaml`, `src/middleware.tsx`, route sotto `src/app/api/admin` e `src/app/api/debug`, test auth.

## Modifiche
Versioni esatte, API Clerk eventualmente cambiate, guard condiviso e test tabellari. Nessuna modifica allo schema DB.

## Compatibilità
Preservare metadata ruolo Clerk, redirect di sign-in/sign-up, Server Actions e verifica token Socket.IO. Eseguire prima in preview.

## Test
Typecheck, suite completa, build, test diretti degli handler, smoke browser login/logout/ruolo, nuovo audit production.

## Verifica
Gli advisory GHSA-vqx2-fgx2-5wq9 e GHSA-9mp4-77wg-rwx9 non compaiono; anonimo e non-admin non raggiungono route sensibili anche bypassando il middleware nel test.

## Criteri di accettazione
- Nessun advisory critical/high noto nelle dipendenze dirette Clerk/Next applicabili.
- Tutti i flussi auth esistenti funzionano.
- Tutte le route sensibili hanno difesa route-level.
- Build e test verdi.

## Rischi
Breaking change di Clerk/Next, matcher modificati, caching differente. Mitigare con aggiornamenti incrementali e preview deploy.
