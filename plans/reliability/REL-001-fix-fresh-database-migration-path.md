# REL-001 — Riparare bootstrap e migrazioni database

## Obiettivo
Rendere ripetibili creazione da zero, upgrade legacy e disaster recovery.

## Problema
`src/lib/db/migrate.ts` applica `src/lib/db/schema.sql` e poi tutte le migrazioni; su un database vuoto `database/migrations/add_player_icons_columns.sql` tenta di aggiungere colonne già presenti e fallisce.

## Root Cause
Snapshot schema e migrazioni storiche sovrapposti senza baseline registrata; l'ordine dei file non costituisce una strategia di versionamento completa.

## Soluzione
Scegliere formalmente baseline+migrazioni o migrazioni complete; versionare l'ordine; marcare una baseline per nuovi DB; rendere idempotenti solo le migrazioni che devono supportarlo; aggiungere verifica di drift.

## File coinvolti
- `src/lib/db/schema.sql`
- `src/lib/db/migrate.ts`
- `src/lib/db/utils.ts`
- `database/migrations/add_player_icons_columns.sql`
- gli altri file sotto `database/migrations/`, dopo inventario delle dipendenze
- `.github/workflows/quality.yml`
- `scripts/verify-database-schema.py`
- test/fixture DB legacy da aggiungere nella directory test già adottata dal progetto

## Modifiche
Runner deterministico, metadata baseline e test su database temporanei. Non eseguire automaticamente nulla in production durante l'implementazione.

## Compatibilità
Inventariare prima `schema_migrations` e schema live in sola lettura; preparare percorsi separati per DB già aggiornati e snapshot vecchi.

## Test
DB vuoto, baseline supportate, rerun, migrazione interrotta, schema parziale e confronto finale di tabelle/indici/trigger.

## Verifica
La stessa procedura usata in deploy viene eseguita in CI e termina senza errore su ogni fixture supportata.

## Criteri di accettazione
- Bootstrap vuoto verde.
- Upgrade legacy verde e senza perdita dati.
- Seconda esecuzione sicura.
- Drift rilevato prima del deploy.

## Rischi
Marcare erroneamente migrazioni live o perdere trasformazioni dati. Richiedere backup, dry-run e approvazione separata prima dell'ambiente reale.
