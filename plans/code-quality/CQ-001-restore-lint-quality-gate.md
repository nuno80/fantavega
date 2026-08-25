# CQ-001 — Ripristinare la quality gate lint

## Obiettivo
Portare ESLint a exit zero e impedirne la regressione in CI.

## Problema
Il lint produce 16 errori e 47 warning; la workflow quality non lo esegue.

## Root Cause
Debito accumulato nei script/componenti e pipeline incompleta.

## Soluzione
Correggere prima gli errori senza suppression globali; triagiare ogni warning; fissare un budget iniziale eventualmente decrescente; aggiungere job lint alla CI.

## File coinvolti
`scripts/analyze-credits.ts`, `scripts/monitor-memory.js`, componenti segnalati, config ESLint, `.github/workflows/quality.yml`.

## Modifiche
Refactor stilistici/bug reali, dipendenze hook corrette, comando CI. Separare correzioni funzionali da modifiche puramente stilistiche.

## Compatibilità
Verificare in particolare gli hook: aggiungere dipendenze può cambiare frequenza degli effetti. Non usare autofix cieco.

## Test
ESLint, typecheck, suite, build e smoke dei componenti con hook modificati.

## Verifica
CI fallisce su una violazione introdotta e passa sul branch corretto.

## Criteri di accettazione
- ESLint exit 0.
- Nessuna suppression ampia.
- Gate obbligatoria in CI.
- Comportamento UI invariato.

## Rischi
Loop o refetch introdotti correggendo hook dependencies; coprire con test e review mirata.
