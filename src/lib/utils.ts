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
 * Mappa dei nomi delle squadre ai loro ID su Lega Serie A per i loghi.
 * URL pattern: https://img.legaseriea.it/vimages/64df7bcf/[NOME_SQUADRA].png
 */
const TEAM_LOGO_MAP: Record<string, string> = {
  // Serie A 2024-25
  "atalanta": "atalanta",
  "bologna": "bologna",
  "cagliari": "cagliari",
  "como": "como",
  "empoli": "empoli",
  "fiorentina": "fiorentina",
  "genoa": "genoa",
  "inter": "inter",
  "juventus": "juventus",
  "lazio": "lazio",
  "lecce": "lecce",
  "milan": "milan",
  "monza": "monza",
  "napoli": "napoli",
  "parma": "parma",
  "roma": "roma",
  "torino": "torino",
  "udinese": "udinese",
  "venezia": "venezia",
  "verona": "verona",
  // Varianti comuni
  "hellas verona": "verona",
  "hellas": "verona",
  "ac milan": "milan",
  "as roma": "roma",
  "fc inter": "inter",
  "internazionale": "inter",
  "juventus fc": "juventus",
  "juve": "juventus",
  "ssc napoli": "napoli",
  "acf fiorentina": "fiorentina",
  "pisa": "pisa",
  "sassuolo": "sassuolo",
  "sampdoria": "sampdoria",
  "spezia": "spezia",
  "cremonese": "cremonese",
  "frosinone": "frosinone",
  "salernitana": "salernitana",
};

/**
 * Ritorna l'URL del logo della squadra.
 * Usa i loghi dalla Lega Serie A.
 */
export function getTeamLogoUrl(teamName: string): string {
  const normalizedTeam = teamName.toLowerCase().trim();
  const mappedTeam = TEAM_LOGO_MAP[normalizedTeam] || normalizedTeam.replace(/\s+/g, "-");

  // Usa i loghi da Lega Serie A (formato 64x64)
  return `https://img.legaseriea.it/vimages/64df7bcf/${mappedTeam}.png`;
}
