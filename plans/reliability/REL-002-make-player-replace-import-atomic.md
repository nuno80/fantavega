# REL-002 — Rendere atomico l'import replace dei giocatori

## Obiettivo
Garantire “tutto o niente” e proteggere catalogo e assegnazioni.

## Problema
Il servizio cancella `player_assignments` e `players` prima di completare validazione e inserimento.

## Root Cause
Validazione e mutazione interlacciate; nessuna transazione unica o tabella di staging.

## Soluzione
Separare parse/normalize/validate; mostrare dry-run; scrivere in staging o in una transazione; eseguire swap solo dopo validazione completa; definire la policy sulle assegnazioni; registrare un import ID.

## File coinvolti
`src/lib/db/services/player-import.service.ts`, upload route, schema solo se si sceglie staging persistente, test import.

## Modifiche
Pipeline in fasi, transaction boundary, error report per riga, eventuale snapshot recuperabile.

## Compatibilità
Preservare modalità append/update e formato file. Decidere esplicitamente se gli ID giocatore stabili devono sopravvivere al replace.

## Test
Errore nell'ultima riga, collisioni, failure DB dopo ogni batch, timeout, import valido grande e doppio retry.

## Verifica
Hash/conteggi di players e assignments restano identici dopo ogni failure; un successo produce esattamente il dataset validato.

## Criteri di accettazione
- Nessuna delete prima della validazione completa.
- Commit unico o swap atomico.
- Errori non lasciano stato parziale.
- Recovery documentata.

## Rischi
Transazione lunga e lock DB; usare staging e swap breve se il dataset supera il budget misurato.
