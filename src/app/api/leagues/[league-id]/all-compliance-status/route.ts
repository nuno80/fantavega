import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';

// Define the context interface according to the project's convention
interface RouteContext {
  params: Promise<{
    'league-id': string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Await the params as per the project's convention
    const resolvedParams = await context.params;
    const leagueIdStr = resolvedParams['league-id'];
    const leagueId = parseInt(leagueIdStr, 10);

    if (isNaN(leagueId)) {
      return new NextResponse('Invalid League ID', { status: 400 });
    }

    // Verify the user is a participant of the league to authorize the request
    const participantCheck = db
      .prepare(
        'SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?'
      )
      .get(leagueId, userId);

    if (!participantCheck) {
      return new NextResponse('Forbidden: You are not a member of this league', {
        status: 403,
      });
    }

    const complianceData = db
      .prepare(
        'SELECT user_id, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = ?'
      )
      .all(leagueId);

    return NextResponse.json(complianceData);
    
  } catch (error) {
    console.error('[GET_ALL_COMPLIANCE_STATUS]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}