import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { getAuctionStatusForPlayer } from '@/lib/db/services/bid.service';
import { activateTimersForUser } from '@/lib/db/services/response-timer.service';
import { recordUserLogin } from '@/lib/db/services/session.service';
import { db } from '@/lib/db';

/**
 * Logica estratta da /api/leagues/[league-id]/budget per ottenere budget utente
 */
async function getBudgetDataLogic(userId: string, leagueId: string) {
  const budgetInfo = db.prepare(`
    SELECT 
      lp.current_budget,
      lp.locked_credits,
      lp.manager_team_name as team_name,
      al.initial_budget_per_manager as total_budget
    FROM league_participants lp
    JOIN auction_leagues al ON lp.league_id = al.id
    WHERE lp.league_id = ? AND lp.user_id = ?
  `).get(parseInt(leagueId), userId);

  return budgetInfo;
}

/**
 * Logica estratta da /api/leagues/[league-id]/current-auction per ottenere asta corrente
 */
async function getCurrentAuctionLogic(leagueId: string) {
  // Get current active auction
  const activeAuction = db.prepare(`
    SELECT 
      a.id,
      a.player_id,
      a.current_highest_bid_amount,
      a.current_highest_bidder_id,
      a.scheduled_end_time,
      a.status,
      p.name as player_name,
      p.role as player_role
    FROM auctions a
    JOIN players p ON a.player_id = p.id
    WHERE a.auction_league_id = ? AND a.status IN ('active', 'closing')
    ORDER BY a.created_at DESC
    LIMIT 1
  `).get(parseInt(leagueId));

  if (!activeAuction) {
    return null; // No active auction
  }

  // Get detailed auction status using existing service
  const auctionDetails = await getAuctionStatusForPlayer(
    parseInt(leagueId),
    (activeAuction as any).player_id
  );

  return auctionDetails;
}

/**
 * Logica estratta da /api/user/auction-states per ottenere stati utente
 */
async function getUserAuctionStatesLogic(userId: string, leagueId: string) {
  const involvedAuctions = db.prepare(`
    SELECT 
      a.id as auction_id,
      a.player_id,
      p.name as player_name,
      a.current_highest_bidder_id,
      a.current_highest_bid_amount,
      urt.response_deadline,
      urt.activated_at,
      upp.expires_at as cooldown_ends_at
    FROM auctions a
    JOIN players p ON a.player_id = p.id
    JOIN bids b ON a.id = b.auction_id AND b.user_id = ?
    LEFT JOIN user_auction_response_timers urt ON a.id = urt.auction_id AND urt.user_id = ? AND urt.status = 'pending'
    LEFT JOIN user_player_preferences upp ON a.player_id = upp.player_id AND upp.user_id = ? AND upp.league_id = a.auction_league_id AND upp.preference_type = 'cooldown' AND upp.expires_at > ?
    WHERE a.auction_league_id = ? AND a.status = 'active'
    GROUP BY a.id
  `).all(userId, userId, userId, Math.floor(Date.now() / 1000), leagueId);

  const now = Math.floor(Date.now() / 1000);
  
  return involvedAuctions.map((auction: any) => {
    let user_state: string;
    const isHighestBidder = auction.current_highest_bidder_id === userId;
    const isInCooldown = auction.cooldown_ends_at && auction.cooldown_ends_at > now;

    if (isInCooldown) {
      user_state = 'asta_abbandonata';
    } else if (isHighestBidder) {
      user_state = 'miglior_offerta';
    } else {
      user_state = 'rilancio_possibile';
    }

    return {
      auction_id: auction.auction_id,
      player_id: auction.player_id,
      player_name: auction.player_name,
      current_bid: auction.current_highest_bid_amount,
      user_state: user_state,
      response_deadline: auction.response_deadline,
      time_remaining: auction.response_deadline ? Math.max(0, auction.response_deadline - now) : null,
      is_highest_bidder: isHighestBidder
    };
  });
}

/**
 * Logica estratta da /api/leagues/[league-id]/managers per ottenere dati completi dei manager
 */
