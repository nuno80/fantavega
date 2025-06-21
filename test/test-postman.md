### TEST Postman

Usa fantavega per le API retest admin
usa fantavega-user per le API test user

armando.luongo = user_2vultw8Mzhm6PZDOuiMHtd2IPJ3
user1@test.com = user_2yAf7DnJ7asI88hIP03WtYnzxDL

# Guida Rapida: Eseguire Query SQLite in un Container Docker

Questa guida spiega come eseguire comandi SQLite3 su un database all'interno di un container Docker, installando temporaneamente il client `sqlite3` se necessario.

## Prerequisiti

1. **Docker e Docker Compose Installati**: Assicurati che siano funzionanti sul tuo sistema.
2. **Container Docker in Esecuzione**: L'applicazione e il suo container (chiameremo il servizio `app` come esempio) devono essere in esecuzione. Avviali con:

   ```bash
   # Naviga nella directory contenente il tuo docker-compose.yml (es. fantavega/Docker/)
   docker compose up -d
   ```

## Passaggi

### 1. Accedere alla Shell del Container

Apri il tuo terminale (WSL Debian nel tuo caso) e naviga nella directory che contiene il file `docker-compose.yml` (es. `fantavega/Docker/`).

Esegui il seguente comando per entrare nella shell del container del tuo servizio applicativo (sostituisci `app` con il nome effettivo del tuo servizio se diverso):

```bash
docker compose exec app /bin/bash
```

Se `/bin/bash` non funziona (raro per immagini Debian), prova con `/bin/sh`.
Dovresti ora vedere un prompt simile a `root@<container_id>:/app#`, indicando che sei all'interno del container.

### 2. Verificare e/o Installare `sqlite3`

Una volta dentro il container, prova a vedere se `sqlite3` è già installato:

```bash
# Dentro il container
sqlite3 --version
```

- **Se visualizzi una versione**: `sqlite3` è già installato. Puoi saltare il prossimo sottocomando di installazione.
- **Se ricevi un errore "command not found"**: Devi installarlo. Esegui (questo è per immagini basate su Debian/Ubuntu):

  ```bash
  # Dentro il container
  apt-get update && apt-get install -y sqlite3
  ```

  Questo comando aggiornerà la lista dei pacchetti e poi installerà `sqlite3`. L'opzione `-y` conferma automaticamente l'installazione.

### 3. Eseguire la Query SQLite

Ora che `sqlite3` è disponibile nel container, puoi eseguire la tua query. Il percorso del database all'interno del container è tipicamente `/app/database/starter_default.db` (adatta se il tuo percorso o nome file è diverso).

Per eseguire la query specifica `SELECT * FROM users WHERE id = 'user_2ybRb12u9haFhrS4U7w3d1Yl5zD';`:

```bash
# Dentro il container
sqlite3 /app/database/starter_default.db "SELECT * FROM users WHERE id = 'user_2ybRb12u9haFhrS4U7w3d1Yl5zD';"
```

- `sqlite3 /app/database/starter_default.db`: Specifica il client SQLite e il file del database su cui operare.
- `"SELECT ...;"`: È il comando SQL da eseguire, racchiuso tra virgolette doppie.

L'output della query verrà stampato direttamente nel terminale.

### 4. Uscire dalla Shell del Container

Una volta terminato, puoi uscire dalla shell del container e tornare al prompt del tuo sistema host (WSL):

```bash
# Dentro il container
exit
```

## Esempio Completo (dopo `docker compose up -d`)

```bash
# Dal tuo terminale WSL, nella directory fantavega/Docker/
docker compose exec app /bin/bash

# Una volta dentro il container (root@<id>:/app#):
apt-get update && apt-get install -y sqlite3 # Esegui solo se sqlite3 non è già installato
sqlite3 /app/database/starter_default.db "SELECT * FROM users WHERE id = 'user_2ybRb12u9haFhrS4U7w3d1Yl5zD';"
exit
```

