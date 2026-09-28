'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Experience } from '@/lib/types';

type Role = { key:string; label:string; bio:string };
type Member = { id:string; display_name:string; locked_at:string };
type Assignment = { role_key:string; participant_id:string };
type Dare = { id:string; title:string; dare_text:string; success_text:string|null };
type Truth = { id:string; prompt:string };
type Task = {
  participant_id:string;
  role_key:string;
  status:'assigned'|'completed'|'caught'|'truth';
  truth_answer:string|null;
  result_note:string|null;
  dare:Dare|null;
  truth:Truth|null;
};
type CollabInvite = { id:string; requester_id:string; requester_name:string; requester_dare:Dare|null };
type Alliance = {
  id:string;
  partner_id:string;
  partner_name:string;
  partner_task:{status:string;dare:Dare|null;truth:Truth|null;truth_answer:string|null}|null;
};
type TroubleState = {
  participant:{id:string;display_name:string;experience_id:string};
  session:{id:string;status:'lobby'|'voting'|'active'|'wrapped';vote_round:number;host_wrap_text:string|null};
  roles:Role[];
  members:Member[];
  myVotes:Array<{role_key:string;nominee_participant_id:string}>;
  roleVoteCounts:Record<string,Record<string,number>>;
  assignments:Assignment[];
  myAssignment:Assignment|null;
  myRole:Role|null;
  myTask:Task|null;
  incomingCollab:CollabInvite|null;
  outgoingCollab:{id:string;helper_id:string}|null;
  alliance:Alliance|null;
  publicTruths:Array<{participant_id:string;name:string;prompt:string;answer:string}>;
  progress:{total:number;resolved:number;completed:number;caught:number;truths:number;alliances:number};
  minCrew:number;
};

function getDeviceToken(){
  const key='interactive-event-device-token';
  let token=window.localStorage.getItem(key);
  if(!token){token=crypto.randomUUID();window.localStorage.setItem(key,token);}
  return token;
}

async function post<T>(url:string,body:unknown):Promise<T>{
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const json=await res.json();
  if(!res.ok) throw new Error(json.error||'Something went wrong.');
  return json as T;
}

