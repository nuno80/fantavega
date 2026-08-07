# Playwright opzionale: due leghe, due tab

## Perché è separata

La suite non deve bloccare la correzione funzionale dei timer. Il precedente errore era infrastrutturale: mancava una dipendenza Playwright installata, non erano disponibili automaticamente credenziali, storage state o un database isolato, e il test assumeva un codice HTTP troppo restrittivo per il secondo claim idempotente.

## Correzioni

- test in `.mjs`, escluso dal type-check dell’app;
- esecuzione tramite `pnpm dlx`, senza modificare `package.json` o lockfile;
- nessun workflow obbligatorio aggiunto;
- database e sessione autenticata configurati esplicitamente;
- asserzione sul risultato di business `activated` / `already_active`, non su un falso errore HTTP;
- due tab nello stesso browser context e due leghe distinte.

## Dipendenza

Applicare prima PR #38. Poi configurare l’ambiente E2E isolato e lanciare il comando nel README. Questa PR può essere mergiata senza rendere Playwright un gate di produzione.