**Nota Importante:** L'installazione di `sqlite3` con `apt-get install -y sqlite3` fatta in questo modo (dopo `docker compose exec`) è **temporanea** e valida solo per la sessione corrente del container. Se il container viene fermato e ricreato da zero (es. dopo `docker compose down` e poi `up` senza modifiche al Dockerfile), `sqlite3` potrebbe non essere più presente (a meno che non sia parte dell'immagine base o aggiunto permanentemente nel Dockerfile).

## Test Suite per Aste con Postman

### 1. Creazione Asta Iniziale

**Request**:

```http
POST /api/leagues/1/players/123/bids
Authorization: Bearer <Manager1_Token>
Content-Type: application/json
```

**Body**:

```json
{
  "amount": 10
}
```

**Verifiche**:

- Status code `201 Created`
- Response contiene:

  ```json
  {
    "player_id": 123,
    "current_highest_bid_amount": 10,
    "current_highest_bidder_id": "<Manager1_ID>",
    "scheduled_end_time": "<ora_corrente + 24h>"
  }
  ```

---

### 2. Verifica Stato Asta

**Request**:

```http
GET /api/leagues/1/players/123/bids
Authorization: Bearer <Manager1_Token>
```

**Verifiche**:

- Status code `200 OK`
- Response mostra:

  ```json
  {
    "active": true,
    "current_highest_bid_amount": 10,
    "time_remaining": "<valore positivo>"
  }
  ```

---

### 3. Offerta Manuale Successiva

**Request**:

```http
POST /api/leagues/1/players/123/bids
Authorization: Bearer <Manager2_Token>
Content-Type: application/json
```

**Body**:

```json
{
  "amount": 15,
  "bid_type": "manual"
}
```

**Verifiche**:

- Status code `200 OK`
- Response mostra:

  ```json
  {
    "current_highest_bid_amount": 15,
    "current_highest_bidder_id": "<Manager2_ID>",
    "scheduled_end_time": "<nuovo orario corrente + 24h>"
  }
  ```

---

### 4. Offerta Quick Bid

**Request**:

```http
POST /api/leagues/1/players/123/bids
Authorization: Bearer <Manager1_Token>
Content-Type: application/json
```

**Body**:

```json
{
  "amount": 100, // Verrà ignorato
  "bid_type": "quick"
}
```

**Verifiche**:

- Status code `200 OK`
- Response mostra:

  ```json
  {
    "current_highest_bid_amount": 16, // 15+1
    "current_highest_bidder_id": "<Manager1_ID>",
    "scheduled_end_time": "<nuovo orario corrente + 24h>"
  }
  ```

---

### 5. Test Scenari di Errore

#### a) Offerta Troppo Bassa

**Request**:

```http
POST /api/leagues/1/players/123/bids
Authorization: Bearer <Manager3_Token>
```

**Body**:

```json
{ "amount": 15 }


// <= offerta corrente (16)
```

**Verifica**:

- Status code `400 Bad Request`
- Messaggio: `"Bid amount must be greater than current highest bid (16)"`

#### b) Offerta su Asta Non Attiva

**Request**:

```http
POST /api/leagues/1/players/999/bids  // Giocatore senza asta
Authorization: Bearer <Manager1_Token>
```

**Body**:

```json
{ "amount": 10 }
```

**Verifica**:

- Status code `404 Not Found`
- Messaggio: `"No active auction for this player"`

#### c) Budget Insufficiente

**Request**:

```http
POST /api/leagues/1/players/123/bids
Authorization: Bearer <Manager3_Token>  // Con budget < 16
```

**Body**:

```json
{ "amount": 20 }
```

**Verifica**:

- Status code `403 Forbidden`
- Messaggio: `"Insufficient budget for this bid"`

#### d) Slot Pieni

**Request**:

```http
POST /api/leagues/1/players/123/bids
Authorization: Bearer <Manager4_Token>  // Con roster completo
```

**Body**:

```json
{ "amount": 20 }
```

**Verifica**:

- Status code `403 Forbidden`
- Messaggio: `"No available slots for this position"`

```




```
