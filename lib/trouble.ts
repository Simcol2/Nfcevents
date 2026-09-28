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

type CrewLine = { display_name: string; role_label: string; contribution: string };

function quote(text: string, max = 220) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Turns the crew's approved plan into the funny read-aloud version: randomly
 * either a breaking-news report or a (clearly fictional) police incident report.
 */
export function buildCrewReport(args: { mission: string; crew: CrewLine[]; style?: 'news' | 'police' }) {
  const style: 'news' | 'police' = args.style ?? (Math.random() < 0.5 ? 'news' : 'police');
  const crew = args.crew.filter((c) => c.contribution.trim());
  const names = listNames(crew.map((c) => c.display_name));
  const [lead, ...rest] = crew;

  if (style === 'news') {
    const lines = [
      `BREAKING NEWS. We interrupt dinner to bring you this developing story.`,
      `A crew of ${crew.length} known only as ${names} has reportedly pulled off what witnesses are calling "an absurdly confident fictional operation."`,
      `The mission, according to sources close to the gravy: ${quote(args.mission, 200)}`,
      lead ? `Investigators say it began when ${lead.display_name}, acting as ${lead.role_label}, laid out the plan: "${quote(lead.contribution)}"` : '',
      ...rest.map((c, i) => [
        `Moments later, ${c.display_name} (${c.role_label}) stepped in: "${quote(c.contribution)}"`,
        `Witnesses then saw ${c.display_name}, ${c.role_label}, calmly explain: "${quote(c.contribution)}"`,
        `Sources confirm ${c.display_name} handled things as ${c.role_label}: "${quote(c.contribution)}"`,
      ][i % 3]),
      `Authorities have not confirmed the crew's whereabouts, largely because they appear to still be sitting at this table, looking extremely pleased with themselves.`,
      `No real crime occurred. Back to you in the studio.`,
    ];
    return { style, text: lines.filter(Boolean).join('\n\n') };
  }

  const lines = [
    `INCIDENT REPORT: FICTIONAL SCENARIO`,
    `Nature of incident: ${quote(args.mission, 200)}`,
    `Persons of interest: ${crew.length}. ${names}.`,
    ...crew.map((c, i) => `Person of interest #${i + 1}: ${c.display_name}, identified as ${c.role_label}.\nStatement on record: "${quote(c.contribution)}"`),
    `Officer's assessment: The group operated with the unearned confidence of people who have watched several heist movies. Every member insists the plan would have worked.`,
    `Status: No real-world action alleged. Case referred to dessert.`,
  ];
  return { style, text: lines.join('\n\n') };
}