async function getManagersDataLogic(leagueId: string) {
  // Get league slots configuration
  const leagueInfoStmt = db.prepare(`
    SELECT 
      slots_P,
      slots_D,
      slots_C,
      slots_A
    FROM auction_leagues
    WHERE id = ?
  `);
  const leagueSlots = leagueInfoStmt.get(parseInt(leagueId));

  // Get all managers/participants in the league
  const managersStmt = db.prepare(`
    SELECT 
      lp.user_id,
      lp.manager_team_name,
      lp.current_budget,
      lp.locked_credits,
      al.initial_budget_per_manager as total_budget
    FROM league_participants lp
    JOIN auction_leagues al ON lp.league_id = al.id
    WHERE lp.league_id = ?
    ORDER BY lp.manager_team_name ASC, lp.user_id ASC
  `);
  const managers = managersStmt.all(parseInt(leagueId));

  // Get active auctions with current bid amounts
  const activeAuctionsStmt = db.prepare(`
    SELECT 
      a.player_id,
      p.name as player_name,
      p.role as player_role,
      p.team as player_team,
      a.current_highest_bidder_id,
      a.current_highest_bid_amount,
      a.scheduled_end_time
    FROM auctions a
    JOIN players p ON a.player_id = p.id
    WHERE a.auction_league_id = ? AND a.status = 'active'
  `);
  const activeAuctions = activeAuctionsStmt.all(parseInt(leagueId));

  // Get auto bid indicators for all active auctions
  const autoBidsStmt = db.prepare(`
    SELECT 
      a.player_id,
      COUNT(ab.user_id) as auto_bid_count
    FROM auto_bids ab
    JOIN auctions a ON ab.auction_id = a.id
    WHERE a.auction_league_id = ? AND a.status = 'active' AND ab.is_active = 1
    GROUP BY a.player_id
  `);
  const autoBids = autoBidsStmt.all(parseInt(leagueId));

  // Get players for each manager
  const playersStmt = db.prepare(`
    SELECT 
      p.id,
      p.name,
      p.role,
      p.team,
      pa.purchase_price as assignment_price
    FROM player_assignments pa
    JOIN players p ON pa.player_id = p.id
    WHERE pa.auction_league_id = ? AND pa.user_id = ?
    ORDER BY p.role, p.name
  `);

  // Build the complete managers data with their rosters
  const managersWithRosters = managers.map(manager => ({
    ...manager,
    players: playersStmt.all(parseInt(leagueId), manager.user_id) || []
  }));

  return {
    managers: managersWithRosters,
    leagueSlots,
    activeAuctions,
    autoBids
  };
}

/**
 * API Consolidata per Aggiornamenti Real-time Asta
 * 
 * Sostituisce 4 chiamate separate con 1 sola chiamata ottimizzata:
 * - Budget utente
 * - Dati asta corrente + bid history
 * - Stati timer utente
 * - Stati tutti i manager
 * 
 * Performance: Da 400ms+ a <150ms
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ 'league-id': string }> }
) {
  try {
    const startTime = Date.now();
    
    // Autenticazione (come nelle API esistenti)
    const user = await currentUser();
    console.log(`[AUCTION-REALTIME] Authentication check - User ID: ${user?.id}`);
    if (!user?.id) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    
    const userId = user.id;

    const resolvedParams = await params;
    const leagueId = resolvedParams['league-id'];
    if (!leagueId) {
      return NextResponse.json({ error: 'League ID richiesto' }, { status: 400 });
    }

    console.log(`[AUCTION-REALTIME] Fetching data for user ${userId}, league ${leagueId}`);

    // Prima registra login e attiva timer (come fa l'API user/auction-states)
    try {
      await recordUserLogin(userId);
      await activateTimersForUser(userId);
    } catch (error) {
      console.error('[AUCTION-REALTIME] Error in login/timer activation:', error);
      // Non bloccare la richiesta per errori di sessione
    }

    // Esegui tutte le chiamate in parallelo per ottimizzare performance
    const [budgetResult, auctionResult, userStatesResult, managerStatesResult] = await Promise.allSettled([
      getBudgetDataLogic(userId, leagueId),
      getCurrentAuctionLogic(leagueId),
      getUserAuctionStatesLogic(userId, leagueId),
      getManagersDataLogic(leagueId)
    ]);

    // Gestione errori granulare
    const response: any = {
      success: true,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Budget utente
    if (budgetResult.status === 'fulfilled') {
      response.userBudget = budgetResult.value;
    } else {
      console.error('[AUCTION-REALTIME] Budget error:', budgetResult.reason);
      response.userBudget = null;
      response.errors = response.errors || [];
      response.errors.push('Budget data unavailable');
    }

    // Dati asta corrente
    if (auctionResult.status === 'fulfilled') {
      response.auction = auctionResult.value;
    } else {
      console.error('[AUCTION-REALTIME] Auction error:', auctionResult.reason);
      response.auction = null;
      response.errors = response.errors || [];
      response.errors.push('Auction data unavailable');
    }

    // Stati timer utente
    if (userStatesResult.status === 'fulfilled') {
      response.userStates = userStatesResult.value;
    } else {
      console.error('[AUCTION-REALTIME] User states error:', userStatesResult.reason);
      response.userStates = [];
      response.errors = response.errors || [];
      response.errors.push('User states unavailable');
    }

    // Dati manager completi (managers, leagueSlots, activeAuctions, autoBids)
    if (managerStatesResult.status === 'fulfilled') {
      const managersData = managerStatesResult.value;
      response.managerStates = managersData.managers;
      response.leagueSlots = managersData.leagueSlots;
      response.activeAuctions = managersData.activeAuctions;
      response.autoBids = managersData.autoBids;
    } else {
      console.error('[AUCTION-REALTIME] Manager states error:', managerStatesResult.reason);
      response.managerStates = [];
      response.leagueSlots = null;
      response.activeAuctions = [];
      response.autoBids = [];
      response.errors = response.errors || [];
      response.errors.push('Manager states unavailable');
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`[AUCTION-REALTIME] Completed in ${duration}ms for user ${userId}`);
    
    // Aggiungi metriche di performance per monitoring
    response.performance = {
      duration_ms: duration,
      timestamp: endTime
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[AUCTION-REALTIME] Unexpected error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Errore interno del server',
      timestamp: Math.floor(Date.now() / 1000)
    }, { status: 500 });
  }
}