// src/lib/auth/authorization.ts
// Helper functions for authorization checks to prevent IDOR vulnerabilities

import { db } from "@/lib/db";
import { currentUser } from "@clerk/nextjs/server";

/**
 * Check if user is a participant in the specified league
 * Prevents IDOR attacks on league-specific resources
 */
export async function checkUserLeagueAccess(userId: string, leagueId: number): Promise<boolean> {
  try {
    const participantCheck = db
      .prepare("SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?")
      .get(leagueId, userId);
    
    return !!participantCheck;
  } catch (error) {
    console.error("Error checking league access:", error);
    return false;
  }
}

/**
 * Check if user has admin role
 */
export async function checkAdminRole(userId: string): Promise<boolean> {
  try {
    const user = await currentUser();
    return user?.publicMetadata?.role === "admin";
  } catch (error) {
    console.error("Error checking admin role:", error);
    return false;
  }
}

/**
 * Check if user can access another user's data within a league
 * Only allows access to own data unless user is admin
 */
export async function checkUserDataAccess(
  requestingUserId: string, 
  targetUserId: string, 
  leagueId: number
): Promise<boolean> {
  try {
    // Users can always access their own data
    if (requestingUserId === targetUserId) {
      return true;
    }
    
    // Check if requesting user is admin
    const isAdmin = await checkAdminRole(requestingUserId);
    if (isAdmin) {
      return true;
    }
    
    // For non-admin users, they can only access their own data
    return false;
  } catch (error) {
    console.error("Error checking user data access:", error);
    return false;
  }
}

/**
 * Comprehensive authorization check for league endpoints
 * Returns user info and validates league access in one call
 */
export async function authorizeLeagueAccess(leagueId: number) {
  const user = await currentUser();
  
  if (!user) {
    return { 
      authorized: false, 
      user: null, 
      error: "Non autenticato", 
      status: 401 
    };
  }

  if (isNaN(leagueId) || leagueId <= 0) {
    return { 
      authorized: false, 
      user, 
      error: "ID lega non valido", 
      status: 400 
    };
  }

  const hasAccess = await checkUserLeagueAccess(user.id, leagueId);
  
  if (!hasAccess) {
    return { 
      authorized: false, 
      user, 
      error: "Non appartieni a questa lega", 
      status: 403 
    };
  }

  return { 
    authorized: true, 
    user, 
    error: null, 
    status: 200 
  };
}

/**
 * Authorization check for admin-only endpoints
 */
export async function authorizeAdminAccess() {
  const user = await currentUser();
  
  if (!user) {
    return { 
      authorized: false, 
      user: null, 
      error: "Non autenticato", 
      status: 401 
    };
  }

  const isAdmin = user.publicMetadata?.role === "admin";
  
  if (!isAdmin) {
    return { 
      authorized: false, 
      user, 
      error: "Accesso riservato agli amministratori", 
      status: 403 
    };
  }

  return { 
    authorized: true, 
    user, 
    error: null, 
    status: 200 
  };
}