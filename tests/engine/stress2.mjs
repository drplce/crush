// Expanded real-world scenario sweep for a casual under-10s side.
// Wider than stress.mjs: all-girls / all-boys / mixed squads, multiple goalie opt-outs,
// short-handed squads, breaks in play, over-eager and reluctant coaches, kids who refuse to
// come off, staggered late arrivals, players who leave and return, and half lengths 5-30min.
import { playMatch } from './matchsim.mjs';

const N=+(process.argv[2]||7500);
let seed=20260816;
const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const pick=a=>a[Math.floor(rnd()*a.length)];
const NAMES=['Harriet','Imogen','Layla','Isabelle','Ella','Summer','Felicity','Poppy','Maeve','Ivy','Nina','Orla'];

function makeSquad(n, profile, composition, optOutMode){
  const ps=[];
  for(let i=0;i<n;i++){
    let rat;
    if(profile==='flat') rat={att:3,def:3,gk:3,fit:3};
    else if(profile==='wide') rat={att:ri(1,5),def:ri(1,5),gk:ri(1,5),fit:ri(1,5)};
    else if(profile==='oneStar') rat= i===0?{att:5,def:5,gk:4,fit:5}:{att:2,def:2,gk:2,fit:3};
    else if(profile==='lowStam') rat={att:3,def:3,gk:3,fit:ri(1,2)};   // whole side tires fast
    else rat={att:ri(2,4),def:ri(2,4),gk:ri(2,4),fit:ri(2,4)};
    const sex = composition==='allF'?'f' : composition==='allM'?'m' : (i%5<2?'f':'m');
    ps.push({id:i,name:NAMES[i],sex,rat,gkOK:true});
  }
  // goalie opt-outs — the common real case is one or two kids who won't go in
  if(optOutMode==='one'&&n>=6) ps[ri(1,n-1)].gkOK=false;
  else if(optOutMode==='two'&&n>=7){ ps[ri(1,n-1)].gkOK=false; ps[ri(1,n-1)].gkOK=false; }
  else if(optOutMode==='onlyOne'&&n>=6){ ps.forEach((p,i)=>{ p.gkOK = i===0; }); }   // exactly one keeper
  else if(optOutMode==='none'&&n>=6){ ps.forEach(p=>{ p.gkOK=false; }); }            // nobody wants to keep
  return ps;
}

function makeEvents(ps, halfMin){
  const total=halfMin*120, evs=[], ids=ps.map(p=>p.id);
  // staggered late arrivals — very common at junior level
  const lateN = rnd()<0.4 ? ri(1,2) : 0;
  const arrived=new Set();
  for(let k=0;k<lateN;k++){ const p=pick(ids); if(arrived.has(p))continue; arrived.add(p);
    ps.find(x=>x.id===p).arriveAt=true; evs.push({t:ri(30,Math.max(60,Math.floor(total*0.35))), type:'arrive', pid:p}); }
  // early departure (party / another game)
  if(rnd()<0.25) evs.push({t:ri(Math.floor(total*0.5),total-90), type:'leave', pid:pick(ids)});
  // injuries — knock, or out for the game
  if(rnd()<0.32){ const dur=rnd()<0.55?ri(60,300):0; evs.push({t:ri(90,total-150), type:'injury', pid:pick(ids), dur}); }
  if(rnd()<0.10) evs.push({t:ri(90,total-90), type:'injury', pid:pick(ids), dur:ri(60,240)});
  // toilet / laces / tears
  if(rnd()<0.35) evs.push({t:ri(45,total-90), type:'toilet', pid:pick(ids), dur:ri(40,150)});
  // sin bin
  if(rnd()<0.08) evs.push({t:ri(120,total-120), type:'sinbin', pid:pick(ids), dur:120});
  return evs;
}

