import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getPlayerImageUrl(playerId: number | undefined, photoUrl?: string | null): string {
  if (photoUrl && photoUrl.trim() !== "") return photoUrl;
  if (!playerId) return "";
  return `https://content.fantacalcio.it/web/cfa/calciatori/large/${playerId}.png`;
}

/**
 * Mappa dei nomi delle squadre ai loro ID per i loghi.
 * Usa i loghi placeholder gratuiti.
 */
const TEAM_ID_MAP: Record<string, number> = {
  // Serie A 2024-25 (IDs da API-Football)
  "atalanta": 499,
  "bologna": 500,
  "cagliari": 490,
  "como": 520,
  "empoli": 511,
  "fiorentina": 502,
  "genoa": 495,
  "inter": 505,
  "juventus": 496,
  "lazio": 487,
  "lecce": 867,
  "milan": 489,
  "monza": 1579,
  "napoli": 492,
  "parma": 523,
  "roma": 497,
  "torino": 503,
  "udinese": 494,
  "venezia": 517,
  "verona": 504,
  // Varianti comuni
  "hellas verona": 504,
  "hellas": 504,
  "ac milan": 489,
  "as roma": 497,
  "fc inter": 505,
  "internazionale": 505,
  "juventus fc": 496,
  "juve": 496,
  "ssc napoli": 492,
  "acf fiorentina": 502,
  // Serie B comuni
  "pisa": 522,
  "sassuolo": 488,
  "sampdoria": 498,
  "spezia": 514,
  "cremonese": 512,
  "frosinone": 1343,
  "salernitana": 519,
};

/**
 * Ritorna l'URL del logo della squadra.
 * Usa i loghi da media.api-sports.io (gratuiti per uso non commerciale).
 */
export function getTeamLogoUrl(teamName: string): string {
  const normalizedTeam = teamName.toLowerCase().trim();
  const teamId = TEAM_ID_MAP[normalizedTeam];

  if (teamId) {
    // Usa loghi da API-Sports (funzionano senza API key per le immagini)
    return `https://media.api-sports.io/football/teams/${teamId}.png`;
  }

  // Fallback: placeholder generico
  return "";
}
