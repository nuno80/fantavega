# TIME-001 — Rendere durabili gli effetti timer post-bid

## Obiettivo
Garantire che ogni offerta committata produca esattamente lo stato timer richiesto.

## Problema
Creazione e cancellazione dei response timer partono in fire-and-forget dopo il commit e possono essere interrotte dal runtime serverless.

## Root Cause
Effetto di dominio essenziale classificato come side effect non atteso; servizio post-bid non integrato nel percorso reale.

## Soluzione
Definire la state machine offerta→timer; aggiornare timer nella stessa transazione quando possibile, altrimenti inserire un job/outbox durabile nello stesso commit; rendere il consumer idempotente; lasciare solo la notifica realtime fuori transazione.

## File coinvolti
`src/lib/db/services/bid.service.ts`, `src/lib/db/services/post-bid-side-effects.service.ts`, servizi response timer, eventuale schema outbox e test.

## Modifiche
Rimuovere la IIFE, introdurre comando deterministico/idempotency key e separare persistency da delivery.

## Compatibilità
Preservare esatte regole di attivazione/cancellazione e ordine degli eventi. Migrare senza creare timer doppi per aste esistenti.

## Test
Percorso bid reale, crash subito dopo commit, retry, due bid concorrenti, timer già presente e processing duplicato.

## Verifica
Dopo ogni interleaving, query di stato mostra un solo timer coerente o nessun timer quando richiesto; nessun job perso.

## Criteri di accettazione
- Nessun effetto essenziale fire-and-forget.
- Stato idempotente e ricostruibile.
- Test crash/concorrenza verdi.
- Metriche su job pending/falliti.

## Rischi
Allungamento della transazione o duplicati at-least-once; scegliere outbox se il lavoro non è breve e rendere il consumer idempotente.