const results=[], failures=[];
for(let i=0;i<N;i++){
  const n=ri(4,12);                                   // includes short-handed (4) and big (12) squads
  const composition=pick(['mixed','mixed','allF','allM']);
  const profile=pick(['flat','wide','oneStar','narrow','lowStam']);
  const optOutMode=pick(['none0','one','one','two','onlyOne','none']);
  const ps=makeSquad(n,profile,composition,optOutMode);
  const halfMin=pick([5,8,10,12,15,20,25,30]);
  const minF = composition==='mixed' ? pick([0,2,2,3]) : pick([0,2]);   // a stale value on a single-sex side must be ignored
  const cfg={
    players:ps, formation:pick(['2-2','3-1','1-3']), halfMin,
    shiftSec:pick([60,90,120,180,240,300]), gkSec:pick([0,120,180,300,420,600]),
    minF, bias:pick([0,0.25,0.5,0.75,1]),
    seed:i+1,
    coachSkill:pick([1.0,0.95,0.85,0.7,0.5,0.3]),
    reactionLo:0, reactionHi:pick([0,15,30,60,90]),
    breakEvery:pick([0,0,30,60,90]),                  // stoppages in play
    overEager:pick([0,0,0,0.1,0.25]),                 // coach making their own changes
    stubborn: rnd()<0.15 ? [pick(ps.map(p=>p.id))] : [],   // the kid who won't come off
    events:makeEvents(ps,halfMin),
  };
  let m,threw=null;
  try{ m=playMatch(cfg); }catch(e){ threw=String(e&&e.stack||e).split('\n')[0]; }
  const issues=[];
  if(threw) issues.push('THREW: '+threw);
  else {
    const singleSex = !(ps.some(p=>p.sex==='f')&&ps.some(p=>p.sex==='m'));
    if(!Number.isFinite(m.fairPct)) issues.push('fairPct NaN');
    if(m.slotViol>0) issues.push(`short-handed ${m.slotViol}s while enough players available`);
    // ♀ floor: only meaningful on a mixed squad. On a single-sex squad it must never bite at all.
    if(singleSex && m.minFViol>0) issues.push(`♀ rule applied to a single-sex squad (${m.minFViol}s)`);
    if(!singleSex){ const grace=cfg.reactionHi+Math.max(30,cfg.breakEvery)+30;
      if(m.minFViol>grace && cfg.coachSkill===1) issues.push(`below ♀ min ${m.minFViol}s despite an attentive coach (grace ${grace}s)`); }
    // An opt-out can only be honoured if SOMEONE is willing to keep. With nobody eligible the app
    // deliberately falls back to the whole squad rather than field a team with an empty goal.
    // With only ONE willing keeper they cannot cover a whole game (rest, subs, injuries), so the app must
    // eventually put someone else in. Two or more willing keepers means the opt-out should always be honoured.
    const willing=ps.filter(p=>p.gkOK!==false).length;
    if(willing>=2 && m.optOutGoalTime>0) issues.push(`opted-out player spent ${m.optOutGoalTime}s in goal despite ${ps.filter(p=>p.gkOK!==false).length} willing keeper(s)`);
    Object.entries(m._st).forEach(([id,s])=>{
      if(s.sec<0||!Number.isFinite(s.sec)) issues.push('bad sec p'+id);
      const zs=s.z.goal+s.z.def+s.z.att;
      if(Math.abs(s.sec-zs)>2) issues.push(`zone mismatch p${id}`);
      if(s.sec>halfMin*120+2) issues.push(`p${id} played longer than the game`);
    });
  }
  results.push({i,n,composition,profile,optOutMode,halfMin,minF,cfg,m,issues});
  if(issues.length) failures.push(results[results.length-1]);
}

const ok=results.filter(r=>!r.issues.length);
console.log(`=== EXPANDED SCENARIO SWEEP: ${N} matches ===\n`);
console.log(`Invariants held: ${ok.length}/${N}`);
if(failures.length){
  const byKind={};
  failures.forEach(f=>f.issues.forEach(x=>{ const k=x.replace(/\d+/g,'N'); byKind[k]=(byKind[k]||0)+1; }));
  console.log('\n!! FAILURE KINDS:');
  Object.entries(byKind).sort((a,b)=>b[1]-a[1]).forEach(([k,c])=>console.log(`   ${String(c).padStart(4)} x ${k}`));
  console.log('\n  examples:');
  failures.slice(0,10).forEach(f=>{ console.log(`   #${f.i} n=${f.n} ${f.composition} ${f.optOutMode} ${f.cfg.formation} half=${f.halfMin} minF=${f.minF} coach=${f.cfg.coachSkill} -> ${f.issues[0]}`);
    if(f.m.violCtx) console.log(`       ctx ${JSON.stringify(f.m.violCtx)}`);
    if(f.cfg.events.length) console.log(`       events ${JSON.stringify(f.cfg.events)}`); });
}
function summ(label, rows){
  if(!rows.length) return;
  const avg=f=>rows.reduce((a,r)=>a+f(r),0)/rows.length;
  console.log(`  ${label.padEnd(24)} n=${String(rows.length).padStart(5)}  fairness ${(avg(r=>r.m.fairPct)*100).toFixed(1).padStart(6)}%  actioned ${(avg(r=>r.m.prompts?r.m.promptsActioned/r.m.prompts:1)*100).toFixed(0).padStart(3)}%  late ${avg(r=>r.m.avgLate).toFixed(0).padStart(3)}s`);
}
console.log('\n--- squad size ---');       for(const n of [4,5,6,7,8,9,10,11,12]) summ('squad '+n, ok.filter(r=>r.n===n));
console.log('\n--- team composition ---');  for(const c of ['mixed','allF','allM']) summ(c, ok.filter(r=>r.composition===c));
console.log('\n--- goalie availability ---');for(const o of ['none0','one','two','onlyOne','none']) summ('optOut:'+o, ok.filter(r=>r.optOutMode===o));
console.log('\n--- coach reliability ---');  for(const c of [1.0,0.95,0.85,0.7,0.5,0.3]) summ('actions '+Math.round(c*100)+'%', ok.filter(r=>r.cfg.coachSkill===c));
console.log('\n--- breaks in play ---');    for(const b of [0,30,60,90]) summ(b?('sub only at ~'+b+'s breaks'):'no stoppage model', ok.filter(r=>r.cfg.breakEvery===b));
console.log('\n--- coach over-subbing ---');for(const o of [0,0.1,0.25]) summ('overEager '+o, ok.filter(r=>r.cfg.overEager===o));
console.log('\n--- half length ---');       for(const h of [5,8,10,12,15,20,25,30]) summ(h+' min halves', ok.filter(r=>r.halfMin===h));
console.log('\n--- squad profile ---');     for(const p of ['flat','wide','oneStar','narrow','lowStam']) summ(p, ok.filter(r=>r.profile===p));
console.log('\n--- a kid who refuses to come off ---'); summ('stubborn player', ok.filter(r=>r.cfg.stubborn.length>0));
summ('no stubborn player', ok.filter(r=>r.cfg.stubborn.length===0));

if(failures.length) process.exit(1);
