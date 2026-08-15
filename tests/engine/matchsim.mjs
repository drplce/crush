// Real-world match simulator for a casual under-10s side.
// Unlike subsim (which assumes a perfect coach acting exactly on cadence), this models what
// actually happens courtside: prompts noticed late or missed, subs made at the next break in
// play rather than the instant they're due, kids arriving late or leaving early, injuries,
// toilet breaks, sin-bins, and fatigue. It records ENGINE-VS-ACTUAL so we can tell an engine
// fault apart from a coach/real-world one.
const FORMATIONS = {
  '2-2': [['GK','goal'],['D1','def'],['D2','def'],['F1','att'],['F2','att']],
  '3-1': [['GK','goal'],['D1','def'],['F1','att'],['F2','att'],['F3','att']],
  '1-3': [['GK','goal'],['D1','def'],['D2','def'],['D3','def'],['F1','att']],
};
const clampV=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));

// deterministic PRNG so any failure is reproducible from its seed
function rng(seed){ let s=seed>>>0||1; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }

/* ---------- the engine under test (mirrors the shipped build 52 scorers) ---------- */
function engineDecide(G){
  const {st,players,C,bias,minF,slotZone,onCourt,bench,fair,now,totalGame}=G;
  const avail=p=>st[p.id].avail;
  const zoneOf=k=>slotZone(k);
  const fitFor=(p,z)=> z==='goal'?p.rat.gk:(z==='def'?p.rat.def:p.rat.att);
  const paceN=id=>clampV((fair(id)*(now/totalGame)-st[id].sec)/C,-2,2);
  const w=0.4*Math.sqrt(clampV(bias,0,1));
  const fitGain=1+bias*0.3;
  const fitN=(p,z)=>((fitFor(p,z)-3)/2)*fitGain;
  const stamF=p=>1+(3-clampV((p.rat.fit)||3,1,5))*0.15;
  const P=id=>players.find(p=>p.id===id);
  const runN=id=>clampV(st[id].run/(C*3)*stamF(P(id)),0,2);
  const ctNorm=C*3;
  const ctN=id=>clampV(st[id].onCt/ctNorm*stamF(P(id)),0,2);
  const meanZ=z=>{let s=0;players.forEach(p=>s+=st[p.id].z[z]);return s/(players.length||1);};
  const offScore=p=>{const z=zoneOf(st[p.id].pos);return (1-w)*(-paceN(p.id))+w*(-fitN(p,z))+1.0*runN(p.id)**2+0.8*ctN(p.id)**2;};
  const inScore=(b,z)=>{const rb=(z==='def'||z==='att')?clampV((meanZ(z)-st[b.id].z[z])/(C*2),-1,1):0;return (1-w)*paceN(b.id)+w*fitN(b,z)+0.25*rb;};
  const femOn=()=>onCourt().filter(p=>p.sex==='f').length;
  const legal=(inP,outP)=>{ if(!minF)return true; const c=femOn(); const nx=c+(inP.sex==='f'?1:0)-(outP.sex==='f'?1:0); return nx>=minF||nx>=c; };

  const bp=bench().filter(avail); if(!bp.length) return null;
  const mustFixFem=minF>0&&femOn()<minF&&bp.some(b=>b.sex==='f');
  let outs=onCourt().filter(p=>zoneOf(st[p.id].pos)!=='goal'||st[p.id].onCt>=ctNorm);
  if(mustFixFem) outs=outs.filter(p=>p.sex!=='f');
  if(!outs.length) return null;
  for(const out of outs.slice().sort((a,b)=>offScore(b)-offScore(a)||st[b.id].run-st[a.id].run||a.id-b.id)){
    const z=zoneOf(st[out.id].pos);
    let pool=(mustFixFem?bp.filter(b=>b.sex==='f'):bp).filter(b=>legal(b,out));
    if(z==='goal') pool=pool.filter(b=>b.gkOK!==false);
    if(!pool.length) continue;
    const rested=pool.filter(b=>st[b.id].rest>=Math.max(45,C)); if(rested.length)pool=rested;
    pool.sort((a,b)=>inScore(b,z)-inScore(a,z)||st[b.id].rest-st[a.id].rest||a.id-b.id);
    return {off:out.id, in:pool[0].id, slot:st[out.id].pos};
  }
  return null;
}
function engineKeeper(G){
  const {st,players,C,bias,slotZone,onCourt}=G;
  const w=0.4*Math.sqrt(clampV(bias,0,1));
  const fitGain=1+bias*0.3;
  const fitN=(p)=>((p.rat.gk-3)/2)*fitGain;
  const gk=onCourt().find(p=>slotZone(st[p.id].pos)==='goal');
  const cands=onCourt().filter(p=>slotZone(st[p.id].pos)!=='goal'&&p.gkOK!==false&&st[p.id].avail);
  if(!gk||!cands.length) return null;
  const score=p=>(1-w)*(-st[p.id].goal/C)+w*fitN(p);
  const best=cands.slice().sort((a,b)=>score(b)-score(a)||st[a.id].goal-st[b.id].goal||a.id-b.id)[0];
  return (best&&score(best)>score(gk))?{gkOut:gk.id, gkIn:best.id}:null;
}

