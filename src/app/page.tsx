import Link from "next/link";

import { Gavel, Heart, Target, Timer, Trophy, Users, Zap } from "lucide-react";

import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900 selection:bg-blue-500/30 dark:bg-slate-950 dark:text-slate-50">
      {/* Background Gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-[500px] w-[500px] rounded-full bg-blue-500/20 blur-[100px] sm:h-[800px] sm:w-[800px]" />
        <div className="absolute -right-1/4 bottom-0 h-[500px] w-[500px] rounded-full bg-purple-500/20 blur-[100px] sm:h-[800px] sm:w-[800px]" />
        <div className="absolute left-1/3 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[80px]" />
      </div>

      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="container relative z-10 mx-auto px-4 text-center">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
            <span className="mb-4 inline-block rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-700 shadow-sm dark:bg-blue-500/10 dark:text-blue-300">
              🚀 La nuova era del Fantacalcio
            </span>
            <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight md:text-7xl lg:text-8xl">
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400">
                Fantavega
              </span>
            </h1>
            <p className="mb-8 text-2xl font-medium text-slate-600 dark:text-slate-300 md:text-3xl">
              Dove il pianto diventa <span className="text-blue-600 dark:text-blue-400">Arte</span>. 🎨😭
            </p>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-500 dark:text-slate-400 md:text-xl">
              L&apos;unica piattaforma che trasforma le aste sbagliate e i crediti sprecati in un&apos;esperienza utente indimenticabile.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/auctions">
                <Button
                  size="xl"
                  className="group relative h-12 w-full min-w-[200px] overflow-hidden rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-105 hover:shadow-blue-500/40 sm:w-auto"
                >
                  <span className="relative z-10 flex items-center justify-center">
                    <Gavel className="mr-2 h-5 w-5 transition-transform group-hover:rotate-12" />
                    Inizia l&apos;Asta
                  </span>
                  <div className="absolute inset-0 -z-10 translate-y-full bg-gradient-to-r from-indigo-600 to-blue-600 transition-transform duration-300 group-hover:translate-y-0" />
                </Button>
              </Link>
              <Link href="/features">
                <Button
                  variant="outline"
                  size="xl"
                  className="h-12 w-full min-w-[200px] rounded-full border-slate-200 bg-white/50 text-lg backdrop-blur-sm transition-all hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 sm:w-auto"
                >
                  <Heart className="mr-2 h-5 w-5 text-red-500" />
                  Scopri di più
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-5xl">
              Perché scegliere il <span className="text-purple-600 dark:text-purple-400">Dolore</span>?
            </h2>
            <p className="text-lg text-slate-500 dark:text-slate-400">
              Funzionalità pensate per massimizzare l&apos;ansia e il divertimento.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Timer,
                color: "text-blue-500",
                bg: "bg-blue-500/10",
                title: "Real-time Adrenaline",
                desc: "Ogni secondo conta. Il timer non perdona.",
              },
              {
                icon: Zap,
                color: "text-amber-500",
                bg: "bg-amber-500/10",
                title: "Auto-Bid AI",
                desc: "L'IA spende i tuoi soldi mentre dormi.",
              },
              {
                icon: Users,
                color: "text-green-500",
                bg: "bg-green-500/10",
                title: "Lega Caotica",
                desc: "Gestisci o distruggi le tue amicizie.",
              },
              {
                icon: Trophy,
                color: "text-red-500",
                bg: "bg-red-500/10",
                title: "Penalità Brutali",
                desc: "Sbaglia la formazione, paga con il sangue.",
              },
            ].map((feature, i) => (
              <Card
                key={i}
                className="group relative overflow-hidden border-slate-200 bg-white/40 backdrop-blur-md transition-all hover:-translate-y-2 hover:shadow-2xl dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-slate-50 opacity-0 transition-opacity group-hover:opacity-50 dark:to-slate-800" />
                <CardHeader>
                  <div className={`mb-4 w-fit rounded-2xl p-4 ${feature.bg}`}>
                    <feature.icon className={`h-8 w-8 ${feature.color}`} />
                  </div>
                  <CardTitle className="text-xl font-bold">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-500 dark:text-slate-400">
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900/50" />
        <div className="container relative mx-auto px-4">
          <div className="grid gap-12 text-center md:grid-cols-3">
            {[
              { label: "Lacrime Versate", value: "1.3M+", color: "text-blue-500" },
              { label: "Amicizie Perse", value: "42", color: "text-purple-500" },
              { label: "Offerenti Pentiti", value: "100%", color: "text-red-500" },
            ].map((stat, i) => (
              <div key={i} className="group cursor-default">
                <div className={`text-5xl font-extrabold md:text-7xl ${stat.color} transition-transform duration-300 group-hover:scale-110`}>
                  {stat.value}
                </div>
                <div className="mt-2 text-lg font-medium text-slate-600 dark:text-slate-300">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <h2 className="mb-16 text-center text-3xl font-bold md:text-4xl">
            Dicono di noi (urlano, in realtà)
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                quote: "Ho speso tutto per Lukaku e si è rotto al riscaldamento. 10/10 lo rifarei.",
                author: "Marco, ex vincitore",
                role: "Utente Disperato",
              },
              {
                quote: "L'auto-bid ha rilanciato su un portiere di riserva mentre ero in bagno. Geniale.",
                author: "Giulia, stratega",
                role: "Vittima dell'IA",
              },
            ].map((t, i) => (
              <Card key={i} className="border-none bg-slate-100/50 p-6 dark:bg-slate-800/50">
                <div className="flex items-start gap-4">
                  <div className="rounded-full bg-slate-200 p-2 dark:bg-slate-700">
                    <span className="text-2xl">💬</span>
                  </div>
                  <div>
                    <p className="mb-4 text-lg italic text-slate-700 dark:text-slate-300">
                      &quot;{t.quote}&quot;
                    </p>
                    <div>
                      <span className="block font-bold">{t.author}</span>
                      <span className="text-sm text-slate-500">{t.role}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="relative overflow-hidden py-24 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700 opacity-90 dark:opacity-80" />
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-20" />

        <div className="container relative z-10 mx-auto px-4">
          <h2 className="mb-6 text-4xl font-bold text-white md:text-5xl">
            Pronto a soffrire?
          </h2>
          <p className="mb-10 text-xl text-blue-100">
            Unisciti a Fantavega oggi. Il dolore ti aspetta.
          </p>
          <Link href="/auctions">
            <Button size="xl" className="h-14 min-w-[250px] rounded-full bg-white text-lg font-bold text-blue-600 shadow-2xl transition-all hover:scale-105 hover:bg-slate-50">
              <Target className="mr-2 h-6 w-6" />
              Inizia la Sfida
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 py-12 dark:border-slate-800 dark:bg-slate-950">
        <div className="container mx-auto px-4 text-center text-slate-500">
          <p className="mb-4 font-medium">© 2024 Fantavega. Made with 💔 for fantasy football lovers.</p>
          <div className="flex justify-center gap-6">
            <Link href="#" className="hover:text-blue-500">Terms</Link>
            <Link href="#" className="hover:text-blue-500">Privacy</Link>
            <Link href="#" className="hover:text-blue-500">Rules</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
