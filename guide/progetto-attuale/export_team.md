# Funzionalità di Esportazione Squadre

Questo documento descrive la funzionalità di esportazione delle rose, gli interventi effettuati per la sua implementazione e i formati di output attesi.

## 1. Obiettivo della Funzionalità

L'obiettivo è permettere a un utente con ruolo "admin" di esportare i dati completi delle rose di qualsiasi lega presente nel sistema. L'esportazione deve essere flessibile e supportare tre formati distinti per diverse necessità di utilizzo:

- **CSV**: Un formato testuale per un'analisi rapida o l'importazione in script.
- **Excel (.xlsx)**: Un formato tabellare avanzato per analisi e condivisione con altri utenti.
- **JSON**: Un formato strutturato per l'interscambio di dati tra applicazioni.

La funzionalità è accessibile dalla pagina `/admin/teams-export`.

## 2. Interventi Effettuati

L'implementazione iniziale (commit `9f8c0e1`) era incompleta e presentava diverse problematiche. Sono stati effettuati i seguenti interventi per completare e correggere la funzionalità:

1.  **Refactoring del Livello Servizi**: La logica di recupero dati è stata centralizzata nella funzione `getLeagueRostersForExport` (`auction-league.service.ts`), che ora restituisce dati strutturati, separando il recupero dalla formattazione.

2.  **Correzione della Rotta API**: La rotta API (`teams-export/route.ts`) è stata riscritta per utilizzare i dati strutturati e gestire correttamente la generazione dei tre formati di file, impostando header e `Content-Type` appropriati.

3.  **Implementazione Reale di Excel**: È stata introdotta la libreria `xlsx` per generare file `.xlsx` validi e multi-foglio, superando il problema del semplice CSV rinominato.

4.  **Implementazione Formato JSON**: Il formato "custom" è stato trasformato in un output JSON ricco e ben strutturato.

5.  **Adeguamento Formato CSV**: Il formato CSV è stato modificato per aderire alle specifiche richieste, con l'uso del separatore `$,$,$` e colonne specifiche.

6.  **Risoluzione Bug Frontend**: È stato corretto un bug nella pagina di esportazione che impediva il caricamento delle leghe nel menu a tendina, modificando la rotta API `/api/admin/leagues/route.ts` per restituire i dati nel formato atteso.

## 3. Output Attesi per Formato

#### a. Formato CSV (`.csv`)

Questo formato segue una struttura non convenzionale specifica per le necessità del progetto.

- **Struttura**: Non contiene header di metadati. Ogni squadra è preceduta da una riga separatrice `$,$,$`. Le righe successive contengono tre colonne: nome della squadra, ID del giocatore e prezzo di acquisto.
- **Esempio di output**:

```
$,$,$
nome_squadra_A,123,50
nome_squadra_A,456,25
$,$,$
nome_squadra_B,789,100
```

#### b. Formato Excel (`.xlsx`)

Un file Excel multi-foglio pensato per un'analisi comoda.

- **Struttura**:
  - **Primo Foglio ("Riepilogo")**: Contiene i metadati principali della lega (nome, data export, numero totale di squadre e giocatori).
  - **Fogli Successivi**: Un foglio di lavoro per ogni squadra, nominato con il nome della squadra stessa. Ogni foglio contiene una tabella con l'elenco dei giocatori di quella squadra e i relativi dettagli (ID, Nome, Ruolo, Squadra, FVM, Prezzo).

#### c. Formato Custom / JSON (`.json`)

Un file JSON strutturato, ideale per l'elaborazione programmatica.

- **Struttura**: Un oggetto JSON principale con tre chiavi:
  - `league`: Contiene i dettagli della lega (id, nome, status, etc.).
  - `exportInfo`: Contiene i metadati dell'esportazione (data, numero squadre, etc.).
  - `teams`: Un array in cui ogni oggetto rappresenta una squadra e contiene i dettagli del manager e un sotto-array `players` con tutti i giocatori e i loro dati.

## 4. File Principali Interessati dalle Modifiche

- **Servizio di Logica**: `src/lib/db/services/auction-league.service.ts`
- **Rotta API per l'Export**: `src/app/api/admin/teams-export/route.ts`
- **Rotta API per l'elenco Leghe**: `src/app/api/admin/leagues/route.ts`
- **Pagina Frontend**: `src/app/admin/teams-export/page.tsx` (analizzata per diagnosticare il bug del dropdown).