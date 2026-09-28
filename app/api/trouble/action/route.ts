import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { assignRoles, buildPlainSummary, hashDeviceToken, parseRoles } from '@/lib/trouble';

export async function POST(request: Request){
  const body=await request.json().catch(()=>null); const {action,eventId,experienceId,deviceToken}=body??{};
  if(!action||!eventId||!experienceId||!hashDeviceToken(deviceToken)) return NextResponse.json({error:'Invalid action.'},{status:400});
  const supabase=getSupabaseAdmin();
  const [{data:participant},{data:experience},{data:session}]=await Promise.all([
    supabase.from('event_participants').select('id,display_name,experience_id').eq('event_id',eventId).eq('device_token',hashDeviceToken(deviceToken)??'').maybeSingle(),
    supabase.from('experiences').select('id,event_id,config').eq('id',experienceId).maybeSingle(),
    supabase.from('trouble_sessions').select('*').eq('event_id',eventId).eq('experience_id',experienceId).maybeSingle(),
  ]);
  if(!participant||participant.experience_id!==experienceId||!experience||experience.event_id!==eventId||!session) return NextResponse.json({error:'Trouble session not found.'},{status:404});
  const roles=parseRoles(experience.config??{});

  if(action==='lockCrew'){
    if(session.status!=='lobby') return NextResponse.json({ok:true});
    const {count}=await supabase.from('event_participants').select('*',{count:'exact',head:true}).eq('event_id',eventId).eq('experience_id',experienceId);
    const minCrew=Math.max(2,Number(experience.config?.trouble_min_crew??2));
    if((count??0)<minCrew) return NextResponse.json({error:`Need at least ${minCrew} people before locking the crew.`},{status:400});
    const {error}=await supabase.from('trouble_sessions').update({status:'voting'}).eq('id',session.id).eq('status','lobby');
    if(error) return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true});
  }

  if(action==='voteRoles'){
    if(session.status!=='voting') return NextResponse.json({error:'Role voting is closed.'},{status:400});
    const nominations=Array.isArray(body.nominations)?body.nominations:[];
    const {data:members}=await supabase.from('event_participants').select('id').eq('event_id',eventId).eq('experience_id',experienceId);
    const memberIds=new Set((members??[]).map(m=>m.id)); const activeRoles=roles.slice(0,memberIds.size); const allowed=new Set(activeRoles.map(r=>r.key));
    if(nominations.length!==activeRoles.length) return NextResponse.json({error:'Vote once for every role.'},{status:400});
    if(new Set(nominations.map((n:any)=>n.roleKey)).size!==activeRoles.length) return NextResponse.json({error:'Each role needs exactly one vote.'},{status:400});
    for(const n of nominations){ if(!allowed.has(String(n.roleKey))||!memberIds.has(String(n.nomineeParticipantId))) return NextResponse.json({error:'Invalid role vote.'},{status:400}); }
    await supabase.from('trouble_role_votes').delete().eq('session_id',session.id).eq('voter_participant_id',participant.id).eq('round',session.vote_round);
    const inserted=await supabase.from('trouble_role_votes').insert(nominations.map((n:any)=>({session_id:session.id,voter_participant_id:participant.id,role_key:String(n.roleKey),nominee_participant_id:String(n.nomineeParticipantId),round:session.vote_round})));
    if(inserted.error) return NextResponse.json({error:inserted.error.message},{status:500});
    const [{data:allMembers},{data:allVotes}]=await Promise.all([
      supabase.from('event_participants').select('id').eq('event_id',eventId).eq('experience_id',experienceId),
      supabase.from('trouble_role_votes').select('voter_participant_id').eq('session_id',session.id).eq('round',session.vote_round),
    ]);
    const list=allMembers??[]; const allDone=list.length>0&&list.every(m=>(allVotes??[]).filter(v=>v.voter_participant_id===m.id).length>=activeRoles.length);
    if(allDone){
      const assignments=await assignRoles(supabase,session.id,list.map(m=>m.id),roles,session.vote_round);
      await supabase.from('trouble_role_assignments').delete().eq('session_id',session.id);
      const a=await supabase.from('trouble_role_assignments').insert(assignments.map(x=>({session_id:session.id,...x})));
      if(a.error) return NextResponse.json({error:a.error.message},{status:500});
      await supabase.from('trouble_sessions').update({status:'planning'}).eq('id',session.id);
    }
    return NextResponse.json({ok:true,allDone});
  }

  if(action==='savePiece'){
    if(!['planning','review'].includes(session.status)) return NextResponse.json({error:'Planning is not open.'},{status:400});
    const {data:assignment}=await supabase.from('trouble_role_assignments').select('role_key').eq('session_id',session.id).eq('participant_id',participant.id).maybeSingle();
    if(!assignment) return NextResponse.json({error:'You do not have a role yet.'},{status:400});
    const contribution=String(body.contribution??'').trim(); if(!contribution) return NextResponse.json({error:'Add your part of the plan first.'},{status:400});
    const saved=await supabase.from('trouble_plan_pieces').upsert({session_id:session.id,participant_id:participant.id,role_key:assignment.role_key,contribution:contribution.slice(0,1800),approved:false,updated_at:new Date().toISOString()},{onConflict:'session_id,participant_id'});
    if(saved.error) return NextResponse.json({error:saved.error.message},{status:500});
    const [{data:members},{data:pieces},{data:prompt}]=await Promise.all([
      supabase.from('event_participants').select('id,display_name').eq('event_id',eventId).eq('experience_id',experienceId),
      supabase.from('trouble_plan_pieces').select('participant_id,role_key,contribution').eq('session_id',session.id),
      supabase.from('prompts').select('body').eq('id',session.prompt_id).single(),
    ]);
    if((pieces??[]).length>=(members??[]).length&&(members??[]).length>0){
      const roleMap=new Map(roles.map(r=>[r.key,r.label])); const memberMap=new Map((members??[]).map(m=>[m.id,m.display_name]));
      const plain=buildPlainSummary({mission:prompt?.body??'Tonight’s mission',crew:[...(pieces??[])].sort((x,y)=>roles.findIndex(r=>r.key===x.role_key)-roles.findIndex(r=>r.key===y.role_key)).map(p=>({display_name:memberMap.get(p.participant_id)??'Crew member',role_label:roleMap.get(p.role_key)??p.role_key,contribution:p.contribution}))});
      await supabase.from('trouble_plan_pieces').update({approved:false}).eq('session_id',session.id);
      await supabase.from('trouble_sessions').update({status:'review',plain_summary:plain}).eq('id',session.id);
    }
    return NextResponse.json({ok:true});
  }

  if(action==='approve'){
    if(session.status!=='review') return NextResponse.json({error:'The plan is not ready for approval.'},{status:400});
    const u=await supabase.from('trouble_plan_pieces').update({approved:true}).eq('session_id',session.id).eq('participant_id',participant.id);
    if(u.error) return NextResponse.json({error:u.error.message},{status:500});
    const [{count:memberCount},{count:approvedCount}]=await Promise.all([
      supabase.from('event_participants').select('*',{count:'exact',head:true}).eq('event_id',eventId).eq('experience_id',experienceId),
      supabase.from('trouble_plan_pieces').select('*',{count:'exact',head:true}).eq('session_id',session.id).eq('approved',true),
    ]);
    if((memberCount??0)>0&&approvedCount===memberCount) await supabase.from('trouble_sessions').update({status:'submitted',submitted_at:new Date().toISOString()}).eq('id',session.id);
    return NextResponse.json({ok:true,allApproved:approvedCount===memberCount});
  }
  return NextResponse.json({error:'Unknown action.'},{status:400});
}
