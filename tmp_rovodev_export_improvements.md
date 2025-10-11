# Miglioramenti Esportazione Squadre - Piano Implementazione

## STATO ATTUALE: FUNZIONANTE ✅
- 2 squadre nella lega 1: "fede" (7 giocatori), "red" (8 giocatori)
- Sistema export base implementato
- API e frontend pronti

## MIGLIORAMENTI DA IMPLEMENTARE

### 1. MIGLIORAMENTO FORMATO EXCEL (Priorità Alta)
**Problema**: Attualmente genera CSV con estensione .xlsx
**Soluzione**: Implementare vero Excel con libreria SheetJS

### 2. HEADER CSV (Priorità Alta)  
**Problema**: CSV senza header
**Soluzione**: Aggiungere header con metadati lega

### 3. FORMATO CUSTOM MIGLIORATO (Priorità Media)
**Problema**: Formato custom è identico al CSV
**Soluzione**: Formato JSON dettagliato con statistiche

### 4. PREVIEW FORMATO (Priorità Media)
**Problema**: Utente non vede anteprima
**Soluzione**: Mostrare preview nell'UI

## IMPLEMENTAZIONE PROPOSTA

### Step 1: Installare libreria Excel
```bash
pnpm add xlsx
```

### Step 2: Migliorare API route.ts
- Aggiungere vero supporto Excel
- Header CSV con metadati
- Formato JSON per custom

### Step 3: Migliorare servizio
- Header informativi
- Statistiche squadra
- Validazioni migliori

### Step 4: Migliorare UI
- Preview formato
- Download progress
- Statistiche export

## RISULTATO ATTESO
- Export Excel vero con fogli multipli
- CSV con header informativi  
- Formato custom JSON ricco
- UI migliorata con preview