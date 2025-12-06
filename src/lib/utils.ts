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
