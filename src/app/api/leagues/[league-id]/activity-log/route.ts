// src/app/api/leagues/[league-id]/activity-log/route.ts v.1.0
// API Route per recuperare il log cronologico unificato di tutti gli eventi della lega.
// 1. Importazioni
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

// 2. Interfaccia per il Contesto della Rotta
interface RouteContext {
  params: Promise<{
    "league-id": string;
  }>;
}

// 3. Tipi per gli eventi del log
interface ActivityEvent {
  id: string;
  timestamp: number;
  event_type:
  | "login"
  | "logout"
  | "bid"
  | "auction_created"
  | "auction_sold"
  | "auction_not_sold"
  | "budget_transaction"
  | "timer_activated"
  | "timer_expired"
  | "timer_abandoned";
  user_id: string;
  username: string;
  description: string;
  league_id: number;
  details?: Record<string, unknown>;
}

// 4. Funzione GET per Recuperare il Log Attività
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // 4.1. Autenticazione Utente
    const user = await currentUser();
    if (!user || !user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authenticatedUserId = user.id;

    // 4.2. Parsing e Validazione Parametri Rotta
    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    // 4.3. Verifica Partecipazione Utente alla Lega (o Admin)
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueIdNum, authenticatedUserId],
    });
    const participantExists = participantCheckResult.rows.length > 0;

    if (!participantExists) {
      const isAdmin = user.publicMetadata?.role === "admin";
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Forbidden: You are not a participant of this league." },
          { status: 403 }
        );
      }
    }

    // 4.4. Parsing Query Params per Filtri
    const searchParams = request.nextUrl.searchParams;
    const filterUserId = searchParams.get("userId");
    const filterEventType = searchParams.get("eventType"); // comma-separated
    const filterDateFrom = searchParams.get("dateFrom"); // unix timestamp
    const filterDateTo = searchParams.get("dateTo"); // unix timestamp
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = (page - 1) * limit;

    // Filtri per tipo evento (per filtrare dopo il merge)
    const eventTypeFilter = filterEventType
      ? filterEventType.split(",")
      : null;

    const filterMyBiddedPlayers = searchParams.get("myBiddedPlayers") === "true";

    // Subquery per trovare i player_id su cui l'utente ha fatto offerte
    // Nota: Usiamo i parametri posizionali '?' quindi dobbiamo fare attenzione all'ordine degli args
    const myBiddedPlayersSubquery = `
      SELECT DISTINCT a_sub.player_id
      FROM bids b_sub
      JOIN auctions a_sub ON b_sub.auction_id = a_sub.id
      WHERE b_sub.user_id = ? AND a_sub.auction_league_id = ?
    `;

    // 4.5. Esegui le query in parallelo per ogni fonte dati
    const events: ActivityEvent[] = [];

    // Costruisci clausole WHERE comuni
    const dateFromTs = filterDateFrom ? parseInt(filterDateFrom, 10) : null;
    const dateToTs = filterDateTo ? parseInt(filterDateTo, 10) : null;

    // --- BIDS ---
    if (!eventTypeFilter || eventTypeFilter.includes("bid")) {
      let bidSql = `
        SELECT b.id, b.user_id, b.amount, b.bid_time, b.bid_type, b.auction_id,
               u.username, u.full_name,
               p.name as player_name, p.role as player_role
        FROM bids b
        JOIN auctions a ON b.auction_id = a.id
        JOIN users u ON b.user_id = u.id
        JOIN players p ON a.player_id = p.id
        WHERE a.auction_league_id = ?
      `;
      const bidArgs: (string | number)[] = [leagueIdNum];

      if (filterUserId) {
        bidSql += " AND b.user_id = ?";
        bidArgs.push(filterUserId);
      }
      if (dateFromTs) {
        bidSql += " AND b.bid_time >= ?";
        bidArgs.push(dateFromTs);
      }
      if (dateToTs) {
        bidSql += " AND b.bid_time <= ?";
        bidArgs.push(dateToTs);
      }
      if (filterMyBiddedPlayers) {
        bidSql += ` AND p.id IN (${myBiddedPlayersSubquery})`;
        bidArgs.push(authenticatedUserId, leagueIdNum);
      }

      const bidResult = await db.execute({ sql: bidSql, args: bidArgs });
      for (const row of bidResult.rows) {
        const bidTypeLabel =
          row.bid_type === "auto"
            ? "auto-offerta"
            : row.bid_type === "quick"
              ? "offerta rapida"
              : "offerta";
        events.push({
          id: `bid-${row.id}`,
          timestamp: row.bid_time as number,
          event_type: "bid",
          user_id: row.user_id as string,
          username: (row.username || row.full_name || "Utente") as string,
          description: `${bidTypeLabel} di ${row.amount} crediti per ${row.player_name} (${row.player_role})`,
          league_id: leagueIdNum,
          details: {
            amount: row.amount,
            player_name: row.player_name,
            player_role: row.player_role,
            bid_type: row.bid_type,
            auction_id: row.auction_id,
          },
        });
      }
    }

    // --- AUCTIONS (created / sold / not_sold) ---
    if (
      !eventTypeFilter ||
      eventTypeFilter.some((t: string) =>
        ["auction_created", "auction_sold", "auction_not_sold"].includes(t)
      )
    ) {
      let auctionSql = `
        SELECT a.id, a.player_id, a.start_time, a.scheduled_end_time,
               a.current_highest_bid_amount, a.current_highest_bidder_id, a.status,
               a.created_at, a.updated_at,
               p.name as player_name, p.role as player_role,
               u.username as winner_username, u.full_name as winner_full_name
        FROM auctions a
        JOIN players p ON a.player_id = p.id
        LEFT JOIN users u ON a.current_highest_bidder_id = u.id
        WHERE a.auction_league_id = ?
      `;
      const auctionArgs: (string | number)[] = [leagueIdNum];

      if (dateFromTs) {
        auctionSql += " AND a.created_at >= ?";
        auctionArgs.push(dateFromTs);
      }
      if (dateToTs) {
        auctionSql += " AND a.created_at <= ?";
        auctionArgs.push(dateToTs);
      }
      if (filterMyBiddedPlayers) {
        auctionSql += ` AND p.id IN (${myBiddedPlayersSubquery})`;
        auctionArgs.push(authenticatedUserId, leagueIdNum);
      }

      const auctionResult = await db.execute({
        sql: auctionSql,
        args: auctionArgs,
      });
      for (const row of auctionResult.rows) {
        // Evento creazione asta
        if (!eventTypeFilter || eventTypeFilter.includes("auction_created")) {
          events.push({
            id: `auction-created-${row.id}`,
            timestamp: row.start_time as number,
            event_type: "auction_created",
            user_id: "",
            username: "Sistema",
            description: `Asta aperta per ${row.player_name} (${row.player_role})`,
            league_id: leagueIdNum,
            details: {
              auction_id: row.id,
              player_name: row.player_name,
              player_role: row.player_role,
              scheduled_end_time: row.scheduled_end_time,
            },
          });
        }

        // Evento chiusura asta (sold / not_sold)
        if (row.status === "sold" || row.status === "not_sold") {
          const eventType =
            row.status === "sold" ? "auction_sold" : "auction_not_sold";
          if (!eventTypeFilter || eventTypeFilter.includes(eventType)) {
            const winnerName = String(row.winner_username || row.winner_full_name || "");
            const desc =
              row.status === "sold"
                ? `Asta chiusa: ${row.player_name} venduto a ${winnerName} per ${row.current_highest_bid_amount} crediti`
                : `Asta chiusa: ${row.player_name} non venduto`;

            events.push({
              id: `auction-${row.status}-${row.id}`,
              timestamp: row.updated_at as number,
              event_type: eventType,
              user_id: (row.current_highest_bidder_id as string) || "",
              username: winnerName || "Sistema",
              description: desc,
              league_id: leagueIdNum,
              details: {
                auction_id: row.id,
                player_name: row.player_name,
                final_amount: row.current_highest_bid_amount,
                winner_id: row.current_highest_bidder_id,
              },
            });
          }
        }
      }
    }

    // --- BUDGET TRANSACTIONS ---
    if (
      !eventTypeFilter ||
      eventTypeFilter.includes("budget_transaction")
    ) {
      let txSql = `
        SELECT bt.id, bt.user_id, bt.transaction_type, bt.amount,
               bt.description, bt.balance_after_in_league, bt.transaction_time,
               u.username, u.full_name,
               p.name as player_name
        FROM budget_transactions bt
        JOIN users u ON bt.user_id = u.id
        LEFT JOIN players p ON bt.related_player_id = p.id
        WHERE bt.auction_league_id = ?
      `;
      const txArgs: (string | number)[] = [leagueIdNum];

      if (filterUserId) {
        txSql += " AND bt.user_id = ?";
        txArgs.push(filterUserId);
      }
      if (dateFromTs) {
        txSql += " AND bt.transaction_time >= ?";
        txArgs.push(dateFromTs);
      }
      if (dateToTs) {
        txSql += " AND bt.transaction_time <= ?";
        txArgs.push(dateToTs);
      }
      if (filterMyBiddedPlayers) {
        txSql += ` AND bt.related_player_id IN (${myBiddedPlayersSubquery})`;
        txArgs.push(authenticatedUserId, leagueIdNum);
      }

      const txResult = await db.execute({ sql: txSql, args: txArgs });
      for (const row of txResult.rows) {
        // Mappa i tipi di transazione a descrizioni leggibili
        const typeLabels: Record<string, string> = {
          initial_allocation: "Budget iniziale assegnato",
          win_auction_debit: "Addebito per vittoria asta",
          penalty_requirement: "Penalità compliance",
          discard_player_credit: "Credito per svincolo",
          admin_budget_increase: "Aumento budget (admin)",
          admin_budget_decrease: "Riduzione budget (admin)",
          penalty_response_timeout: "Penalità timeout risposta",
          timer_expired: "Timer scaduto",
          auction_abandoned: "Asta abbandonata",
        };
        const typeLabel =
          typeLabels[row.transaction_type as string] ||
          (row.transaction_type as string);
        const playerInfo = row.player_name
          ? ` per ${row.player_name}`
          : "";
        const desc = String(
          row.description ||
          `${typeLabel}: ${row.amount} crediti${playerInfo} (saldo: ${row.balance_after_in_league})`
        );

        events.push({
          id: `tx-${row.id}`,
          timestamp: row.transaction_time as number,
          event_type: "budget_transaction",
          user_id: row.user_id as string,
          username: (row.username || row.full_name || "Utente") as string,
          description: desc as string,
          league_id: leagueIdNum,
          details: {
            transaction_type: row.transaction_type,
            amount: row.amount,
            balance_after: row.balance_after_in_league,
            player_name: row.player_name,
          },
        });
      }
    }

    // --- USER SESSIONS (login/logout) ---
    // SE il filtro 'myBiddedPlayers' è attivo, saltiamo le sessioni perché non sono legate ai giocatori
    if (
      !filterMyBiddedPlayers && // NUOVO: Salta se filtro attivo
      (!eventTypeFilter ||
        eventTypeFilter.some((t: string) => ["login", "logout"].includes(t)))
    ) {
      // Prendiamo solo sessioni di utenti partecipanti a questa lega
      let sessionSql = `
        SELECT us.id, us.user_id, us.session_start, us.session_end,
               u.username, u.full_name
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        JOIN league_participants lp ON us.user_id = lp.user_id AND lp.league_id = ?
        WHERE 1=1
      `;
      const sessionArgs: (string | number)[] = [leagueIdNum];

      if (filterUserId) {
        sessionSql += " AND us.user_id = ?";
        sessionArgs.push(filterUserId);
      }
      if (dateFromTs) {
        sessionSql += " AND us.session_start >= ?";
        sessionArgs.push(dateFromTs);
      }
      if (dateToTs) {
        sessionSql += " AND us.session_start <= ?";
        sessionArgs.push(dateToTs);
      }

      const sessionResult = await db.execute({
        sql: sessionSql,
        args: sessionArgs,
      });
      for (const row of sessionResult.rows) {
        const uname = (row.username || row.full_name || "Utente") as string;

        // Evento login
        if (!eventTypeFilter || eventTypeFilter.includes("login")) {
          events.push({
            id: `login-${row.id}`,
            timestamp: row.session_start as number,
            event_type: "login",
            user_id: row.user_id as string,
            username: uname,
            description: `Login effettuato`,
            league_id: leagueIdNum,
          });
        }

        // Evento logout (se presente)
        if (
          row.session_end &&
          (!eventTypeFilter || eventTypeFilter.includes("logout"))
        ) {
          events.push({
            id: `logout-${row.id}`,
            timestamp: row.session_end as number,
            event_type: "logout",
            user_id: row.user_id as string,
            username: uname,
            description: `Logout effettuato`,
            league_id: leagueIdNum,
          });
        }
      }
    }

    // --- RESPONSE TIMERS ---
    if (
      !eventTypeFilter ||
      eventTypeFilter.some((t: string) =>
        ["timer_activated", "timer_expired", "timer_abandoned"].includes(t)
      )
    ) {
      let timerSql = `
        SELECT rt.id, rt.auction_id, rt.user_id, rt.created_at,
               rt.activated_at, rt.processed_at, rt.status,
               u.username, u.full_name,
               p.name as player_name
        FROM user_auction_response_timers rt
        JOIN users u ON rt.user_id = u.id
        JOIN auctions a ON rt.auction_id = a.id
        JOIN players p ON a.player_id = p.id
        WHERE a.auction_league_id = ?
          AND rt.status != 'pending'
      `;
      const timerArgs: (string | number)[] = [leagueIdNum];

      if (filterUserId) {
        timerSql += " AND rt.user_id = ?";
        timerArgs.push(filterUserId);
      }
      if (dateFromTs) {
        timerSql += " AND rt.created_at >= ?";
        timerArgs.push(dateFromTs);
      }
      if (dateToTs) {
        timerSql += " AND rt.created_at <= ?";
        timerArgs.push(dateToTs);
      }
      if (filterMyBiddedPlayers) {
        timerSql += ` AND p.id IN (${myBiddedPlayersSubquery})`;
        timerArgs.push(authenticatedUserId, leagueIdNum);
      }

      const timerResult = await db.execute({
        sql: timerSql,
        args: timerArgs,
      });
      for (const row of timerResult.rows) {
        const uname = (row.username || row.full_name || "Utente") as string;
        const statusMap: Record<string, { type: ActivityEvent["event_type"]; label: string }> = {
          expired: { type: "timer_expired", label: "Timer di risposta scaduto" },
          abandoned: { type: "timer_abandoned", label: "Asta abbandonata (timer)" },
          cancelled: { type: "timer_activated", label: "Timer di risposta cancellato (rilancio effettuato)" },
        };
        const mapped = statusMap[row.status as string];
        if (!mapped) continue;
        if (eventTypeFilter && !eventTypeFilter.includes(mapped.type)) continue;

        const ts = (row.processed_at || row.activated_at || row.created_at) as number;

        events.push({
          id: `timer-${row.id}`,
          timestamp: ts,
          event_type: mapped.type,
          user_id: row.user_id as string,
          username: uname,
          description: `${mapped.label} per ${row.player_name}`,
          league_id: leagueIdNum,
          details: {
            auction_id: row.auction_id,
            player_name: row.player_name,
            timer_status: row.status,
          },
        });
      }
    }

    // 4.6. Ordina cronologicamente (più recenti prima) e pagina
    events.sort((a, b) => b.timestamp - a.timestamp);

    const totalCount = events.length;
    const totalPages = Math.ceil(totalCount / limit);
    const paginatedEvents = events.slice(offset, offset + limit);

    // 4.7. Recupera la lista utenti della lega per il filtro UI
    const usersResult = await db.execute({
      sql: `
        SELECT u.id, u.username, u.full_name
        FROM league_participants lp
        JOIN users u ON lp.user_id = u.id
        WHERE lp.league_id = ?
        ORDER BY u.username
      `,
      args: [leagueIdNum],
    });
    const leagueUsers = usersResult.rows.map((r) => ({
      id: String(r.id ?? ""),
      username: String(r.username || r.full_name || "Utente"),
    }));

    return NextResponse.json(
      {
        events: paginatedEvents,
        totalCount,
        page,
        totalPages,
        leagueUsers,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API ACTIVITY_LOG GET] Error: ${errorMessage}`, error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// 5. Configurazione della Route
export const dynamic = "force-dynamic";
