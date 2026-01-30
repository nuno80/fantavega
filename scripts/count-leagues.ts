import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function deleteLeagues() {
  const leagueIds = [6, 7];
  console.log('=== CANCELLAZIONE LEGHE 6 e 7 ===\n');

  // Le foreign keys con ON DELETE CASCADE elimineranno automaticamente i dati correlati
  // Ma per sicurezza e chiarezza, eliminiamo esplicitamente nell'ordine corretto

  const tables = [
    { name: 'processed_login_sessions', query: 'DELETE FROM processed_login_sessions WHERE user_id IN (SELECT user_id FROM league_participants WHERE league_id IN (6, 7))' },
    { name: 'user_league_compliance_status', query: 'DELETE FROM user_league_compliance_status WHERE league_id IN (6, 7)' },
    { name: 'user_player_preferences', query: 'DELETE FROM user_player_preferences WHERE league_id IN (6, 7)' },
    { name: 'user_auction_response_timers', query: 'DELETE FROM user_auction_response_timers WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id IN (6, 7))' },
    { name: 'user_auction_cooldowns', query: 'DELETE FROM user_auction_cooldowns WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id IN (6, 7))' },
    { name: 'auto_bids', query: 'DELETE FROM auto_bids WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id IN (6, 7))' },
    { name: 'bids', query: 'DELETE FROM bids WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id IN (6, 7))' },
    { name: 'budget_transactions', query: 'DELETE FROM budget_transactions WHERE auction_league_id IN (6, 7)' },
    { name: 'player_discard_requests', query: 'DELETE FROM player_discard_requests WHERE auction_league_id IN (6, 7)' },
    { name: 'player_assignments', query: 'DELETE FROM player_assignments WHERE auction_league_id IN (6, 7)' },
    { name: 'auctions', query: 'DELETE FROM auctions WHERE auction_league_id IN (6, 7)' },
    { name: 'league_participants', query: 'DELETE FROM league_participants WHERE league_id IN (6, 7)' },
    { name: 'auction_leagues', query: 'DELETE FROM auction_leagues WHERE id IN (6, 7)' },
  ];

  for (const table of tables) {
    try {
      const result = await client.execute(table.query);
      console.log(`✅ ${table.name}: ${result.rowsAffected} righe eliminate`);
    } catch (error: unknown) {
      const err = error as Error;
      console.log(`⚠️  ${table.name}: ${err.message}`);
    }
  }

  // Verifica finale
  console.log('\n=== VERIFICA FINALE ===');
  const remaining = await client.execute('SELECT * FROM auction_leagues');
  console.log(`Leghe rimanenti: ${remaining.rows.length}`);
  remaining.rows.forEach((row, i) => {
    console.log(`  ${i + 1}. ID: ${row.id}, Nome: ${row.name}`);
  });
}

deleteLeagues().catch(console.error);
