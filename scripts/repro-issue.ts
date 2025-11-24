
import fs from "fs";
import path from "path";

// Manually load .env.local to ensure vars are set before imports
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
      process.env[key] = value;
    }
  });
  console.log("Loaded .env.local");
} else {
  console.error(".env.local not found");
  process.exit(1);
}

import * as XLSX from "xlsx";

async function runTest() {
  // Dynamic import to ensure env vars are loaded before db client initializes
  const { processPlayersExcel } = await import("../src/lib/db/services/player-import.service");

  console.log("Starting reproduction test against Turso...");

  // 1. Create mock data (50 players - 1 batch)
  const headers = ["Id", "R", "RM", "Nome", "Squadra", "Qt.A", "Qt.I", "Qt.A M", "Qt.I M", "FVM", "FVM M"];
  const data = [
    ["Fantavega Players List"], // Row 0
    headers, // Row 1
  ];

  for (let i = 1; i <= 50; i++) {
    data.push([
      i,
      "A",
      null,
      `Repro Player ${i}`,
      "Team A",
      10,
      10,
      null,
      null,
      100,
      null
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Tutti");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  // 2. Run import
  try {
    const result = await processPlayersExcel(buffer);
    console.log("Import result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("TEST FAILED with error:", error);
  }
}

runTest();
