#!/usr/bin/env python3
from pathlib import Path
import argparse
p=argparse.ArgumentParser(); p.add_argument('--check',action='store_true'); a=p.parse_args(); root=Path.cwd(); changed=[]
def edit(path,replacements):
 f=root/path
 if not f.exists(): raise SystemExit(f'missing expected file: {path}')
 text=f.read_text(encoding='utf-8'); new=text
 for old,repl in replacements:
  if old not in new: raise SystemExit(f'expected source fragment not found in {path}: {old[:100]!r}')
  new=new.replace(old,repl,1)
 if new!=text:
  changed.append(path)
  if not a.check: f.write_text(new,encoding='utf-8')
edit(Path('src/app/api/user/auction-states/route.ts'),[
('import { activateTimersForUser } from "@/lib/db/services/response-timer.service";\n',''),
("""try {
 const heartbeatAt = await updateHeartbeat(user.id);
 // Deferred activation is anchored to a heartbeat that was persisted successfully.
 await activateTimersForUser(user.id, heartbeatAt);
 } catch (error) {
 console.error("[USER_AUCTION_STATES] Session refresh failed:", error);
 }""","""try {
 await updateHeartbeat(user.id);
 } catch (error) {
 console.error("[USER_AUCTION_STATES] Heartbeat update failed:", error);
 }""")])
edit(Path('src/app/api/leagues/[league-id]/auction-state/route.ts'),[
('import { activateTimersForUser } from "@/lib/db/services/response-timer.service";\n',''),
('try { const heartbeatAt = await updateHeartbeat(user.id); await activateTimersForUser(user.id, heartbeatAt); } catch (error) { console.error("[AUCTION-STATE] Session refresh failed", error); }','try { await updateHeartbeat(user.id); } catch (error) { console.error("[AUCTION-STATE] Heartbeat update failed", error); }')])
needle=""" const isMounted = useIsMounted();
 const roleColor = getRoleColor(role);

 // Response timer countdown effect"""
effect=""" const isMounted = useIsMounted();
 const roleColor = getRoleColor(role);

 // Confirm the view when the response-needed UI is mounted for its owner.
 // The server-side claim is idempotent, so remounts and concurrent tabs are safe.
 useEffect(() => {
 if (!isCurrentUser || state.response_deadline !== null) return;
 const controller = new AbortController();
 void fetch(
 `/api/leagues/${leagueId}/players/${state.player_id}/response-timer/viewed`,
 { method: "POST", signal: controller.signal },
 ).then((response) => {
 if (!response.ok) throw new Error(`View confirmation failed: ${response.status}`);
 }).catch((error: unknown) => {
 if (!(error instanceof DOMException && error.name === "AbortError")) {
 console.error("[RESPONSE-TIMER] Could not confirm mounted response state", error);
 }
 });
 return () => controller.abort();
 }, [isCurrentUser, leagueId, state.player_id, state.response_deadline]);

 // Response timer countdown effect"""
edit(Path('src/components/auction/ManagerColumn.tsx'),[(needle,effect)])
print(('check OK; would change: ' if a.check else 'applied: ')+', '.join(map(str,changed)))
