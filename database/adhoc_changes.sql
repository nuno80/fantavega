-- database/adhoc_changes.sql

-- ATTENZIONE: Le query in questo file vengono eseguite dallo script `pnpm run db:apply-changes`.
-- Questo file è pensato per modifiche ad-hoc allo schema o ai dati che NON sono
-- gestite dalla riesecuzione di `database/schema.sql` (come ALTER TABLE su tabelle esistenti).
--
-- DOPO AVER ESEGUITO LE QUERY CON SUCCESSO:
-- 1. Assicurati di AGGIORNARE `database/schema.sql` per riflettere la nuova struttura "finale" del database
--    se hai apportato modifiche strutturali (es. aggiunto una colonna con ALTER TABLE).
-- 2. SVUOTA o COMMENTA le query in questo file per evitare di rieseguirle accidentalmente.
--    Questo file non tiene traccia di ciò che è stato eseguito.
--
-- Esempio di query (DA CANCELLARE O COMMENTARE DOPO L'USO):
-- ALTER TABLE users ADD COLUMN last_login DATETIME;
-- UPDATE products SET price = price * 1.10 WHERE category = 'electronics';
-- DELETE FROM logs WHERE timestamp < '2023-01-01';

-- Incolla qui le tue query ad-hoc:

-- MODIFICHE APPLICATE IL 06/07/2025:
-- Aggiunte colonne per le icone dei giocatori
-- - is_starter (BOOLEAN)
-- - is_favorite (BOOLEAN)
-- - integrity_value (INTEGER)
-- - has_fmv (BOOLEAN)
-- Queste colonne sono ora presenti anche nello schema principale in database/schema.sql