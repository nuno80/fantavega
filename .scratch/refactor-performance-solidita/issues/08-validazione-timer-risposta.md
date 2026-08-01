# 08 — Validazione timer di risposta

**What to build:** Il flusso `abandonAuction` (o il chiamante reale individuato tramite grep) valida l'asta target: recupera l'asta da lega e giocatore, verifica stato ammesso (incluso `closing` se previsto), confronta `timer.auction_id` con l'ID reale, tutto nella stessa transazione. Non regredire hardening esistente (aggiornamenti condizionati da status, `rowsAffected`, `notAfter`, claim atomici).

**Blocked by:** 03 — Await rollback transazionali

**Status:** ready-for-agent

- [ ] Flusso reale individuato tramite grep
- [ ] Validazione asta target (stato + identità auction_id) aggiunta
- [ ] Controllo e transizione nello stesso contesto transazionale
- [ ] Hardening esistente non regredito
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
