# SEC-003 — Mettere in sicurezza l'import Excel

## Obiettivo
Rimuovere le vulnerabilità del parser e imporre un budget di risorse all'upload amministrativo.

## Problema
`xlsx` 0.18.5 ha advisory prototype-pollution/ReDoS; l'handler legge l'intero file e non applica limiti rigorosi.

## Root Cause
Parser vulnerabile e validazione tardiva di tipo e dimensioni.

## Soluzione
Valutare una distribuzione SheetJS mantenuta o un parser alternativo; bloccare dimensione prima del buffering; allowlist MIME/estensione; limiti a fogli, righe, colonne e celle; timeout e validazione completa prima della scrittura.

## File coinvolti
`package.json`, `pnpm-lock.yaml`, `src/app/api/admin/players/upload-excel/route.ts`, parser/import service e test fixture.

## Modifiche
Adapter del parser, costanti di limite, errori 400/413, metriche di durata/dimensione senza contenuto sensibile.

## Compatibilità
Conservare il formato workbook supportato; testare file reali rappresentativi. Coordinare l'atomicità con REL-002 senza fonderne il commit.

## Test
File valido, MIME falso, file enorme, molte celle, formule/stringhe patologiche, workbook corrotto e corpus degli advisory.

## Verifica
Audit pulito per il parser scelto; richieste fuori budget rifiutate prima del parsing; memoria e tempo entro soglie definite.

## Criteri di accettazione
- Nessun advisory noto applicabile al parser.
- Limiti documentati e testati.
- Import valido retrocompatibile.
- Nessuna modifica DB per file rifiutati.

## Rischi
Differenze di parsing di date/numeri e licenza/distribuzione del pacchetto. Validare API, licenza e fixture prima dell'adozione.
