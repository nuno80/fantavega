# Refactor Baseline

**Data:** 2025-07-25
**Branch:** `refactor/performance-solidita`
**Commit base:** `91ed0459501381383a0f7fb65d6831de90359cec` — `Merge pull request #20 from nuno80/chore/ghost-session-timer-hardening`

---

## Dimensioni `bid.service.ts`

| Metrica | Valore |
|---------|--------|
| Righe   | 1828   |
| Byte    | 66174  |

---

## Esiti baseline

| Comando          | Esito |
|------------------|-------|
| `type-check`     | ✅ PASS (zero errori) |
| `test:run`       | ✅ PASS — 6 file, 24 test, tutti verdi |
| `build`          | ✅ PASS — build Next.js completato |

---

## Conteggio occorrenze grep

| Pattern | File | Occorrenze |
|---------|------|------------|
| `total_locked` | `bid.service.ts` | 6 |
| `total_locked` | `response-timer.service.ts` | 4 |
| `.rollback()` | `bid.service.ts` | 3 (tutti awaited) |
| `.rollback()` | `response-timer.service.ts` | 3 (**⚠️ NESSUNO awaited**) |
| `.rollback()` | `auction-league.service.ts` | 3 (tutti awaited) |
| `.rollback()` | `player-discard.service.ts` | 7 (tutti awaited) |
| `.rollback()` | `penalty.service.ts` | 1 (awaited) |
| `as unknown as` | `bid.service.ts` | 29 |
| `processUserResponse` | `response-timer.service.ts` | 1 |
| `processUserResponse` | `response-action/route.ts` | 3 |
| `abandonAuction` | `response-timer.service.ts` | 3 |
| `abandonAuction` | `abandon/route.ts` | 2 |
| `simulateAutoBidBattle` | `bid.service.ts` | 2 |
| `notifySocketServer` | 7 file | 27 totali |
| `handleBidderChange` | `auction-states.service.ts` | 1 |
| `handleBidderChange` | `bid.service.ts` | 2 |

---

## Problemi preesistenti rilevati

### 🔴 Rollback non awaited in `response-timer.service.ts`

3 chiamate `.rollback()` **senza** `await`:

- riga 334: `transaction.rollback();`
- riga 430: `transaction.rollback();`
- riga 617: `transaction.rollback();`

Queste sono fire-and-forget: il rollback potrebbe non completarsi prima che il flusso prosegua. Da correggere nel ticket 03.

### 🟡 Query `total_locked` duplicata

Presente in 2 file (10 occorrenze totali) — `bid.service.ts` (6) e `response-timer.service.ts` (4). Da centralizzare nel ticket 04.

### 🟡 29 cast `as unknown as` in `bid.service.ts`

Indicano assenza di mapper tipizzati per le righe DB. Da ridurre nel ticket 10.
