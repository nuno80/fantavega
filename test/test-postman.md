### TEST Postman

Usa fantavega per le API retest admin
usa fantavega-user per le API test user

armando.luongo = user_2vultw8Mzhm6PZDOuiMHtd2IPJ3

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
