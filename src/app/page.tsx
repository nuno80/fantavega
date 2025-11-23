import Link from "next/link";

import { Gavel, Heart, Target, Timer, Trophy, Users, Zap } from "lucide-react";

import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
      <Navbar />

      {/* Hero Section */}
      <section className="container relative py-16 text-center">
        <div className="mx-auto max-w-4xl">
          {/* Main Title with Gradient */}
          <h1 className="mb-6 text-6xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 bg-clip-text text-transparent">
              Fantavega
            </span>
          </h1>

          {/* Motto */}
          <p className="mb-8 text-2xl font-bold text-gray-700 dark:text-gray-300">
            dove piangere è un obbligo! 😭⚽
          </p>

          {/* Subtitle */}
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground">
            La piattaforma di aste fantasy più emozionante d&apos;Italia. Preparati a
            vivere tensioni, delusioni e (forse) qualche vittoria!
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link href="/auctions">
              <Button
                size="lg"
                className="min-w-[200px] bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
              >
                <Gavel className="mr-2 h-5 w-5" />
                Inizia a Piangere
              </Button>
            </Link>
            <Link href="/features">
              <Button variant="outline" size="lg" className="min-w-[200px]">
                <Heart className="mr-2 h-5 w-5" />
                Scopri le Features
              </Button>
            </Link>
          </div>
        </div>

        {/* Floating Emojis Animation */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-1/4 animate-bounce text-4xl opacity-20">
            ⚽
          </div>
          <div className="animation-delay-1000 absolute right-1/4 top-1/3 animate-bounce text-4xl opacity-20">
            😭
          </div>
          <div className="animation-delay-2000 absolute bottom-1/4 left-1/3 animate-bounce text-4xl opacity-20">
            🏆
          </div>
          <div className="animation-delay-3000 absolute bottom-1/3 right-1/3 animate-bounce text-4xl opacity-20">
            💰
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Perché scegliere Fantavega per soffrire?
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="text-center transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                  <Timer className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg">Aste in Tempo Reale</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Vivi l&apos;adrenalina dell&apos;asta dal vivo. Ogni secondo conta, ogni
                  offerta è una pugnalata al cuore.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                  <Zap className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-lg">Auto-Bid Intelligente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Lascia che l&apos;IA faccia le offerte per te. Così potrai piangere
                  anche quando non ci sei!
                </p>
              </CardContent>
            </Card>

            <Card className="text-center transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <Users className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-lg">Gestione Leghe</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Crea e gestisci le tue leghe. Organizza il caos, amministra le
                  lacrime.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                  <Target className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-lg">Sistema Penalità</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Non rispetti le regole? Paghi. Letteralmente. Il fair play ha
                  un prezzo.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-muted/30 py-16">
        <div className="container">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-12 text-3xl font-bold">
              Le nostre statistiche del dolore
            </h2>

            <div className="grid gap-8 md:grid-cols-3">
              <div>
                <div className="mb-2 text-4xl font-bold text-blue-600">
                  1,337
                </div>
                <p className="text-muted-foreground">Lacrime versate</p>
              </div>
              <div>
                <div className="mb-2 text-4xl font-bold text-purple-600">
                  42
                </div>
                <p className="text-muted-foreground">Amicizie rovinate</p>
              </div>
              <div>
                <div className="mb-2 text-4xl font-bold text-red-600">∞</div>
                <p className="text-muted-foreground">Rimpianti per vita</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="container py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-12 text-3xl font-bold">
            Cosa dicono i nostri utenti (tra le lacrime)
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <p className="mb-4 italic">
                  &quot;Ho perso Mbappé per 1 credito. Ancora non riesco a dormire.
                  Fantavega mi ha rovinato la vita... e non posso più farne a
                  meno! 😭&quot;
                </p>
                <p className="text-sm font-semibold">
                  - Marco, utente dal 2024
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <p className="mb-4 italic">
                  &quot;L&apos;auto-bid ha comprato Pellegrini per 15 crediti mentre ero
                  al bagno. Perfetto, proprio quello che volevo... NOT! 💸&quot;
                </p>
                <p className="text-sm font-semibold">
                  - Giulia, vittima dell&apos;IA
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 py-16 text-white">
        <div className="container text-center">
          <h2 className="mb-6 text-3xl font-bold">
            Pronto per il tuo primo trauma calcistico?
          </h2>
          <p className="mb-8 text-xl opacity-90">
            Unisciti alla community di Fantavega e scopri nuovi modi di
            soffrire!
          </p>
          <Link href="/auctions">
            <Button size="lg" variant="secondary" className="min-w-[250px]">
              <Trophy className="mr-2 h-5 w-5" />
              Inizia la Tua Sofferenza
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>
            © 2024 Fantavega - Dove i sogni vanno a morire e i portafogli
            piangono.
          </p>
          <p className="mt-2">
            Made with 💔 and lots of ☕ for all the fantasy football addicts.
          </p>
        </div>
      </footer>
    </div>
  );
}
