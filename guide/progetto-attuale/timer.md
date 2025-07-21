# Sistema Timer di Rilancio - Documentazione Tecnica v2.0

## Panoramica

Il sistema di timer di rilancio gestisce il tempo che un utente ha a disposizione per rispondere quando viene superato in un'asta. **LOGICA CORRETTA**: Il timer di 1 ora parte solo quando l'utente torna online e vede la notifica del rilancio.

## Principi Fondamentali

### 🎯 Fairness First
- **Timer parte solo quando utente vede il rilancio**
- **1 ora EFFETTIVA per decidere** (non dall'evento)
- **Slot liberate automaticamente** dopo scadenza

### 🔄 Flusso Logico Corretto

1. **User A** fa offerta → **User B** supera User A
2. **Se User A è ONLINE**: Timer 1h parte subito
3. **Se User A è OFFLINE**: Timer rimane PENDENTE
4. **User A torna online**: Timer 1h parte dal login
5. **Dopo 1 ora**: Slot liberate automaticamente

## Architettura Tecnica

### 📊 Tabelle Database

#### `user_sessions` - Tracking Login/Logout
```sql
CREATE TABLE user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    session_start INTEGER NOT NULL, -- timestamp login
    session_end INTEGER, -- timestamp logout (NULL se online)
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

#### `user_auction_response_timers` - Timer Rilancio
```sql
CREATE TABLE user_auction_response_timers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')), 
    response_deadline INTEGER, -- NULL = pendente, valore = attivo
    activated_at INTEGER, -- quando attivato (login utente)
    processed_at INTEGER, -- quando processato
    status TEXT DEFAULT 'pending' -- 'pending', 'cancelled', 'abandoned', 'expired'
);
```

### 🔧 Servizi Core

#### `session.service.ts` - Gestione Sessioni
```typescript
// Registra login utente
export const recordUserLogin = async (userId: string): Promise<void>

// Registra logout utente  
export const recordUserLogout = async (userId: string): Promise<void>

// Ottieni ultimo login attivo
export const getUserLastLogin = async (userId: string): Promise<number | null>

// Verifica se utente è online
export const isUserCurrentlyOnline = async (userId: string): Promise<boolean>
```

#### `response-timer.service.ts` - Logica Timer
```typescript
// Crea timer PENDENTE (senza deadline)
export const createResponseTimer = async (auctionId: number, userId: string)

// Attiva timer quando utente torna online
export const activateTimersForUser = async (userId: string)

// Cancella timer quando utente rilancia
export const cancelResponseTimer = async (auctionId: number, userId: string)

// Abbandona volontariamente un'asta
export const abandonAuction = async (userId: string, leagueId: number, playerId: number)

