// src/lib/validators/league.validators.ts v.1.2
// Schema Zod che usa i minuti per la durata del timer, per maggiore flessibilità.
// 1. Importazione di Zod
import { z } from "zod";

// 2. Definizione dello schema di base
const baseSchema = z.object({
  name: z
    .string()
    .min(3, {
      message: "Il nome della lega deve essere di almeno 3 caratteri.",
    })
    .max(50, { message: "Il nome non può superare i 50 caratteri." }),

  league_type: z.enum(["classic", "mantra"], {
    errorMap: () => ({ message: "Seleziona un tipo di lega valido." }),
  }),

  initial_budget_per_manager: z.coerce
    .number({ invalid_type_error: "Il budget deve essere un numero." })
    .int()
    .positive({ message: "Il budget deve essere un numero positivo." }),

  slots_P: z.coerce.number().int().min(1, { message: "Minimo 1 portiere." }),
  slots_D: z.coerce.number().int().min(1, { message: "Minimo 1 difensore." }),
  slots_C: z.coerce
    .number()
    .int()
    .min(1, { message: "Minimo 1 centrocampista." }),
  slots_A: z.coerce.number().int().min(1, { message: "Minimo 1 attaccante." }),

  // MODIFICATO: da ore a minuti per maggiore flessibilità
  timer_duration_minutes: z.coerce
    .number()
    .int()
    .min(1, { message: "La durata minima è 1 minuto." })
    .max(2880, { message: "La durata massima è 48 ore (2880 minuti)." }),

  min_bid_rule: z.enum(["fixed", "player_quotation"], {
    errorMap: () => ({ message: "Seleziona una regola per l'offerta minima." }),
  }),

  min_bid: z.coerce
    .number()
    .int()
    .positive({ message: "L'offerta minima deve essere positiva." })
    .optional(),
});

// 3. Schema raffinato per la validazione condizionale
export const CreateLeagueSchema = baseSchema.refine(
  (data) => {
    if (data.min_bid_rule === "fixed") {
      return data.min_bid !== undefined && data.min_bid > 0;
    }
    return true;
  },
  {
    message:
      "Se la regola è 'Offerta Fissa', è necessario specificare un valore minimo positivo.",
    path: ["min_bid"],
  }
);

// 4. Esportazione del tipo TypeScript inferito dallo schema
export type CreateLeagueData = z.infer<typeof CreateLeagueSchema>;
