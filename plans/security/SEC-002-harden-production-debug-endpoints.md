# SEC-002 — Blindare endpoint debug e task

## Obiettivo
Impedire accesso o mutazioni non autorizzate e rimuovere dati diagnostici dalla superficie production.

## Problema
`debug/addai` espone email, offerte, timer e massimali senza guard interno; altri endpoint applicano policy diverse; alcune task mutano via GET.

## Root Cause
Autorizzazione affidata al matcher middleware e assenza di una policy unica per debug/admin.

## Soluzione
Inventariare gli endpoint; eliminare quelli obsoleti; per i restanti applicare `assertAdmin`, 404 production salvo feature flag esplicito, minimizzazione campi e POST per le mutazioni.

## File coinvolti
`src/app/api/debug/**/route.ts`, `src/app/api/admin/tasks/**/route.ts`, helper auth e test route.

## Modifiche
Guard condiviso, gate ambiente, metodi HTTP corretti, response DTO senza PII/strategie, audit log amministrativo.

## Compatibilità
Gli strumenti interni devono passare da endpoint eliminati a strumenti admin approvati; documentare il flag solo senza valore segreto.

## Test
Matrice anonimo/utente/admin in development e production; verifica 405 per metodi errati; snapshot dei campi restituiti.

## Verifica
Scansione route e chiamate dirette agli handler dimostrano che nessun debug production è accessibile per default.

## Criteri di accettazione
- Ogni handler sensibile applica il guard localmente.
- Nessuna mutazione via GET.
- Nessun massimale auto-bid, email o stack non necessario in risposta.

## Rischi
Perdita di diagnostica operativa. Sostituirla con comandi o dashboard autenticati e logging strutturato.
