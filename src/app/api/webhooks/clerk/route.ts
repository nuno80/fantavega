// src/app/api/webhooks/clerk/route.ts

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { checkAndRecordCompliance } from '@/lib/db/services/penalty.service';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
  }

  // Get the headers
  const headerPayload = req.headers;
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400
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
    console.error('Error verifying webhook:', err);
    return new Response('Error occured', {
      status: 400
    });
  }

  // Get the ID and type
  const { id } = evt.data;
  const eventType = evt.type;

  console.log(`Webhook with an ID of ${id} and type of ${eventType}`);
  
  if (eventType === 'session.created') {
    const userId = evt.data.id;
    console.log(`Processing 'user.signedIn' event for userId: ${userId}`);

    try {
      // Find all leagues the user is a part of
      const leagues = db.prepare(
        'SELECT league_id FROM league_participants WHERE user_id = ?'
      ).all(userId) as { league_id: number }[];

      if (leagues.length > 0) {
        console.log(`User ${userId} found in ${leagues.length} leagues. Checking compliance for each.`);
        for (const league of leagues) {
          checkAndRecordCompliance(userId, league.league_id);
        }
      } else {
        console.log(`User ${userId} is not a participant in any league. No compliance check needed.`);
      }
    } catch (error) {
      console.error(`Error processing compliance for user ${userId} on login:`, error);
      // Still return 200 to Clerk to acknowledge receipt, but log the error.
    }
  }

  return new Response('', { status: 200 });
}
