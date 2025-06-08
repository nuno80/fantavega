// types/globals.d.ts

export {}; // Questa riga è importante!

// Definisci i tuoi ruoli applicativi
export type AppRole = "admin" | "manager"; // Ho aggiunto 'manager' come esempio, adatta ai tuoi bisogni

declare global {
  interface CustomJwtSessionClaims {
    // Questa è la struttura che vediamo nel token JWT generato dal template
    // quando includi {{user.public_metadata}}
    publicMetadata?: { // publicMetadata è opzionale sull'oggetto sessionClaims
      role?: AppRole;   // role è opzionale dentro publicMetadata e del tipo AppRole
      // Aggiungi qui altre proprietà che hai in publicMetadata se necessario
      // Esempio: team_id?: string;
    };

    // È una buona pratica definire anche 'metadata' se Clerk potesse mapparlo lì
    // in altri scenari (es. sessioni browser standard vs token template).
    // Se sessionClaims.metadata viene popolato in qualche modo, questo lo copre.
    metadata?: {
      role?: AppRole;
      // Altre proprietà potenziali in metadata
    };

    // Puoi aggiungere qui altre claims personalizzate di primo livello se le metti nel token
    // Esempio: organization_id?: string;
  }
}