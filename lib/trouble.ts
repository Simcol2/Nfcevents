import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * event_participants is publicly readable (for the live crew lobby), so it stores
 * a SHA-256 hash of the device token, never the token itself. Knowing the hash
 * does not let anyone act as that guest.
 */
export function hashDeviceToken(token: unknown) {
  const t = typeof token === 'string' ? token.trim() : '';
  return t.length >= 16 && t.length <= 120 ? createHash('sha256').update(t).digest('hex') : null;
}

/** Experiences with a trouble_roles config use the collaborative crew flow. */
export function isCrewExperience(config: Record<string, unknown> | null | undefined) {
  return Array.isArray(config?.trouble_roles) && (config!.trouble_roles as unknown[]).length > 0;
}

export type TroubleRole = { key:string; label:string; bio:string; planning_prompt:string; constraint:string };
export function parseRoles(config: Record<string, unknown>): TroubleRole[] {
  const raw = Array.isArray(config?.trouble_roles) ? config.trouble_roles : [];
  return raw.filter((r): r is TroubleRole => !!r && typeof r==='object' && typeof (r as TroubleRole).key==='string' && typeof (r as TroubleRole).label==='string').slice(0,12);
}

export async function assignRoles(supabase: SupabaseClient, sessionId:string, participantIds:string[], roles:TroubleRole[], round:number) {
  const activeRoles=roles.slice(0,participantIds.length);
  const {data:votes,error}=await supabase.from('trouble_role_votes').select('role_key,nominee_participant_id').eq('session_id',sessionId).eq('round',round);
  if(error) throw error;
  const score=new Map<string,number>();
  for(const vote of votes??[]){ const k=`${vote.role_key}:${vote.nominee_participant_id}`; score.set(k,(score.get(k)??0)+1); }
  let bestScore=-1; let best:Array<{role_key:string;participant_id:string}>=[];
  function search(i:number, remaining:string[], current:Array<{role_key:string;participant_id:string}>, total:number){
    if(i>=activeRoles.length){ if(total>bestScore){bestScore=total;best=[...current];} return; }
    const role=activeRoles[i];
    for(let x=0;x<remaining.length;x++){
      const pid=remaining[x]; const rest=[...remaining.slice(0,x),...remaining.slice(x+1)];
      search(i+1,rest,[...current,{role_key:role.key,participant_id:pid}],total+(score.get(`${role.key}:${pid}`)??0));
    }
  }
  search(0,participantIds,[],0); return best;
}

export function buildPlainSummary(args:{mission:string; crew:Array<{display_name:string;role_label:string;contribution:string}>}){
  return ['MISSION',args.mission.trim(),'','CREW PLAN',...args.crew.flatMap(i=>[`${i.role_label} — ${i.display_name}`,i.contribution.trim(),''])].join('\n').trim();
}
