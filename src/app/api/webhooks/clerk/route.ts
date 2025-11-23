// src/app/api/webhooks/clerk/route.ts
import { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";

import { db } from "@/lib/db";
import { processUserComplianceAndPenalties } from "@/lib/db/services/penalty.service";

interface LeagueRow {
  league_id: number;
  status: string;
}

export async function POST(req: Request) {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Get the headers
  const headerPayload = req.headers;
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  // Get the ID and type
  const { id } = evt.data;
  const eventType = evt.type;

  console.log(`Webhook with an ID of ${id} and type of ${eventType}`);

  if (eventType === "session.created") {
    const userId = evt.data.user_id; // Use user_id from session event
    console.log(
      `[WEBHOOK PENALTY] Processing 'session.created' event for userId: ${userId}`
    );

    try {
      // Find all active leagues the user is a part of
      const leaguesResult = await db.execute({
        sql: `SELECT al.id as league_id, al.status
         FROM league_participants lp
         JOIN auction_leagues al ON lp.league_id = al.id
         WHERE lp.user_id = ? AND al.status IN ('draft_active', 'repair_active')`,
        args: [userId]
      });

      const leagues: LeagueRow[] = leaguesResult.rows.map(row => ({
        league_id: row.league_id as number,
        status: row.status as string
      }));

      if (leagues.length > 0) {
        console.log(
          `[WEBHOOK PENALTY] User ${userId} found in ${leagues.length} active leagues. Applying penalties if needed.`
        );

        let totalPenaltiesApplied = 0;

        for (const league of leagues) {
          try {
            const result = await processUserComplianceAndPenalties(
              league.league_id,
              userId
            );

            console.log(
              `[WEBHOOK PENALTY] League ${league.league_id} - Applied: ${result.appliedPenaltyAmount} credits, Compliant: ${result.isNowCompliant}`
            );

            if (result.appliedPenaltyAmount > 0) {
              totalPenaltiesApplied += result.appliedPenaltyAmount;
            }
          } catch (error) {
            console.error(
              `[WEBHOOK PENALTY] Error processing league ${league.league_id} for user ${userId}:`,
              error
            );
            // Continue with other leagues even if one fails
          }
        }

        if (totalPenaltiesApplied > 0) {
          console.log(
            `[WEBHOOK PENALTY] Total penalties applied for user ${userId}: ${totalPenaltiesApplied} credits`
          );
          // TODO: Send notification via Socket.IO if needed
        }
      } else {
        console.log(
          `[WEBHOOK PENALTY] User ${userId} is not in any active leagues. No penalty check needed.`
        );
      }
    } catch (error) {
      console.error(
        `[WEBHOOK PENALTY] Error processing compliance for user ${userId} on login:`,
        error
      );
      // Still return 200 to Clerk to acknowledge receipt, but log the error.
    }
  }

  return new Response("", { status: 200 });
}
