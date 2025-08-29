import { db } from "./src/lib/db";

// Update league 1001 to include all roles
const result = db.prepare('UPDATE auction_leagues SET active_auction_roles = "P,D,C,A" WHERE id = 1001').run();
console.log('Updated league 1001 to include all roles. Changes:', result.changes);

// Verify the update
const league = db.prepare("SELECT id, name, active_auction_roles FROM auction_leagues WHERE id = 1001").get();
console.log("Updated league:", league);