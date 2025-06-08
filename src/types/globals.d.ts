// types/globals.d.ts
export {};
export type AppRole = "admin" | "manager";

declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      // Per sessioni browser standard
      role?: AppRole;
    };
    publicMetadata?: {
      // Per token JWT da template
      role?: AppRole;
    };
    // Clerk potrebbe anche usare 'public_metadata' (snake_case) direttamente
    // sull'oggetto sessionClaims se il token JWT lo ha così.
    // Per coprire questo, potremmo aggiungere un indice di stringa,
    // ma proviamo prima senza per vedere se i tipi sopra sono sufficienti.
    // Esempio con indice (più permissivo):
    // [key: string]: any; // Permette accesso a chiavi come sessionClaims['public_metadata']
  }
}
