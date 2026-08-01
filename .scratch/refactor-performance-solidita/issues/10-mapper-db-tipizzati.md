# 10 — Mapper DB tipizzati

**What to build:** `db-mappers.ts` con funzioni di validazione runtime (`requiredNumber`, `requiredString`, ecc.) che verificano il tipo del campo e lanciano errore con nome del campo. Sostituire i cast `as unknown as` nei flussi finanziari di `bid.service.ts` (e file estratti). Non eliminare tutti i cast del repo — solo quelli in transazioni e flussi finanziari.

**Blocked by:** 06 — Estrazione `bid-expiry.ts`

**Status:** ready-for-agent

- [ ] `src/lib/db/services/db-mappers.ts` creato
- [ ] Almeno 3 mapper: auction combinata, participant, league
- [ ] Validazione runtime, no `value as T` generico
- [ ] Cast `as unknown as` in flussi finanziari di bid sostituiti
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
