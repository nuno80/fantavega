#!/usr/bin/env python3
from pathlib import Path
import argparse
p=argparse.ArgumentParser(); p.add_argument('--check',action='store_true'); a=p.parse_args(); root=Path.cwd(); path=Path('src/lib/actions/league.actions.ts'); f=root/path
if not f.exists(): raise SystemExit(f'missing expected file: {path}')
text=f.read_text(encoding='utf-8')
def harden(text,function_name,next_marker):
 start=text.index(f'export async function {function_name}'); end=text.index(next_marker,start); block=text[start:end]
 old='''const { userId: adminUserId } = await auth();
 if (!adminUserId) {
 return { success: false, message: "Azione non autorizzata." };
 }'''
 new='''const { userId: adminUserId, sessionClaims } = await auth();
 if (!adminUserId) {
 return { success: false, message: "Azione non autorizzata." };
 }
 if (!(await checkIsAdmin(adminUserId, sessionClaims as Record<string, unknown> | null))) {
 return { success: false, message: "Solo gli admin possono eseguire questa operazione." };
 }'''
 if old not in block: raise SystemExit(f'expected auth block not found in {function_name}')
 return text[:start]+block.replace(old,new,1)+text[end:]
text2=harden(text,'updateTeamNameAction','// 5. Action:')
text2=harden(text2,'updateLeagueStatusAction','// 6. Action:')
text2=harden(text2,'updateActiveRolesAction','// 9. Action:')
if not a.check: f.write_text(text2,encoding='utf-8')
print('check OK' if a.check else 'applied admin checks to updateTeamNameAction, updateLeagueStatusAction, updateActiveRolesAction')