// Processa timer scaduti automaticamente
export const processExpiredResponseTimers = async ()
```

## 🔄 Flussi Operativi

### Scenario 1: Utente Online
```
14:00 - User A fa offerta (16 crediti)
14:05 - User B supera (17 crediti) → User A è ONLINE
14:05 - Timer si attiva: deadline = 14:05 + 1h = 15:05
15:05 - Se User A non rilancia → Slot liberate automaticamente
```

### Scenario 2: Utente Offline
```
14:00 - User A fa offerta (16 crediti)  
14:05 - User B supera (17 crediti) → User A è OFFLINE
14:05 - Timer PENDENTE (response_deadline = NULL)
16:30 - User A torna online → Timer attivato: deadline = 16:30 + 1h = 17:30
17:30 - Se User A non rilancia → Slot liberate automaticamente
```

### Scenario 3: Rilancio
```
14:00 - User A fa offerta → User B supera → Timer per User A
14:30 - User A rilancia → Timer CANCELLATO
14:30 - Nuovo timer PENDENTE per User B
```

### Scenario 4: Abbandono Volontario
```
14:00 - User A fa offerta → User B supera → Timer per User A  
14:30 - User A clicca "Abbandona Asta"
14:30 - Timer ABBANDONATO → Slot liberate → Cooldown 48h
```

## 🚀 Sistema di Scheduling Automatico

### `scheduler.ts` - Processing Automatico
```typescript
// Avvia controllo ogni 5 minuti
export const startScheduler = () => {
  setInterval(async () => {
    await processExpiredResponseTimers();
  }, 5 * 60 * 1000);
}
```

### Integrazione Socket Server
```typescript
// In socket-server.ts
import { startScheduler } from './src/lib/scheduler.js';
startScheduler(); // Avvia automaticamente
```

## 📡 Integrazione Real-Time

### Middleware - Tracking Login
```typescript
// In middleware.tsx
await recordUserLogin(userId); // Per route protette
```

### Socket.IO - Tracking Logout
```typescript
// In socket-server.ts
socket.on("disconnect", async () => {
  await recordUserLogout(userId);
});
```

### Eventi Socket Emessi
- `response-timer-started`: Timer attivato
- `timer-expired-notification`: Timer scaduto
- `auction-abandoned`: Asta abbandonata volontariamente

## 🎮 API Endpoints

### Timer Management
- `POST /api/leagues/[id]/players/[id]/abandon` - Abbandona asta
- `POST /api/admin/tasks/process-response-timers` - Processa timer manualmente

### Stati Timer
- **pending**: Timer attivo o in attesa
- **cancelled**: Utente ha rilanciato  
- **abandoned**: Utente ha abbandonato volontariamente
- **expired**: Timer scaduto automaticamente

## 🔍 Monitoraggio e Debug

### Query Diagnostiche
```sql
-- Sessioni attive
SELECT user_id, datetime(session_start, 'unixepoch') as login_time
FROM user_sessions WHERE session_end IS NULL;

-- Timer pendenti vs attivi
SELECT user_id, auction_id,
  CASE 
    WHEN response_deadline IS NULL THEN 'PENDING (waiting login)'
    WHEN response_deadline > strftime('%s', 'now') THEN 'ACTIVE (running)'
    ELSE 'EXPIRED'
  END as timer_status
FROM user_auction_response_timers WHERE status = 'pending';

-- Crediti bloccati
SELECT user_id, locked_credits, 
  COUNT(t.id) as active_timers
FROM league_participants lp
LEFT JOIN user_auction_response_timers t ON lp.user_id = t.user_id 
WHERE lp.locked_credits > 0 AND t.status = 'pending'
GROUP BY lp.user_id;
```

### Log Monitoring
```
[TIMER] - Operazioni timer
[SESSION] - Login/logout tracking  
[SCHEDULER] - Processing automatico
[BID_SERVICE] - Integrazione offerte
```

## ✅ Vantaggi Sistema Nuovo

1. **🎯 Fairness**: Timer solo quando utente vede rilancio
2. **🔓 Slot Liberate**: Sistema automatico ogni 5 minuti
3. **📊 Tracking Preciso**: Login/logout con timestamp
4. **🔄 Resilienza**: Recovery automatico al restart
5. **👥 User-Friendly**: Tempo effettivo per decidere

## 🧪 Testing Scenarios

### Test 1: Timer Pendente → Attivo
1. User offline viene superato → Timer pendente
2. User torna online → Timer si attiva (1h dal login)
3. Verificare deadline corretta

### Test 2: Processing Automatico  
1. Creare timer scaduto
2. Aspettare 5 minuti (scheduler)
3. Verificare slot liberate e cooldown applicato

### Test 3: Abbandono Volontario
1. User ha timer attivo
2. Chiamare API abandon
3. Verificare timer cancelled e cooldown 48h

## 🚨 Troubleshooting

### Timer Non Si Attivano
- Verificare `user_sessions` per login registrati
- Controllare chiamate `activateTimersForUser`

### Slot Non Si Liberano
- Verificare scheduler attivo: log `[SCHEDULER]`
- Chiamare manualmente `/api/admin/tasks/process-response-timers`

### Utenti Sempre Offline
- Verificare middleware registra login
- Controllare socket registra logout