export default function TroubleCrew({eventId,experience,onBack}:{eventId:string;experience:Experience;onBack:()=>void}){
  const [state,setState]=useState<TroubleState|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [votes,setVotes]=useState<Record<string,string>>({});
  const [truthAnswer,setTruthAnswer]=useState('');
  const [resultNote,setResultNote]=useState('');
  const [recruitOpen,setRecruitOpen]=useState(false);
  const [revealIndex,setRevealIndex]=useState(0);

  const load=useCallback(async()=>{
    try{
      const next=await post<TroubleState>('/api/trouble/state',{eventId,experienceId:experience.id,deviceToken:getDeviceToken()});
      setState(next);
      if(next.myVotes?.length) setVotes(Object.fromEntries(next.myVotes.map(v=>[v.role_key,v.nominee_participant_id])));
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not load Trouble.');}
  },[eventId,experience.id]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer);},[load]);

  async function action(name:string,extra:Record<string,unknown>={}){
    setBusy(true);setError('');
    try{
      await post('/api/trouble/action',{action:name,eventId,experienceId:experience.id,deviceToken:getDeviceToken(),...extra});
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not update Trouble.');}
    finally{setBusy(false);}
  }

  const memberById=useMemo(()=>new Map((state?.members??[]).map(m=>[m.id,m])),[state?.members]);

  if(!state){
    return <section><button className="back" onClick={onBack}>← Back</button><div className="panel">{error||'Loading Trouble…'}</div></section>;
  }

  if(state.session.status==='lobby'){
    return <section><div className="panel">
      <div className="category">A Little Trouble</div>
      <p className="prompt">Your crew is forming.</p>
      <p className="note">Everyone who chose Trouble is in. Once the crew locks, the group decides what kind of trouble each person is built for.</p>
      <div className="crewList">{state.members.map(m=><div className="crewChip" key={m.id}>{m.display_name}</div>)}</div>
      <button className="primary" disabled={busy||state.members.length<state.minCrew} onClick={()=>action('lockCrew')}>Everyone&apos;s here — lock the crew</button>
      {error&&<div className="error">{error}</div>}
    </div></section>;
  }

  if(state.session.status==='voting'){
    const complete=state.roles.every(r=>!!votes[r.key]);
    return <section><div className="panel">
      <div className="category">Assign the troublemakers</div>
      <p className="prompt">Who in this crew is built for each role?</p>
      {state.roles.map(role=><div className="roleVoteCard" key={role.key}>
        <h3>{role.label}</h3><p>{role.bio}</p>
        <div className="scenarioChoiceGrid">{state.members.map(m=><button
          key={m.id}
          className={`scenarioChoice ${votes[role.key]===m.id?'selected':''}`}
          onClick={()=>setVotes(current=>({...current,[role.key]:m.id}))}
        >{m.display_name}{m.id===state.participant.id?' (me)':''}</button>)}</div>
      </div>)}
      <button className="primary" disabled={busy||!complete} onClick={()=>action('voteRoles',{nominations:state.roles.map(r=>({roleKey:r.key,nomineeParticipantId:votes[r.key]}))})}>Submit my role votes</button>
      <p className="tiny">Self-voting is allowed. Nobody sees who voted for whom.</p>
      {error&&<div className="error">{error}</div>}
    </div></section>;
  }

  if(state.session.status==='wrapped'){
    return <section><div className="panel">
      <div className="category">Trouble wrapped</div>
      <p className="prompt">That&apos;s the night.</p>
      <div className="status">{state.progress.completed} completed · {state.progress.caught} caught · {state.progress.truths} Truth · {state.progress.alliances} alliances</div>
      {state.publicTruths.map(t=><div className="entry" key={t.participant_id}><strong>{t.name} chose Truth</strong><div className="tiny" style={{textAlign:'left',marginTop:8}}>{t.prompt}</div><div className="entryText">{t.answer}</div></div>)}
      <p className="note">The post-event host wrap-up is now ready for the booking/admin system to deliver.</p>
    </div></section>;
  }

  // ACTIVE: use a local reveal so the assignments feel like a reveal without blocking the asynchronous game.
  const revealKey=`trouble-role-reveal:${state.session.id}`;
  const revealed=typeof window!=='undefined' && window.localStorage.getItem(revealKey)==='done';
  if(!revealed && state.assignments.length===state.members.length){
    const assignment=state.assignments[revealIndex]??null;
    const role=assignment?state.roles.find(r=>r.key===assignment.role_key):null;
    const member=assignment?memberById.get(assignment.participant_id):null;
    const count=assignment&&role?state.roleVoteCounts[role.key]?.[assignment.participant_id]??0:0;
    return <section><div className="panel">
      <div className="category">The crew has spoken</div>
      {assignment&&role&&member?<>
        <p className="prompt">{role.label}</p>
        <div className="roleReveal"><strong>{member.display_name}</strong><span>{count} {count===1?'vote':'votes'}</span></div>
        <p className="note">{role.bio}</p>
      </>:<p className="note">Building the reveal…</p>}
      <button className="primary" onClick={()=>{
        if(revealIndex<state.assignments.length-1){setRevealIndex(i=>i+1);}else{window.localStorage.setItem(revealKey,'done');setRevealIndex(i=>i+1);void load();}
      }}>{revealIndex<state.assignments.length-1?'Next role':'Show me my dare'}</button>
    </div></section>;
  }

  const task=state.myTask;
  if(!task){
    return <section><div className="panel"><p className="note">Your dare is being assigned…</p>{error&&<div className="error">{error}</div>}</div></section>;
  }

  const unresolved=task.status==='assigned';
  const hasTruthPrompt=!!task.truth && !task.truth_answer;

  return <section><div className="panel">
    <div className="category">{state.myRole?.label??'A Little Trouble'}</div>
    {state.myRole&&<p className="note">{state.myRole.bio}</p>}

    {unresolved&&!hasTruthPrompt&&task.dare&&<>
      <p className="prompt">{task.dare.title}</p>
      <div className="dareCard">{task.dare.dare_text}</div>
      {task.dare.success_text&&<div className="status"><strong>Success:</strong> {task.dare.success_text}</div>}

      {state.incomingCollab&&<div className="collabCard">
        <strong>{state.incomingCollab.requester_name} wants backup.</strong>
        <p>{state.incomingCollab.requester_dare?.title}: {state.incomingCollab.requester_dare?.dare_text}</p>
        <p className="tiny">If you accept, you help them and they owe you the same help on your dare.</p>
        <div className="buttonRow"><button className="secondary" disabled={busy} onClick={()=>action('respondCollab',{collabId:state.incomingCollab!.id,accept:false})}>Decline</button><button className="primary" disabled={busy} onClick={()=>action('respondCollab',{collabId:state.incomingCollab!.id,accept:true})}>Accept collab</button></div>
      </div>}

      {state.alliance&&<div className="collabCard"><strong>Alliance: {state.alliance.partner_name}</strong><p>You help each other. Both dares are visible to both of you.</p>{state.alliance.partner_task?.dare&&<p><strong>Their dare:</strong> {state.alliance.partner_task.dare.title} — {state.alliance.partner_task.dare.dare_text}</p>}</div>}

      {!state.alliance&&!state.incomingCollab&&!state.outgoingCollab&&<>
        <button className="secondary" onClick={()=>setRecruitOpen(v=>!v)}>Need backup? Recruit one person</button>
        {recruitOpen&&<div className="scenarioChoiceGrid">{state.members.filter(m=>m.id!==state.participant.id).map(m=><button key={m.id} className="scenarioChoice" disabled={busy} onClick={()=>{setRecruitOpen(false);void action('recruit',{helperId:m.id});}}>{m.display_name}</button>)}</div>}
      </>}
      {state.outgoingCollab&&<div className="status">Collab request sent. They have to accept before the alliance exists.</div>}

      <textarea className="textArea" maxLength={500} placeholder="Optional: what happened? This can appear in the wrap-up." value={resultNote} onChange={e=>setResultNote(e.target.value)}/>
      <button className="primary" disabled={busy} onClick={()=>action('finishDare',{result:'completed',note:resultNote})}>I pulled it off</button>
      <button className="secondary" disabled={busy} onClick={()=>action('finishDare',{result:'caught',note:resultNote})}>I got caught</button>
      <button className="secondary truthButton" disabled={busy} onClick={()=>action('passForTruth')}>Pass on the dare — give me a Truth</button>
    </>}

    {unresolved&&hasTruthPrompt&&task.truth&&<>
      <div className="category">You chose Truth</div>
      <p className="prompt">{task.truth.prompt}</p>
      <textarea className="textArea" maxLength={600} placeholder="Tell the crew…" value={truthAnswer} onChange={e=>setTruthAnswer(e.target.value)}/>
      <button className="primary" disabled={busy||!truthAnswer.trim()} onClick={()=>action('submitTruth',{answer:truthAnswer})}>Tell the crew</button>
    </>}

    {!unresolved&&<>
      <p className="prompt">{task.status==='completed'?'You pulled it off.':task.status==='caught'?'You got caught.':'Truth submitted.'}</p>
      <div className="status">{state.progress.resolved} of {state.progress.total} Trouble players have finished.</div>
      <p className="note">You&apos;re done. Everyone else can finish whenever their opportunity appears.</p>
    </>}

    {state.publicTruths.length>0&&<details className="crewPlanDetails"><summary>Truths the crew has told</summary>{state.publicTruths.map(t=><div className="entry" key={t.participant_id}><strong>{t.name}</strong><div className="tiny" style={{textAlign:'left',marginTop:8}}>{t.prompt}</div><div className="entryText">{t.answer}</div></div>)}</details>}

    {error&&<div className="error">{error}</div>}
  </div></section>;
}
