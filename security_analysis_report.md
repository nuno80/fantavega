# Security Analysis Report - Fantavega

## Data Analisi: 14/07/2025

---

## Sommario Esecutivo

L'applicazione Fantavega presenta una solida base di sicurezza, in particolare per quanto riguarda l'autenticazione, l'autorizzazione a livello di route e la prevenzione di SQL injection. L'uso di Clerk per l'autenticazione e di statement preparati per le query al database sono pratiche eccellenti.

Tuttavia, sono state identificate alcune aree di rischio che richiedono attenzione. Le vulnerabilità più significative riguardano la **mancanza di controlli di autorizzazione a livello di risorsa (IDOR)**, la **gestione dei file caricati** e la **potenziale esposizione di dati sensibili**.

Di seguito sono elencate le vulnerabilità riscontrate, classificate per livello di rischio, con le relative raccomandazioni.

---

## Vulnerabilità Identificate

### 🔴 Alto Rischio

#### 1. Mancanza di Autorizzazione a Livello di Risorsa (IDOR - Insecure Direct Object Reference)

- **Descrizione**: Il middleware protegge le route, ma non impedisce a un utente autenticato di accedere o modificare risorse che non gli appartengono. Ad esempio, un utente `manager` potrebbe essere in grado di visualizzare o modificare i dati di una lega a cui non partecipa, semplicemente manipolando l'ID della lega nell'URL di una richiesta API.
- **Impatto**: Accesso e modifica non autorizzati di dati, violazione della privacy degli utenti.
- **Raccomandazione**: Implementare controlli di autorizzazione in ogni endpoint API che accede a dati specifici di una lega o di un utente. Prima di eseguire qualsiasi operazione, verificare che l'utente autenticato (`currentUserId`) abbia i permessi necessari per accedere alla risorsa richiesta (es. `league_id`).

### 🟠 Medio Rischio

#### 2. Gestione Insicura dell'Upload di File

- **Descrizione**: L'endpoint di upload per i file Excel (`/api/admin/players/upload-excel`) presenta due debolezze:
  1. **Validazione del tipo di file debole**: Il controllo sul `MIME type` non è restrittivo e non impedisce il caricamento di file potenzialmente malevoli.
  2. **Nessun limite alla dimensione del file**: Un utente malintenzionato (un admin compromesso) potrebbe caricare un file di dimensioni enormi, causando un attacco di tipo Denial of Service (DoS).
- **Impatto**: Potenziale esaurimento delle risorse del server (DoS), possibilità di caricare file malevoli che potrebbero essere sfruttati in futuro.
- **Raccomandazione**:
  1. Implementare una validazione rigorosa del `MIME type` e rifiutare i file non conformi.
  2. Impostare un limite ragionevole alla dimensione dei file accettati (es. 5 MB) a livello di configurazione del server o nell'endpoint stesso.
  3. Verificare che la libreria `xlsx` sia aggiornata e configurata per prevenire attacchi di tipo "XML External Entity" (XXE) e "Billion Laughs".

#### 3. Potenziale Esposizione di Dati Sensibili

- **Descrizione**: Diverse tabelle del database (`users`, `league_participants`) contengono dati personali (email, nomi, ecc.). Se gli endpoint API non sono progettati con attenzione, potrebbero restituire più dati del necessario, esponendo informazioni sensibili.
- **Impatto**: Violazione della privacy degli utenti.
- **Raccomandazione**: Eseguire una revisione di tutti gli endpoint API per assicurarsi che restituiscano solo i dati strettamente necessari (principio del minimo privilegio). Evitare di restituire l'intero oggetto utente o partecipante, ma selezionare solo i campi richiesti.

### 🟡 Basso Rischio

#### 4. Inconsistenza nel Controllo dei Ruoli

- **Descrizione**: Il middleware e alcuni endpoint API controllano il ruolo di `admin` in modi diversi (alcuni controllano `metadata.role`, altri `publicMetadata.role`). Questo può portare a comportamenti inaspettati e a una gestione dei permessi difficile da manutenere.
- **Impatto**: Potenziale confusione nella logica di autorizzazione, bug.
- **Raccomandazione**: Standardizzare la posizione in cui viene memorizzato il ruolo dell'utente (es. sempre in `publicMetadata.role`) e aggiornare tutto il codice per leggere il ruolo da un'unica fonte.

#### 5. Mancanza di Validazione su Valori di Ruolo e Vincoli di Lunghezza

- **Descrizione**:
  1. L'endpoint `set-user-role` non valida il ruolo assegnato, permettendo l'inserimento di ruoli arbitrari.
  2. Lo schema del database non impone vincoli di lunghezza sulle colonne di tipo `TEXT`.
- **Impatto**: Inserimento di dati non validi nel database, che potrebbe causare bug o essere sfruttato in futuro.
- **Raccomandazione**:
  1. Validare il `roleToSet` nell'endpoint `set-user-role` contro una lista di ruoli consentiti.
  2. Aggiungere vincoli di lunghezza (`CHECK(length(...) <= ...)`) alle colonne di testo più importanti nello schema del database.

---

## Conclusione

L'applicazione Fantavega ha una buona postura di sicurezza, ma le vulnerabilità identificate, in particolare l'IDOR, richiedono un'azione correttiva prioritaria. Si raccomanda di affrontare i punti sopra elencati per migliorare ulteriormente la sicurezza e la resilienza dell'applicazione.
