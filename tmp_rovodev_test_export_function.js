// Test della funzione di export attuale
const { getLeagueRostersForCsvExport } = require('./src/lib/db/services/auction-league.service.ts');

async function testExportFunction() {
  console.log("=== TEST FUNZIONE EXPORT ATTUALE ===\n");

  try {
    // Test export lega 1
    console.log("1. TESTING EXPORT LEGA 1:");
    const csvRows = await getLeagueRostersForCsvExport(1);
    
    console.log(`Numero righe generate: ${csvRows.length}`);
    console.log("\nPrime 10 righe:");
    csvRows.slice(0, 10).forEach((row, index) => {
      console.log(`${index + 1}: ${row}`);
    });

    console.log("\nUltime 5 righe:");
    csvRows.slice(-5).forEach((row, index) => {
      console.log(`${csvRows.length - 5 + index + 1}: ${row}`);
    });

    // Analizza struttura
    console.log("\n2. ANALISI STRUTTURA:");
    const separatorCount = csvRows.filter(row => row === "$,$,$").length;
    const dataRows = csvRows.filter(row => row !== "$,$,$");
    console.log(`Separatori trovati: ${separatorCount}`);
    console.log(`Righe dati: ${dataRows.length}`);

    // Verifica formato
    console.log("\n3. VERIFICA FORMATO:");
    const sampleDataRows = dataRows.slice(0, 3);
    sampleDataRows.forEach(row => {
      const parts = row.split(',');
      console.log(`Riga: ${row}`);
      console.log(`  Parti: ${parts.length} - [${parts.join('] [')}]`);
    });

    // Test lega vuota (se esiste)
    console.log("\n4. TEST LEGA VUOTA/INESISTENTE:");
    try {
      const emptyResult = await getLeagueRostersForCsvExport(999);
      console.log(`Lega 999 (inesistente): ${emptyResult.length} righe`);
    } catch (error) {
      console.log(`Errore atteso per lega inesistente: ${error.message}`);
    }

    return { success: true, csvRows };
  } catch (error) {
    console.error("Errore durante il test:", error);
    return { success: false, error: error.message };
  }
}

// Esegui test
testExportFunction().then(result => {
  if (result.success) {
    console.log("\n✅ TEST COMPLETATO CON SUCCESSO");
    console.log("La funzione export funziona correttamente!");
  } else {
    console.log("\n❌ TEST FALLITO");
    console.log(`Errore: ${result.error}`);
  }
}).catch(error => {
  console.error("Errore fatale:", error);
});