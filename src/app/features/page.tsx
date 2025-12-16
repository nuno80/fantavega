import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Banknote, DollarSign, Gavel, HandCoins, Info, ShieldCheck, Star, Trash2, X, Zap } from "lucide-react";

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Guida alle Funzionalità</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Scopri come funzionano i sistemi avanzati di Fantavega: dal sistema di Auto-Bid intelligente alla gestione automatica delle penalità.
          </p>
        </div>

        <Tabs defaultValue="autobid" className="mx-auto w-full max-w-5xl">
          <div className="flex justify-center mb-8">
            <TabsList className="grid w-full max-w-md grid-cols-4">
              <TabsTrigger value="auction">Asta</TabsTrigger>
              <TabsTrigger value="autobid">Auto-Bid</TabsTrigger>
              <TabsTrigger value="penalties">Penalità</TabsTrigger>
              <TabsTrigger value="credits">Crediti</TabsTrigger>
            </TabsList>
          </div>

          {/* AUCTION GUIDE SECTION */}
          <TabsContent value="auction" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-blue-500" />
                    Legenda Icone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      </div>
                      <div className="text-sm">
                        <p className="font-semibold">Il Tuo Team</p>
                        <p className="text-muted-foreground text-xs">Indica il tuo team per riconoscerlo a colpo d&apos;occhio.</p>
                      </div>
                    </div>



                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                        <Gavel className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="text-sm">
                        <p className="font-semibold">Asta Attiva</p>
                        <p className="text-muted-foreground text-xs">Indica che un&apos;asta è in corso. Clicca per rilanciare.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                        <DollarSign className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="text-sm">
                        <p className="font-semibold">Rilancia</p>
                        <p className="text-muted-foreground text-xs">Aumenta l&apos;offerta di 1 credito.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                        <X className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="text-sm">
                        <p className="font-semibold">Abbandona</p>
                        <p className="text-muted-foreground text-xs">Lascia l&apos;asta (disponibile solo se superati).</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                          P
                        </div>
                      </div>
                      <div className="text-sm">
                        <p className="font-semibold">Penalità</p>
                        <p className="text-muted-foreground text-xs">Penalità attiva applicata al manager.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </div>
                      <div className="text-sm">
                        <p className="font-semibold">Scarta Giocatore</p>
                        <p className="text-muted-foreground text-xs">Disponibile solo in fase di riparazione per liberare slot.</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gavel className="h-5 w-5 text-green-500" />
                    Come Partecipare
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <p className="font-semibold text-base">👁️ Dove vedo il Calciatore?</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      <li>
                        Se appare nella <strong>tua colonna</strong> (quella con la stella), significa che <strong>sei il miglior offerente</strong>.
                      </li>
                      <li>
                        Se appare nella tua colonna ma evidenziato in <strong>rosso con timer</strong>, significa che sei stato superato e devi decidere: <strong>rilanciare</strong> o abbandonare.
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-base">💰 Rilanciare</p>
                    <div className="rounded bg-muted p-2 dark:bg-muted/50">
                      <p>Il rilancio minimo è sempre <strong>+1 credito</strong>.</p>
                    </div>
                    <p className="text-muted-foreground">
                      Puoi usare il pulsante rapido (martelletto verde) nella colonna avversaria o aprire il dettaglio per un&apos;offerta manuale.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-base">🔒 Slot e Ruoli</p>
                    <p className="text-muted-foreground">
                      Puoi fare offerte solo se hai <strong>slot liberi</strong> per quel ruolo e <strong>budget disponibile</strong>.
                      Il sistema ti bloccherà automaticamente se non rispetti i requisiti.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AUTO-BID SECTION */}
          <TabsContent value="autobid" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Come Funziona
                  </CardTitle>
                  <CardDescription>
                    Un sistema intelligente che rilancia per te.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    L&apos;Auto-bid è una <strong>promessa di spesa</strong>. Quando imposti un importo massimo (es. 50 cr), il sistema blocca immediatamente quella somma dal tuo budget.
                  </p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                    <li>
                      <strong>Logica &quot;eBay&quot;:</strong> Il sistema rilancia automaticamente di 1 credito quando la tua offerta viene superata, fino al raggiungimento del tuo massimale.
                    </li>
                    <li>
                      <strong>Black Box:</strong> Nessuno (incluso te) vede i dettagli della battaglia automatica. Il sistema mostra solo il prezzo corrente risultante.
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-500" />
                    Priorità e Strategia
                  </CardTitle>
                  <CardDescription>
                    Chi vince in caso di parità?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    In caso di parità di offerta massima, vince <strong>chi ha impostato l&apos;auto-bid per primo</strong>.
                  </p>
                  <div className="rounded-lg bg-muted p-4 text-sm">
                    <strong>Esempio:</strong>
                    <br />
                    Manager A mette auto-bid a 50 oggi.
                    <br />
                    Manager B mette auto-bid a 50 domani.
                    <br />
                    L&apos;asta finisce a 50, ma vince il Manager A.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PENALTIES SECTION */}
          <TabsContent value="penalties" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* First Login Card */}
              <Card className="h-full border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                    Primo Accesso
                  </CardTitle>
                  <CardDescription>
                    Tempo per costruire il tuo team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Al <strong>primo login</strong>, il sistema di penalità <strong>non è attivo</strong>. Questo ti permette di costruire la tua rosa con calma, senza la pressione del timer.
                  </p>
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-sm">
                    <strong>⏱️ Logout Automatico:</strong>
                    <br />
                    Dopo <strong>30 secondi di inattività</strong>, verrai automaticamente disconnesso. Al successivo login, il sistema di compliance si attiverà.
                  </div>
                </CardContent>
              </Card>

              {/* Compliance Rules Card */}
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gavel className="h-5 w-5 text-red-500" />
                    Regole di Conformità
                  </CardTitle>
                  <CardDescription>
                    Dal secondo login in poi.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p>
                    Dal <strong>secondo login</strong>, il sistema verifica che tu abbia almeno <strong>N-1 giocatori</strong> per ogni ruolo attivo.
                  </p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>La verifica scatta automaticamente quando:</p>
                    <ul className="list-disc pl-5">
                      <li>Effettui il login</li>
                      <li>Perdi un&apos;asta (e resti scoperto)</li>
                      <li>Scade un&apos;asta senza vincitori</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Penalty Application Card */}
              <Card className="h-full md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Applicazione Penalità
                  </CardTitle>
                  <CardDescription>
                    Tempi e costi delle infrazioni.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">⏳ Periodo di Grazia</h4>
                      <p className="text-sm text-muted-foreground">
                        Hai <strong>1 ora</strong> di tempo per rimediare (acquistando o vincendo un&apos;asta) dal momento in cui diventi non conforme.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">💰 Costo</h4>
                      <p className="text-sm text-muted-foreground">
                        Se il timer scade, paghi <strong>5 crediti</strong> di penalità. Il ciclo si ripete ogni ora finché non torni conforme.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">🛑 Limite</h4>
                      <p className="text-sm text-muted-foreground">
                        Massimo <strong>5 penalità</strong> (25 crediti) per ciclo di non-conformità.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CREDITS SECTION */}
          <TabsContent value="credits" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-green-500" />
                    Tipi di Budget
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <p><strong>Disponibili:</strong></p>
                    <p className="text-muted-foreground">
                      Il budget reale che puoi usare per fare offerte manuali O impostare nuovi auto-bid (sottraendo i crediti già bloccati).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p><strong>Bloccati (&quot;Locked&quot;):</strong></p>
                    <p className="text-muted-foreground">
                      La somma di tutti i massimali dei tuoi auto-bid attivi. Questi crediti sono &quot;impegnati&quot; e non possono essere usati altrove.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HandCoins className="h-5 w-5 text-purple-500" />
                    Disp. Auto-Bid
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p>
                    Rappresenta il tuo &quot;potere di fuoco&quot; residuo per gli auto-bid.
                  </p>
                  <p className="text-muted-foreground">
                    Calcolato come: <br />
                    <code>Totale - Spesi - Bloccati</code>
                  </p>
                  <p className="text-muted-foreground">
                    Se provi a impostare un auto-bid superiore a questo valore, il sistema lo rifiuterà.
                  </p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-gray-500" />
                    Privacy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p>
                    Cosa vedono gli altri manager?
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-2">
                    <li>
                      Vedono il tuo <strong>Budget Residuo</strong> (al netto delle spese certe).
                    </li>
                    <li>
                      <strong>NON vedono</strong> i tuoi crediti bloccati in auto-bid. Il tuo &quot;Disponibile&quot; reale è nascosto per non rivelare le tue strategie.
                    </li>
                    <li>
                      Vedono le tue penalità accumulate (trasparenza totale).
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
