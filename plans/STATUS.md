# Stato avanzamento fix

Ultimo aggiornamento: 2026-08-25

## Legenda

- ✅ **Completato** — commit isolato su `main` + test verdi
- 🟡 **In corso** — codice scritto nel working tree, non ancora committato/revisionato
- ⏸️ **Aperto** — nessuna modifica iniziata

## Riepilogo

| Fix | Stato | Commit | Note |
| --- | --- | --- | --- |
| SEC-001 | ✅ Completato | `6895a1a` | Upgrade Clerk/Next + guard admin route-level |
| SEC-002 | ✅ Completato | `c0717bf` | Endpoint debug/task admin induriti |
| REL-003 | ✅ Completato | `7692ffd` | Riconciliazione `locked_credits` sul settlement |
| REL-001 | ✅ Completato | `a632101` | Bootstrap vuoto + upgrade legacy + drift detection |
| SEC-003 | ✅ Completato | `781b875` | Parser Excel sicuro + budget upload |
| REL-002 | ✅ Completato | `d35ee11` | Import replace atomico |
| REL-004 | ⏸️ Aperto | — | Budget/ledger atomici |
| REL-005 | ⏸️ Aperto | — | Cambio ruolo Clerk |
| REL-006 | ⏸️ Aperto | — | Delivery Socket.IO disaccoppiata |
| SEC-004 | ⏸️ Aperto | — | Rate limit distribuito |
| SEC-005 | ⏸️ Aperto | — | Policy lettura leghe |
| CQ-001 | ⏸️ Aperto | — | Quality gate lint |
| CQ-002 | ⏸️ Aperto | — | Logging/errori production |
| PERF-001 | ⏸️ Aperto | — | Paginazione activity log |
| PERF-002 | ⏸️ Aperto | — | Waterfall post-bid |
| PERF-003 | ⏸️ Aperto | — | Cap players-with-status |
| TIME-001 | ⏸️ Aperto | — | Effetti timer post-bid durabili |
| TIME-002 | ⏸️ Aperto | — | Lease scheduler rinnovabile |

## Dettagli in corso

## Note operatività

- `main` locale è avanti a `origin/main` di 8 commit (SEC-001/002/003, REL-001/002/003 + 2 ui/docs). **Non ancora pushati.**
- `docs/remediation-status.md` è **stantio**: usa questo file come riferimento.