/* ---------- the match ---------- */
export function playMatch(cfg){
  const {
    players, formation='3-1', halfMin=15, shiftSec=180, gkSec=300, minF=0, bias=0.5,
    seed=1,
    coachSkill=0.8,       // 0..1 probability a due prompt is acted on at all
    reactionLo=0, reactionHi=45,   // seconds between prompt and the coach acting (break in play)
    events=[],            // real-world events: {t, type, pid?}
    breakEvery=0,         // if >0, subs can only be made at a stoppage in play (every ~breakEvery sec)
    overEager=0,          // 0..1 chance the coach makes an extra unprompted change at a break
    stubborn=[],          // players the coach refuses to take off (the kid who won't come off)
  } = cfg;
  const rnd=rng(seed);
  const slots=FORMATIONS[formation], halfLen=halfMin*60, totalGame=halfLen*2;
  const slotZone=k=>slots.find(s=>s[0]===k)[1];
  const st={};
  players.forEach(p=>st[p.id]={pos:null,sec:0,shift:0,run:0,onCt:0,rest:0,goal:0,
    z:{goal:0,def:0,att:0}, avail:p.arriveAt?false:true, gone:false, injured:false, out:0});

  const onCourt=()=>players.filter(p=>st[p.id].pos);
  const bench=()=>players.filter(p=>!st[p.id].pos&&st[p.id].avail&&!st[p.id].gone);
  const availAll=()=>players.filter(p=>st[p.id].avail&&!st[p.id].gone);
  // fair share is computed over the time each player is actually AVAILABLE
  const availSec={}; players.forEach(p=>availSec[p.id]=0);
  const fair=id=>{ const tot=players.reduce((a,p)=>a+availSec[p.id],0)||1;
    return availSec[id]/tot*totalGame*slots.length; };

  // stoppages in play — a coach can realistically only make a change when the ball is dead
  const breaks=new Set();
  if(breakEvery>0){ let bt=0; while(bt<totalGame){ bt+=Math.max(10,Math.round(breakEvery*(0.5+rnd()))); breaks.add(bt); } }
  const atBreak=t=>breakEvery<=0||breaks.has(t);
  const log={subs:[], prompts:[], issues:[], extraSubs:0};
  let pending=null;   // a due prompt the coach hasn't acted on yet

  function seat(){
    const used=new Set();
    slots.forEach(([k,z])=>{
      let pool=availAll().filter(p=>!used.has(p.id));
      if(z==='goal'){ const ok=pool.filter(p=>p.gkOK!==false); if(ok.length)pool=ok; }
      const c=pool.sort((a,b)=>{const f=q=>z==='goal'?q.rat.gk:(z==='def'?q.rat.def:q.rat.att); return f(b)-f(a)||a.id-b.id;})[0];
      if(c){ st[c.id].pos=k; used.add(c.id); }
    });
    // opening five must satisfy the female floor (mirrors fixStartersMinF in the app)
    if(minF>0){ let g=0;
      const femOn=()=>onCourt().filter(p=>p.sex==='f').length;
      while(femOn()<minF && g++<6){
        const mSlot=slots.find(([k,z])=>z!=='goal'&&players.some(p=>st[p.id].pos===k&&p.sex==='m')); if(!mSlot) break;
        const cur=players.find(p=>st[p.id].pos===mSlot[0]);
        const fem=players.filter(p=>p.sex==='f'&&!st[p.id].pos&&st[p.id].avail).sort((a,b)=>a.id-b.id)[0]; if(!fem) break;
        st[cur.id].pos=null; st[fem.id].pos=mSlot[0];
      } }
  }
  function doSub(offId,inId,slot){
    st[offId].pos=null; st[offId].shift=0; st[offId].run=0; st[offId].onCt=0; st[offId].rest=0;
    st[inId].pos=slot; st[inId].shift=0; st[inId].run=0; st[inId].onCt=0; st[inId].rest=0;
  }
  // pull a player off the court entirely (injury / leaving) and backfill from the bench
  function removeFromCourt(pid){
    const slot=st[pid].pos; if(!slot) return;
    st[pid].pos=null; st[pid].run=0; st[pid].onCt=0;
    const z=slotZone(slot);
    let pool=bench(); if(z==='goal'){ const ok=pool.filter(p=>p.gkOK!==false); if(ok.length)pool=ok; }
    const femOnNow=onCourt().filter(p=>p.sex==='f').length;
    if(minF>0 && femOnNow<minF){ const f=pool.filter(p=>p.sex==='f'); if(f.length)pool=f; }
    const c=pool.sort((a,b)=>st[b.id].rest-st[a.id].rest||a.id-b.id)[0];
    if(c){ st[c.id].pos=slot; st[c.id].shift=0; st[c.id].onCt=0; st[c.id].rest=0; }
  }

  players.forEach(p=>{ if(!p.arriveAt) st[p.id].avail=true; });
  seat();

  let subDue=shiftSec, gkDue=gkSec>0?gkSec:Infinity, htDone=false, slotViol=0, minFViol=0, violCtx=null;
  const evByT={}; events.forEach(e=>{ (evByT[e.t]=evByT[e.t]||[]).push(e); });

  for(let t=1;t<=totalGame;t++){
    // ---- real-world events ----
    (evByT[t]||[]).forEach(e=>{
      const s=e.pid!=null?st[e.pid]:null;
      if(e.type==='arrive'){ s.avail=true; log.issues.push(`t=${t} ${e.pid} arrived late`); }
      else if(e.type==='leave'){ removeFromCourt(e.pid); s.gone=true; s.avail=false; log.issues.push(`t=${t} ${e.pid} left early`); }
      else if(e.type==='injury'){ removeFromCourt(e.pid); s.avail=false; s.injured=true; s.out=e.dur||0;
        log.issues.push(`t=${t} ${e.pid} injured (${e.dur?e.dur+'s':'rest of game'})`); }
      else if(e.type==='sinbin'){ removeFromCourt(e.pid); s.avail=false; s.out=e.dur||120; log.issues.push(`t=${t} ${e.pid} sin-binned`); }
      else if(e.type==='toilet'){ removeFromCourt(e.pid); s.avail=false; s.out=e.dur||90; log.issues.push(`t=${t} ${e.pid} off the court briefly`); }
    });
    // injured/sin-binned players returning
    players.forEach(p=>{ const s=st[p.id];
      if(!s.avail&&!s.gone&&s.out>0){ s.out--; if(s.out<=0){ s.avail=true; s.injured=false; } } });

    // ---- accrue ----
    players.forEach(p=>{ const s=st[p.id];
      if(s.avail&&!s.gone) availSec[p.id]++;
      if(s.pos){ const z=slotZone(s.pos); s.sec++; s.shift++; s.onCt++; s.z[z]++;
        if(z==='goal'){ s.goal++; s.run=Math.max(0,s.run-0.5); } else s.run++;
      } else { s.rest++; s.run=0; s.onCt=0; } });

    // ---- half time ----
    if(t===halfLen){
      const gkAtHt=onCourt().find(p=>slotZone(st[p.id].pos)==='goal');
      players.forEach(p=>{ st[p.id].shift=0; st[p.id].run=0; st[p.id].onCt=0; });
      subDue=t+shiftSec;
      gkDue=gkSec>0? t+Math.max(0,gkSec-(gkAtHt?st[gkAtHt.id].goal%gkSec:0)) : Infinity;
      htDone=true; pending=null;
      continue;
    }

    const G={st,players,C:shiftSec,bias,minF,slotZone,onCourt,bench,fair,now:t,totalGame};

    // ---- keeper re-pick ----
    if(t>=gkDue){
      const k=engineKeeper(G);
      if(k){ const a=st[k.gkOut].pos,b=st[k.gkIn].pos; st[k.gkOut].pos=b; st[k.gkIn].pos=a;
        st[k.gkOut].shift=0; st[k.gkIn].shift=0; }
      gkDue=t+gkSec;
    }

    // ---- sub prompt ----
    const femFixable=()=> minF>0 && onCourt().filter(p=>p.sex==='f').length<minF && bench().some(p=>p.sex==='f');
    if((t>=subDue||femFixable()) && !pending){
      const d=engineDecide(G);
      if(d){
        const acts=rnd()<coachSkill && !stubborn.includes(d.off);
        const delay=Math.round(reactionLo+rnd()*(reactionHi-reactionLo));
        pending={...d, dueAt:t, actAt:t+delay, acts};
        log.prompts.push({t, off:d.off, in:d.in, acted:acts});
      }
      subDue=t+shiftSec;
    }
    // coach acts (late, at the next break in play)
    if(pending && t>=pending.actAt && atBreak(t)){
      if(pending.acts){
        // by now the situation may have changed — re-ask the engine, mimicking the app re-planning
        const fresh=engineDecide(G);
        const use=(fresh&&st[fresh.off].pos)?fresh:pending;
        if(st[use.off]&&st[use.off].pos&&st[use.in]&&!st[use.in].pos&&st[use.in].avail){
          doSub(use.off,use.in,st[use.off].pos);
          log.subs.push({t, off:use.off, in:use.in,
            followed: (use.off===pending.off&&use.in===pending.in)?'exact':'partial', lateBy:t-pending.dueAt});
        }
      }
      pending=null;
    }
    // an over-eager coach makes changes of their own between prompts
    if(overEager>0 && !pending && atBreak(t) && rnd()<overEager){
      const d2=engineDecide(G);
      if(d2 && !stubborn.includes(d2.off) && st[d2.off].pos && st[d2.in].avail && !st[d2.in].pos){
        doSub(d2.off,d2.in,st[d2.off].pos); log.extraSubs++;
      }
    }
    // safety: if we're short on court and someone is available, fill the gap
    // fill EVERY fillable slot this tick — two kids arriving together both go straight on
    let fillGuard=0;
    while(onCourt().length<slots.length && bench().length && fillGuard++<6){
      const empty=slots.map(s=>s[0]).find(k=>!players.some(p=>st[p.id].pos===k));
      if(!empty) break;
      let pool=bench(); if(slotZone(empty)==='goal'){const ok=pool.filter(p=>p.gkOK!==false); if(ok.length)pool=ok;}
      const c=pool.sort((a,b)=>st[b.id].rest-st[a.id].rest||a.id-b.id)[0];
      if(!c) break;
      st[c.id].pos=empty; st[c.id].shift=0; st[c.id].onCt=0; st[c.id].rest=0;
    }
    // count genuine shortfalls: on court < 5 while enough players were available to field five
    if(onCourt().length<slots.length && availAll().length>=slots.length){ slotViol++; if(!violCtx) violCtx={t, on:onCourt().length, avail:availAll().length, bench:bench().length, benchIds:bench().map(p=>p.id), emptySlots:slots.map(s=>s[0]).filter(k=>!players.some(p=>st[p.id].pos===k))}; }
    if(minF>0 && onCourt().filter(p=>p.sex==='f').length<minF && availAll().filter(p=>p.sex==='f').length>=minF) minFViol++;
  }

  // ---- metrics ----
  const active=players.filter(p=>availSec[p.id]>60);
  const shareErr=active.map(p=>{ const f=fair(p.id)||1; return (st[p.id].sec-f)/f; });
  const rmse=Math.sqrt(shareErr.reduce((a,x)=>a+x*x,0)/(shareErr.length||1));
  const maxOnCt=Math.max(0,...players.map(p=>st[p.id].onCt));
  const goalTimes=players.filter(p=>p.gkOK!==false&&availSec[p.id]>60).map(p=>st[p.id].goal);
  const optOutGoal=players.filter(p=>p.gkOK===false).reduce((a,p)=>a+st[p.id].goal,0);
  return {
    fairPct:rmse, maxOnCourt:maxOnCt, slotViol, minFViol, violCtx,
    subs:log.subs.length, extraSubs:log.extraSubs, prompts:log.prompts.length,
    promptsActioned:log.prompts.filter(p=>p.acted).length,
    avgLate: log.subs.length? Math.round(log.subs.reduce((a,s)=>a+s.lateBy,0)/log.subs.length):0,
    followedExact: log.subs.filter(s=>s.followed==='exact').length,
    optOutGoalTime:optOutGoal,
    goalSpread: goalTimes.length? Math.max(...goalTimes)-Math.min(...goalTimes):0,
    issues:log.issues, _st:st, _avail:availSec, _players:players, _fair:fair, _slots:slots.length,
  };
}
export { FORMATIONS };
