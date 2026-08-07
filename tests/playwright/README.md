# Optional Playwright timer tests

Questa suite è volutamente separata dalla CI applicativa: il precedente tentativo falliva perché Playwright non era una dipendenza del progetto e il workflow partiva senza database/sessione autenticata.

Installazione locale isolata:

```bash
pnpm dlx playwright@1.55.0 install chromium
E2E_STORAGE_STATE=tests/playwright/.auth/manager.json \
E2E_LEAGUE_A=7 E2E_LEAGUE_B=8 E2E_AUCTION_A=9 \
pnpm dlx playwright@1.55.0 test tests/playwright/two-leagues-two-tabs.spec.mjs
```

Il database usato deve essere dedicato ai test, mai produzione. Deve contenere lo stesso manager in due leghe indipendenti e un timer pendente nella Lega A. Il test crea due tab nello stesso contesto autenticato, quindi condivide la sessione ma non lo stato della pagina.

Il test di claim concorrente considera correttamente due risposte HTTP 200: una deve avere `activated`, l’altra `already_active`. Non assume erroneamente che il secondo claim debba essere un 404 o un errore.
