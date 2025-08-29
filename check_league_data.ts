import { db } from "./src/lib/db";

// Check league data
const leagues = db.prepare("SELECT id, name, active_auction_roles FROM auction_leagues").all();
console.log("Leagues:", leagues);

// Check a specific league
const league = db.prepare("SELECT * FROM auction_leagues WHERE id = 1").get();
console.log("League 1:", league);