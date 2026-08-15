// Headless evaluation harness for the Goal Girls substitution engine (v2 model).
// GK-as-rest (running-load), role-share, no court-cap. Formations ATTACK-FIRST.
const FORMATIONS = {
  '2-2': [['GK','goal'],['D1','def'],['D2','def'],['F1','att'],['F2','att']],
  '3-1': [['GK','goal'],['D1','def'],['F1','att'],['F2','att'],['F3','att']],   // 3 att, 1 def
  '1-3': [['GK','goal'],['D1','def'],['D2','def'],['D3','def'],['F1','att']],   // 1 att, 3 def
};
function mkPlayers(n, ratingMode){
  const names='ABCDEFGHI'.split(''); const ps=[];
  for(let i=0;i<n;i++){ const sex=(i%5<2)?'f':'m';
    let rat={att:3,def:3,gk:3,fit:3};
    if(ratingMode==='varied') rat={att:1+((i*3)%5),def:1+((i*7)%5),gk:1+((i*5)%5),fit:1+((i*2)%5)};
    ps.push({id:i,name:names[i],sex,rat}); }
  return ps;
}
function playGame(cfg, rule){
  const {players, formation, halfMin, shiftSec, gkSec, minF, missRate=0}=cfg;
  const slots=FORMATIONS[formation], halfLen=halfMin*60, totalGame=halfLen*2;
  const fair=totalGame*slots.length/players.length;
  const fitFor=(p,z)=> z==='goal'?p.rat.gk:(z==='def'?p.rat.def:p.rat.att);
  const st={}; players.forEach(p=>st[p.id]={pos:null,sec:0,shift:0,z:{goal:0,def:0,att:0},rest:0,run:0,onCt:0});
  const stints={},openStint={}; players.forEach(p=>stints[p.id]=[]);
  const runStints={},openRun={}; players.forEach(p=>runStints[p.id]=[]);
  function slotZone(k){ return slots.find(s=>s[0]===k)[1]; }
  function femOn(){ return players.filter(p=>st[p.id].pos&&p.sex==='f').length; }
  function onCourt(){ return players.filter(p=>st[p.id].pos); }
  function bench(){ return players.filter(p=>!st[p.id].pos); }
  const legal=(inP,outP)=>{ if(!minF) return true; const c=femOn(); const nx=c+(inP.sex==='f'?1:0)-(outP.sex==='f'?1:0); return nx>=minF||nx>=c; };
  function setRun(id){ const on=st[id].pos&&slotZone(st[id].pos)!=='goal'; if(on&&!openRun[id])openRun[id]={start:now}; if(!on&&openRun[id]){runStints[id].push(now-openRun[id].start); delete openRun[id];} }
  const gkOK=p=>p.gkOK!==false;
  function seat(){ const used=new Set(); slots.forEach(([k,z])=>{ let pool=players.filter(p=>!used.has(p.id)); if(z==='goal'){ const ok=pool.filter(gkOK); if(ok.length)pool=ok; } const c=pool.sort((a,b)=>fitFor(b,z)-fitFor(a,z)||a.id-b.id)[0]; if(c){st[c.id].pos=k; used.add(c.id);} }); fixMinF(); players.forEach(p=>{ if(st[p.id].pos){openStint[p.id]={on:0,restBefore:Infinity}; setRun(p.id);} }); }
  function fixMinF(){ if(!minF)return; let g=0; while(femOn()<minF&&g++<10){ const m=onCourt().filter(p=>p.sex==='m'&&slotZone(st[p.id].pos)!=='goal').sort((a,b)=>st[b.id].shift-st[a.id].shift)[0]; const f=bench().filter(p=>p.sex==='f').sort((a,b)=>st[b.id].rest-st[a.id].rest)[0]; if(!m||!f)break; const sl=st[m.id].pos; st[f.id].pos=sl; st[m.id].pos=null; } }
  let maxOnCt={}; players.forEach(p=>maxOnCt[p.id]=0);
  let now=0,guard=0,seed=0,minFViol=0,slotViol=0,area=0,gkB=gkSec>0?gkSec:Infinity,subB=shiftSec,htDone=false;
  seat();
  function advance(to){ const dt=to-now; if(dt<=0){now=to;return;} area+=dt*onCourt().reduce((a,p)=>a+fitFor(p,slotZone(st[p.id].pos)),0);
    players.forEach(p=>{ const s=st[p.id]; if(s.pos){ const z=slotZone(s.pos); s.sec+=dt; s.shift+=dt; s.z[z]+=dt; s.onCt+=dt; if(z==='goal')s.run=Math.max(0,s.run-dt*0.5); else s.run+=dt; } else { s.rest+=dt; s.run=0; s.onCt=0; } });
    players.forEach(p=>{ if(st[p.id].onCt>maxOnCt[p.id]) maxOnCt[p.id]=st[p.id].onCt; });
    now=to; if(femOn()<minF&&players.filter(p=>p.sex==='f').length>=minF)minFViol++; if(onCourt().length<slots.length)slotViol++; }
  function doSub(off,inId,slot){ if(openStint[off]){const o=openStint[off]; stints[off].push({dur:now-o.on,restBefore:o.restBefore}); delete openStint[off];} st[off].pos=null; st[off].shift=0; st[off].rest=0; st[off].onCt=0; setRun(off); st[inId].pos=slot; st[inId].shift=0; st[inId].onCt=0; openStint[inId]={on:now,restBefore:st[inId].rest}; st[inId].rest=0; setRun(inId); }
  function gkSwap(){ const gk=onCourt().find(p=>slotZone(st[p.id].pos)==='goal'); const c=onCourt().filter(p=>slotZone(st[p.id].pos)!=='goal'&&gkOK(p)).sort((a,b)=>st[a.id].z.goal-st[b.id].z.goal||a.id-b.id)[0]; if(gk&&c){ const g=st[gk.id].pos,cc=st[c.id].pos; st[gk.id].pos=cc; st[c.id].pos=g; st[gk.id].shift=0; st[c.id].shift=0; setRun(gk.id); setRun(c.id); } }
  function miss(){ if(!missRate)return false; seed=(seed*1103515245+12345)&0x7fffffff; return (seed%1000)/1000<missRate; }
  while(guard++<3000){ const htAt=htDone?Infinity:halfLen, at=Math.min(subB,gkB,htAt,totalGame); if(at>=totalGame){advance(totalGame);break;} advance(at);
    if(at===htAt){ players.forEach(p=>{ st[p.id].shift=0; st[p.id].onCt=0; if(openStint[p.id]){const o=openStint[p.id]; stints[p.id].push({dur:now-o.on,restBefore:o.restBefore}); delete openStint[p.id];} if(openRun[p.id]){runStints[p.id].push(now-openRun[p.id].start); delete openRun[p.id];} });
      players.forEach(p=>{ if(st[p.id].pos){openStint[p.id]={on:now,restBefore:Infinity}; if(slotZone(st[p.id].pos)!=='goal')openRun[p.id]={start:now};} st[p.id].rest=0; st[p.id].run=0; }); htDone=true; subB=now+shiftSec; gkB=gkSec>0?now+gkSec:Infinity; continue; }
    if(at===gkB){ if(!miss())gkSwap(); gkB=now+gkSec; continue; }
    if(!miss()){ const d=rule({players,st,cfg,slots,now,totalGame,fair,fitFor,legal,femOn,onCourt,bench,slotZone}); if(d)doSub(d.off,d.in,st[d.off].pos); }
    subB=now+shiftSec; }
  players.forEach(p=>{ if(openStint[p.id]){const o=openStint[p.id]; stints[p.id].push({dur:now-o.on,restBefore:o.restBefore});} if(openRun[p.id])runStints[p.id].push(now-openRun[p.id].start); });
  const secs=players.map(p=>st[p.id].sec);
  const rmse=Math.sqrt(secs.reduce((a,s)=>a+(s-fair)**2,0)/players.length);
  let thrash=0,churn=0; players.forEach(p=>{ stints[p.id].forEach((s,i)=>{ if(i>0&&s.restBefore<45)thrash++; }); churn+=Math.max(0,stints[p.id].length-1); });
  let maxRun=0,longRuns=0; const runCap=shiftSec*3; players.forEach(p=>runStints[p.id].forEach(d=>{ maxRun=Math.max(maxRun,d); if(d>runCap)longRuns++; }));
  const attF=[]; let stuck=0; players.forEach(p=>{ const a=st[p.id].z.att,d=st[p.id].z.def,t=a+d; if(t>60){ const f=a/t; attF.push(f); if(f<0.15||f>0.85)stuck++; } });
  const am=attF.reduce((a,b)=>a+b,0)/(attF.length||1); const roleSpread=Math.sqrt(attF.reduce((a,f)=>a+(f-am)**2,0)/(attF.length||1));
  const goals=players.map(p=>st[p.id].z.goal); const goalSpread=Math.max(...goals)-Math.min(...goals);
  const fems=players.filter(p=>p.sex==='f'),males=players.filter(p=>p.sex==='m'); const avg=arr=>arr.reduce((a,p)=>a+st[p.id].sec,0)/(arr.length||1);
  const _st={}, _z={}; players.forEach(p=>{ _st[p.id]=st[p.id].sec; _z[p.id]=st[p.id].z; });
  const maxOnCourt=Math.max(...players.map(p=>maxOnCt[p.id]));
  return { maxOnCourt, fair, spread:Math.max(...secs)-Math.min(...secs), rmse, fairPct:rmse/fair, thrash, churn, maxRun, longRuns, roleSpread, roleStuck:stuck, goalSpread, genderGap:Math.abs(avg(fems)-avg(males)), winAvg:area/totalGame/slots.length, minFViol, slotViol,
    _secs:secs, _st, _z, _players:players };
}
export { FORMATIONS, mkPlayers, playGame };
