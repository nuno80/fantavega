# 13 — Socket.IO: dedup cache + disconnect timer

**What to build:** Cache deduplicazione emissioni Socket.IO con dimensione limitata e pulizia deterministica. Preferire chiave business o `eventId` stabile rispetto a hash MD5 di `JSON.stringify`. Map timer disconnect per utente: cancellata su reconnect, il callback controlla socket esistenti dello stesso utente, chiama `recordUserLogout` in try/catch, non chiude sessioni protette da heartbeat recente. Nessuna modifica a `io.use()`, `src/middleware.ts`, `src/lib/auth/league-guard.ts`.

**Blocked by:** 09 — Parallelizzazione post-commit

**Status:** ready-for-agent

- [ ] Cache dedup con dimensione massima e pulizia deterministica
- [ ] Map timer disconnect per utente
- [ ] Timer cancellato su reconnect nella stessa room
- [ ] Callback disconnect controlla socket esistenti, try/catch su `recordUserLogout`
- [ ] Non chiude sessione protetta da heartbeat recente
- [ ] `io.use()`, `middleware.ts`, `league-guard.ts` non modificati
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
