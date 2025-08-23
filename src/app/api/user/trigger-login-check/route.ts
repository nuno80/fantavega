// src/app/api/user/trigger-login-check/route.ts

import { db } from '@/lib/db';
import { checkAndRecordCompliance } from '@/lib/db/services/penalty.service';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId, sessionId } = await auth();

    if (!userId || !sessionId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 1. Check if this session has already been processed
    const checkStmt = db.prepare(
      'SELECT session_id FROM processed_login_sessions WHERE session_id = ?'
    );
    const existingSession = checkStmt.get(sessionId);

    if (existingSession) {
      return NextResponse.json({ message: 'Login compliance check already performed for this session.' });
    }

    // 2. If not processed, run the compliance check logic
    console.log(`Performing first-time login compliance check for session: ${sessionId}`);
    
    const leagues = db.prepare(
      'SELECT league_id FROM league_participants WHERE user_id = ?'
    ).all(userId) as { league_id: number }[];

    if (leagues.length > 0) {
      for (const league of leagues) {
        checkAndRecordCompliance(userId, league.league_id);
      }
    }

    // 3. Record this session as processed to prevent re-running
    const insertStmt = db.prepare(
      'INSERT INTO processed_login_sessions (session_id, user_id) VALUES (?, ?)'
    );
    insertStmt.run(sessionId, userId);

    return NextResponse.json({ message: 'Login compliance check performed successfully.' });

  } catch (error) {
    console.error('[TRIGGER_LOGIN_CHECK]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
