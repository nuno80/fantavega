// src/lib/db/utils.ts
import type { Client } from "@libsql/client";
import fs from "fs";

/**
 * Applica un file di schema SQL a un'istanza di database fornita.
 * @param client L'istanza del client @libsql/client.
 * @param schemaFilePath Il percorso al file .sql dello schema.
 */
export async function applySchemaToDb(
  client: Client,
  schemaFilePath: string
): Promise<void> {
  console.log(
    `[Schema Apply Util] Attempting to apply schema from: ${schemaFilePath}`
  );
  if (!fs.existsSync(schemaFilePath)) {
    const errorMessage = `[Schema Apply Util] Error: Schema file not found at ${schemaFilePath}. Cannot apply schema.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    const schemaSql = fs.readFileSync(schemaFilePath, "utf8");
    if (schemaSql.trim() === "") {
      console.warn(
        `[Schema Apply Util] Schema file (${schemaFilePath}) is empty. No schema applied.`
      );
      return;
    }

    console.log(`[Schema Apply Util] Executing SQL from ${schemaFilePath}...`);

    // @libsql/client supporta executeMultiple per eseguire script SQL completi
    await client.executeMultiple(schemaSql);

    console.log("[Schema Apply Util] Schema SQL applied successfully.");
  } catch (error) {
    console.error(
      `[Schema Apply Util] Error applying schema SQL from ${schemaFilePath}:`,
      error
    );
    throw error;
  }
}
