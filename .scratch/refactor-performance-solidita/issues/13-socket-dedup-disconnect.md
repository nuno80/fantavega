# 13 — Socket.IO: dedup cache + disconnect timer

**What to build:** Cache deduplicazione emissioni Socket.IO con dimensione limitata e pulizia deterministica. Preferire chiave business o `eventId` stabile rispetto a hash MD5 di `JSON.stringify`. Map timer disconnect per utente: cancellata su reconnect, il callback controlla socket esistenti dello stesso utente, chiama `recordUserLogout` in try/catch, non chiude sessioni protette da heartbeat recente. Nessuna modifica a `io.use()`, `src/middleware.ts`, `src/lib/auth/league-guard.ts`.

**Blocked by:** 09 — Parallelizzazione post-commit

**Status:** done

- [x] Cache dedup con dimensione massima e pulizia deterministica
- [x] Map timer disconnect per utente
- [x] Timer cancellato su reconnect nella stessa room
- [x] Callback disconnect controlla socket esistenti, try/catch su `recordUserLogout`
- [x] Non chiude sessione protetta da heartbeat recente
- [x] `io.use()`, `middleware.ts`, `league-guard.ts` non modificati
- [x] `pnpm run type-check` passa
- [x] `pnpm run test:run` passa
