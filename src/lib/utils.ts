import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import IMAGE_MAP from "./player_image_map.json";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TEAM_ID_MAP: Record<string, number> = {
  // Serie A 2024/25
  atalanta: 499,
  bologna: 500,
  cagliari: 490,
  como: 928,
  cremonese: 520,
  empoli: 511,
  fiorentina: 502,
  genoa: 495,
  "hellas verona": 504,
  verona: 504,
  inter: 505,
  juventus: 496,
  lazio: 487,
  lecce: 867,
  milan: 489,
  monza: 1573,
  napoli: 492,
  parma: 523,
  pisa: 506,
  roma: 497,
  sassuolo: 488,
  torino: 503,
  udinese: 494,
  venezia: 517,
  salernitana: 514,
  spezia: 515,
  frosinone: 512,
  test_team: 0,
};

export function getTeamLogoUrl(teamName: string): string {
  if (!teamName) return "";
  const normalizedTeam = teamName.toLowerCase().trim();

  // List of teams with local logos (uploaded by user)
  const LOCAL_LOGOS = [
    "atalanta",
    "bologna",
    "cagliari",
    "como",
    "cremonese",
    "fiorentina",
    "inter",
    "juventus",
    "lecce",
    "milan",
    "napoli",
    "parma",
    "pisa",
    "roma",
    "sassuolo",
    "torino",
    "udinese",
  ];

  if (LOCAL_LOGOS.includes(normalizedTeam)) {
    return `/seria_A/loghi/${normalizedTeam}.png`;
  }

  // Fallback to API-Sports for others (Lazio, Genoa, Verona, etc.)
  const teamId = TEAM_ID_MAP[normalizedTeam];
  if (teamId) {
    return `https://media.api-sports.io/football/teams/${teamId}.png`;
  }

  return "";
}

export function getFantacalcioImageUrl(playerId: number): string {
  if (!playerId) return "";
  return `https://content.fantacalcio.it/web/cfa/calciatori/large/${playerId}.png`;
}

export function getPlayerImageUrl(
  playerId: number | undefined,
  photoUrl?: string | null,
  playerName?: string,
  playerTeam?: string
): string {
  // 1. Priority: Local File System via Map (Highest reliability for this project)
  // We check this FIRST to override broken "fantacalcio.it" URLs in the DB
  if (playerName && playerTeam) {
    const slugify = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    const teamSlug = slugify(playerTeam);
    const playerSlug = slugify(playerName);

    // Lookup in generated map
    const key = `${teamSlug}/${playerSlug}` as keyof typeof IMAGE_MAP;
    const mappedFilename = IMAGE_MAP[key];

    if (mappedFilename) {
      return `/seria_A/${teamSlug}/${mappedFilename}`;
    }
  }

  // 2. Priority: External URL from DB
  // Use this if we don't have a local match (e.g. manually added photo)
  if (photoUrl && photoUrl.trim() !== "") return photoUrl;

  // 3. Fallback: Fantacalcio ID (Likely blocked, but kept as last resort)
  if (playerId) {
    return getFantacalcioImageUrl(playerId);
  }

  return "";
}
