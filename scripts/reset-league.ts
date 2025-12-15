import { createClient } from '@libsql/client';

// Script per resettare completamente una lega d'asta
// Uso: source .env.local && TURSO_DATABASE_URL="$TURSO_DATABASE_URL" TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" npx tsx scripts/reset-league.ts <league_id>

async function main() {
  const leagueId = parseInt(process.argv[2] || '6', 10); // Default: lega 6 (Test Fantavega)

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  console.log(`\n🔄 Reset della lega ID: ${leagueId}\n`);

  // 1. Get league info
  const leagueInfo = await client.execute({
    sql: 'SELECT id, name, initial_budget_per_manager FROM auction_leagues WHERE id = ?',
    args: [leagueId]
  });

  if (leagueInfo.rows.length === 0) {
    console.error('❌ Lega non trovata!');
    process.exit(1);
  }

  const league = leagueInfo.rows[0];
  console.log(`📋 Lega: ${league.name}`);
  console.log(`💰 Budget iniziale: ${league.initial_budget_per_manager}`);

  // 2. Count items to delete
  const counts = {
    auctions: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM auctions WHERE auction_league_id = ?', args: [leagueId] })).rows[0].c,
    bids: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM bids WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] })).rows[0].c,
    player_assignments: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM player_assignments WHERE auction_league_id = ?', args: [leagueId] })).rows[0].c,
    budget_transactions: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM budget_transactions WHERE auction_league_id = ?', args: [leagueId] })).rows[0].c,
    auto_bids: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM auto_bids WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] })).rows[0].c,
    compliance_status: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM user_league_compliance_status WHERE league_id = ?', args: [leagueId] })).rows[0].c,
    response_timers: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM user_auction_response_timers WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] })).rows[0].c,
    cooldowns: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM user_auction_cooldowns WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] })).rows[0].c,
    participants: (await client.execute({ sql: 'SELECT COUNT(*) as c FROM league_participants WHERE league_id = ?', args: [leagueId] })).rows[0].c,
  };

  console.log('\n📊 Elementi da eliminare/resettare:');
  console.log(`   - Aste: ${counts.auctions}`);
  console.log(`   - Offerte: ${counts.bids}`);
  console.log(`   - Giocatori assegnati: ${counts.player_assignments}`);
  console.log(`   - Transazioni budget: ${counts.budget_transactions}`);
  console.log(`   - Auto-bid: ${counts.auto_bids}`);
  console.log(`   - Timer risposta: ${counts.response_timers}`);
  console.log(`   - Cooldown: ${counts.cooldowns}`);
  console.log(`   - Stati compliance: ${counts.compliance_status}`);
  console.log(`   - Partecipanti da resettare: ${counts.participants}`);

  console.log('\n🗑️  Esecuzione reset...\n');

  // 3. Execute deletions in order (rispettando le foreign key)

  // Prima elimina le tabelle dipendenti dalle aste
  await client.execute({ sql: 'DELETE FROM auto_bids WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] });
  console.log('   ✅ Auto-bids eliminati');

  await client.execute({ sql: 'DELETE FROM bids WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] });
  console.log('   ✅ Offerte eliminate');

  await client.execute({ sql: 'DELETE FROM user_auction_response_timers WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] });
  console.log('   ✅ Timer risposta eliminati');

  await client.execute({ sql: 'DELETE FROM user_auction_cooldowns WHERE auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)', args: [leagueId] });
  console.log('   ✅ Cooldown eliminati');

  await client.execute({ sql: 'DELETE FROM auctions WHERE auction_league_id = ?', args: [leagueId] });
  console.log('   ✅ Aste eliminate');

  await client.execute({ sql: 'DELETE FROM player_assignments WHERE auction_league_id = ?', args: [leagueId] });
  console.log('   ✅ Assegnazioni giocatori eliminate');

  await client.execute({ sql: 'DELETE FROM budget_transactions WHERE auction_league_id = ?', args: [leagueId] });
  console.log('   ✅ Transazioni budget eliminate');

  await client.execute({ sql: 'DELETE FROM user_league_compliance_status WHERE league_id = ?', args: [leagueId] });
  console.log('   ✅ Stati compliance eliminati');

  // 4. Reset budget E contatori giocatori dei partecipanti (nota: usa league_id, non auction_league_id)
  await client.execute({
    sql: `UPDATE league_participants
          SET current_budget = ?,
              locked_credits = 0,
              players_P_acquired = 0,
              players_D_acquired = 0,
              players_C_acquired = 0,
              players_A_acquired = 0
          WHERE league_id = ?`,
    args: [league.initial_budget_per_manager, leagueId]
  });
  console.log('   ✅ Budget e contatori giocatori partecipanti resettati');

  console.log('\n✨ Reset completato con successo!\n');

  // 5. Verifica finale
  const participants = await client.execute({
    sql: `SELECT lp.user_id, u.full_name, lp.manager_team_name, lp.current_budget, lp.locked_credits
          FROM league_participants lp
          JOIN users u ON lp.user_id = u.id
          WHERE lp.league_id = ?`,
    args: [leagueId]
  });

  console.log('📋 Stato finale partecipanti:');
  for (const p of participants.rows) {
    console.log(`   - ${p.manager_team_name || p.full_name}: Budget=${p.current_budget}, Bloccati=${p.locked_credits}`);
  }
}

main().catch(console.error);
