# SEC-005 — Formalizzare la policy di lettura delle leghe

## Obiettivo
Rendere esplicito e uniforme chi può leggere ogni categoria di dati di lega.

## Problema
Lo storico offerte è leggibile da qualsiasi utente autenticato, mentre altri endpoint richiedono membership; la policy “leghe amici” non è codificata centralmente.

## Root Cause
Decisione di dominio implicita e guard duplicati endpoint per endpoint.

## Soluzione
Confermare con prodotto le classi public/authenticated/member/admin; classificare dati sensibili; centralizzare predicate/DTO e applicare una matrice di autorizzazione.

## File coinvolti
Route sotto `src/app/api/leagues`, helper accesso lega, documentazione dominio e test auth.

## Modifiche
Policy functions nominate, filtraggio campi e test tabellari. Nessuna restrizione va introdotta prima della decisione di prodotto.

## Compatibilità
Se le leghe amiche sono intenzionalmente visibili, mantenere le letture ma escludere dati strategici non pubblici.

## Test
Anonimo, autenticato non membro, membro, proprietario/admin per ogni classe di endpoint.

## Verifica
Ogni route di lega è mappata a una policy e non contiene eccezioni non documentate.

## Criteri di accettazione
- Decisione di prodotto registrata.
- Matrice completa e automatizzata.
- Nessun dato più sensibile della classe autorizzata.

## Rischi
Possibile cambio UX o link condivisi non più accessibili; misurare e comunicare prima del rollout.
