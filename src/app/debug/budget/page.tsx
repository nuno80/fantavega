"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function BudgetDebugPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleVerification = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/debug/budget-verification?leagueId=2');
      const data = await res.json();

      console.log('=== BUDGET VERIFICATION RESULTS ===');
      console.log('Status:', data.status);

      if (data.status === 'success') {
        console.log('\n1. PARTICIPANTS:');
        console.table(data.data.participants);

        console.log('\n2. TRANSACTIONS (last 100):');
        console.table(data.data.transactions);

        console.log('\n3. PLAYER ASSIGNMENTS:');
        console.table(data.data.assignments);

        console.log('\n4. ACTIVE AUCTIONS:');
        console.table(data.data.activeAuctions);

        console.log('\n5. PENALTIES:');
        console.table(data.data.penalties);

        alert('Verifica completata! Controlla la console del browser (F12)');
      } else {
        console.error('Error:', data.error);
        console.error('Stack:', data.stack);
        alert('Errore durante la verifica. Controlla la console.');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      alert('Errore di rete. Controlla la console.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Budget Verification Debug</h1>

      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          Apri la console del browser (F12) e poi clicca il pulsante per eseguire la verifica.
        </p>
      </div>

      <Button
        onClick={handleVerification}
        disabled={isLoading}
      >
        {isLoading ? "Verifica in corso..." : "Esegui Verifica Budget"}
      </Button>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Cosa fa questa verifica?</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Verifica i budget attuali di tutti i partecipanti</li>
          <li>Controlla le transazioni di budget</li>
          <li>Verifica i giocatori assegnati e i crediti spesi</li>
          <li>Controlla le aste attive e i crediti bloccati</li>
          <li>Verifica le penalità applicate</li>
        </ul>
      </div>

      <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
          Formula di Verifica
        </h3>
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          Per ogni utente: <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">
            Disponibili + Bloccati + Spesi = Iniziale
          </code>
        </p>
      </div>
    </div>
  );
}
