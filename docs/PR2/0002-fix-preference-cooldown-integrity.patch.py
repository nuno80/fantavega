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
old="""INSERT OR REPLACE INTO user_player_preferences
 (user_id, player_id, league_id, preference_type, expires_at)
 VALUES (?, ?, ?, 'cooldown', ?)"""
new="""INSERT INTO user_player_preferences
 (user_id, player_id, league_id, preference_type, expires_at, updated_at)
 VALUES (?, ?, ?, 'cooldown', ?, ?)
 ON CONFLICT(user_id, player_id, league_id) DO UPDATE SET
 preference_type = 'cooldown',
 expires_at = excluded.expires_at,
 updated_at = excluded.updated_at"""
edit(Path('src/lib/db/services/response-timer.service.ts'),[(old,new),('args: [timer.user_id, timer.player_id, timer.league_id, cooldownExpiry],','args: [timer.user_id, timer.player_id, timer.league_id, cooldownExpiry, now],'),(old,new),('args: [userId, playerId, leagueId, cooldownExpiry],','args: [userId, playerId, leagueId, cooldownExpiry, now],')])
old2="INSERT OR REPLACE INTO user_player_preferences (user_id, player_id, league_id, preference_type, expires_at, created_at, updated_at) VALUES (?, ?, ?, 'cooldown', ?, ?, ?)"
new2="""INSERT INTO user_player_preferences (user_id, player_id, league_id, preference_type, expires_at, created_at, updated_at)
 VALUES (?, ?, ?, 'cooldown', ?, ?, ?)
 ON CONFLICT(user_id, player_id, league_id) DO UPDATE SET
 preference_type = 'cooldown', expires_at = excluded.expires_at, updated_at = excluded.updated_at"""
edit(Path('src/lib/db/services/auction-states.service.ts'),[(old2,new2)])
needle=''' await client.executeMultiple(schemaSql);

 console.log("[Schema Apply Util] Schema SQL applied successfully.");'''
replacement=''' await client.executeMultiple(schemaSql);

 // CREATE TABLE IF NOT EXISTS does not add newer columns to an existing table.
 const preferenceColumns = await client.execute("PRAGMA table_info(user_player_preferences)");
 const names = new Set(preferenceColumns.rows.map((row) => String(row.name)));
 if (!names.has("preference_type")) {
 await client.execute("ALTER TABLE user_player_preferences ADD COLUMN preference_type TEXT DEFAULT 'preference'");
 }
 if (!names.has("expires_at")) {
 await client.execute("ALTER TABLE user_player_preferences ADD COLUMN expires_at INTEGER");
 }

 console.log("[Schema Apply Util] Schema SQL applied successfully.");'''
edit(Path('src/lib/db/utils.ts'),[(needle,replacement)])
print(('check OK; would change: ' if a.check else 'applied: ')+', '.join(map(str,changed)))
