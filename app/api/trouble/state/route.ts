import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { hashDeviceToken, parseRoles } from '@/lib/trouble';
export const dynamic='force-dynamic';

export async function POST(request: Request){
  const body=await request.json().catch(()=>null); const {eventId,experienceId,deviceToken}=body??{};
  if(!eventId||!experienceId||!hashDeviceToken(deviceToken)) return NextResponse.json({error:'Missing state request.'},{status:400});
  const supabase=getSupabaseAdmin();
  const {data:participant}=await supabase.from('event_participants').select('id,display_name,experience_id').eq('event_id',eventId).eq('device_token',hashDeviceToken(deviceToken)??'').maybeSingle();
  if(!participant||participant.experience_id!==experienceId) return NextResponse.json({error:'You are not locked into this experience.'},{status:403});
  const {data:experience}=await supabase.from('experiences').select('id,event_id,config').eq('id',experienceId).single();
  if(!experience||experience.event_id!==eventId) return NextResponse.json({error:'Experience not found.'},{status:404});
  const roles=parseRoles(experience.config??{}); const promptId=String(experience.config?.trouble_prompt_id??'');
  if(!promptId) return NextResponse.json({error:'Host has not selected tonight’s Trouble mission yet.'},{status:400});
  const {data:prompt}=await supabase.from('prompts').select('id,body,note').eq('id',promptId).eq('experience_id',experienceId).single();
  let {data:session}=await supabase.from('trouble_sessions').select('*').eq('event_id',eventId).eq('experience_id',experienceId).maybeSingle();
  if(!session){ const made=await supabase.from('trouble_sessions').insert({event_id:eventId,experience_id:experienceId,prompt_id:promptId}).select('*').single(); if(made.error) return NextResponse.json({error:made.error.message},{status:500}); session=made.data; }
  const [membersRes,votesRes,assignmentsRes,piecesRes]=await Promise.all([
    supabase.from('event_participants').select('id,display_name,locked_at').eq('event_id',eventId).eq('experience_id',experienceId).order('locked_at'),
    supabase.from('trouble_role_votes').select('voter_participant_id,role_key,nominee_participant_id,round').eq('session_id',session.id).eq('round',session.vote_round),
    supabase.from('trouble_role_assignments').select('role_key,participant_id').eq('session_id',session.id),
    supabase.from('trouble_plan_pieces').select('participant_id,role_key,contribution,approved').eq('session_id',session.id),
  ]);
  const members=membersRes.data??[], votes=votesRes.data??[], assignments=assignmentsRes.data??[], pieces=piecesRes.data??[];
  const activeRoles=roles.slice(0,members.length); const myVotes=votes.filter(v=>v.voter_participant_id===participant.id);
  const myAssignment=assignments.find(a=>a.participant_id===participant.id)??null;
  const role=myAssignment?roles.find(r=>r.key===myAssignment.role_key)??null:null;
  const myPiece=pieces.find(p=>p.participant_id===participant.id)??null;
  return NextResponse.json({participant,session,prompt,roles:activeRoles,members,myVotes,assignments,myAssignment,myRole:role,myPiece,pieces,minCrew:Math.max(2,Number(experience.config?.trouble_min_crew??2))});
}
