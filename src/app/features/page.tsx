import { Navbar } from "@/components/navbar";

export default function FeaturesPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container py-10 text-center">
        <h1 className="text-4xl font-bold">Funzionalità</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Scopri tutte le potenti funzionalità che la nostra piattaforma ha da
          offrire.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-lg border p-6 text-left">
            <h3 className="text-xl font-bold">Design Responsive</h3>
            <p className="mt-2 text-muted-foreground">
              La nostra piattaforma si adatta automaticamente a qualsiasi
              dispositivo, fornendo un&apos;esperienza ottimale su desktop,
              tablet e mobile.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-lg border p-6 text-left">
            <h3 className="text-xl font-bold">Modalità Scura</h3>
            <p className="mt-2 text-muted-foreground">
              Passa tra temi chiari e scuri per ridurre l&apos;affaticamento
              degli occhi e migliorare la leggibilità in diverse condizioni di
              illuminazione.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-lg border p-6 text-left">
            <h3 className="text-xl font-bold">Prestazioni Veloci</h3>
            <p className="mt-2 text-muted-foreground">
              Ottimizzato per la velocità con tecnologie di nuova generazione
              per garantire che la tua esperienza sia sempre fluida e reattiva.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="rounded-lg border p-6 text-left">
            <h3 className="text-xl font-bold">Accessibilità</h3>
            <p className="mt-2 text-muted-foreground">
              Costruito pensando all&apos;accessibilità, garantendo che tutti
              possano utilizzare la nostra piattaforma indipendentemente dalle
              abilità.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="rounded-lg border p-6 text-left">
            <h3 className="text-xl font-bold">Personalizzazione</h3>
            <p className="mt-2 text-muted-foreground">
              Adatta l&apos;interfaccia alle tue preferenze con ampie opzioni di
              personalizzazione e impostazioni.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="rounded-lg border p-6 text-left">
            <h3 className="text-xl font-bold">Aggiornamenti Regolari</h3>
            <p className="mt-2 text-muted-foreground">
              Miglioriamo continuamente la nostra piattaforma con aggiornamenti
              regolari, nuove funzionalità e miglioramenti della sicurezza.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
