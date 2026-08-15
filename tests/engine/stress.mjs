// Hundreds of real-world scenarios for a casual under-10s side.
// Squad sizes 5-10, injuries, late arrivals, early departures, sin-bins, toilet breaks,
// a distracted coach who acts late or misses prompts entirely, and varied stamina/skill.
// Checks HARD INVARIANTS (must never break) and reports engine-vs-actual quality.
import { playMatch } from './matchsim.mjs';

const N=+(process.argv[2]||400);
let seed=20260815;
const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const pick=a=>a[Math.floor(rnd()*a.length)];

const NAMES=['Harriet','Imogen','Layla','Isabelle','Ella','Summer','Felicity','Poppy','Maeve','Ivy'];

function makeSquad(n, profile){
  const ps=[];
  for(let i=0;i<n;i++){
    let rat;
    if(profile==='flat') rat={att:3,def:3,gk:3,fit:3};
    else if(profile==='mixed') rat={att:ri(1,5),def:ri(1,5),gk:ri(1,5),fit:ri(1,5)};
    else if(profile==='oneStar') rat= i===0?{att:5,def:5,gk:4,fit:5}:{att:2,def:2,gk:2,fit:3};
    else rat={att:ri(2,4),def:ri(2,4),gk:ri(2,4),fit:ri(2,4)};
    ps.push({id:i,name:NAMES[i],sex:i%5<2?'f':'m',rat,gkOK:true});
  }
  // a casual side very often has one kid who won't go in goal
  if(n>=6 && rnd()<0.5) ps[ri(1,n-1)].gkOK=false;
  return ps;
}

function makeEvents(ps, halfMin){
  const total=halfMin*120, evs=[];
  const ids=ps.map(p=>p.id);
  const roll=rnd();
  // late arrival (very common at junior level)
  if(roll<0.35){ const p=pick(ids); ps.find(x=>x.id===p).arriveAt=true; evs.push({t:ri(60,total*0.3), type:'arrive', pid:p}); }
  // early departure
  if(rnd()<0.25){ evs.push({t:ri(Math.floor(total*0.55),total-120), type:'leave', pid:pick(ids)}); }
  // injury — either short knock or out for the rest of the game
  if(rnd()<0.30){ const dur=rnd()<0.5?ri(90,300):0; evs.push({t:ri(120,total-180), type:'injury', pid:pick(ids), dur}); }
  // second injury occasionally
  if(rnd()<0.08){ evs.push({t:ri(120,total-120), type:'injury', pid:pick(ids), dur:ri(60,240)}); }
  // toilet break / boot lace / tears — brief
  if(rnd()<0.35){ evs.push({t:ri(60,total-120), type:'toilet', pid:pick(ids), dur:ri(45,150)}); }
  // sin bin (rare at this age but happens)
  if(rnd()<0.10){ evs.push({t:ri(120,total-120), type:'sinbin', pid:pick(ids), dur:120}); }
  return evs;
}

const results=[]; const failures=[];
for(let i=0;i<N;i++){
  const n=ri(5,10);
  const profile=pick(['flat','mixed','oneStar','narrow']);
  const ps=makeSquad(n,profile);
  const halfMin=pick([10,12,15,20]);
  const cfg={
    players:ps, formation:pick(['2-2','3-1','1-3']), halfMin,
    shiftSec:pick([90,120,180,240]), gkSec:pick([180,300,420]),
    minF:pick([0,0,2]), bias:pick([0,0.25,0.5,0.75,1]),
    seed:i+1,
    coachSkill:pick([1.0,0.9,0.75,0.5,0.3]),   // distracted-coach spectrum
    reactionLo:0, reactionHi:pick([0,20,45,90]),
    events:makeEvents(ps,halfMin),
  };
  let m,threw=null;
  try{ m=playMatch(cfg); }catch(e){ threw=String(e&&e.stack||e).split('\n')[0]; }
  const issues=[];
  if(threw) issues.push('THREW: '+threw);
  else {
    // ---- HARD INVARIANTS ----
    if(!Number.isFinite(m.fairPct)) issues.push('fairPct NaN');
    if(m.slotViol>0) issues.push(`short-handed ${m.slotViol}s while enough players available`);
    // A breach is only an ENGINE fault if it outlasts the coach's own reaction window; anything inside that
    // is the coach walking to the bench, which the app can't control. Track the rest as a real-world stat.
    const grace=cfg.reactionHi+30;
    if(m.minFViol>grace && cfg.coachSkill===1) issues.push(`below min-female ${m.minFViol}s despite an attentive coach (grace ${grace}s)`);
    if(m.optOutGoalTime>0) issues.push(`opted-out player spent ${m.optOutGoalTime}s in goal`);
    Object.entries(m._st).forEach(([id,s])=>{
      if(s.sec<0||!Number.isFinite(s.sec)) issues.push('bad sec for '+id);
      const zs=s.z.goal+s.z.def+s.z.att;
      if(Math.abs(s.sec-zs)>2) issues.push(`zone mismatch p${id}: ${s.sec} vs ${zs}`);
      if(s.sec>halfMin*120+2) issues.push(`p${id} played ${s.sec}s > game length`);
    });
  }
  const rec={i, n, profile, halfMin, formation:cfg.formation, bias:cfg.bias,
    coachSkill:cfg.coachSkill, reactionHi:cfg.reactionHi, events:cfg.events.length,
    m, issues};
  results.push(rec);
  if(issues.length) failures.push(rec);
}

const ok=results.filter(r=>!r.issues.length);
console.log(`=== REAL-WORLD STRESS TEST: ${N} matches ===\n`);
console.log(`Invariants held: ${ok.length}/${N}`);
if(failures.length){
  console.log(`\n!! ${failures.length} FAILURES (first 15):`);
  failures.slice(0,15).forEach(f=>console.log(`  #${f.i} n=${f.n} ${f.formation} ${f.profile} half=${f.halfMin} bias=${f.bias} coach=${f.coachSkill} -> ${f.issues.join('; ')}`));
}

// quality summary over the successful runs
function summ(label, rows){
  if(!rows.length) return;
  const avg=f=>rows.reduce((a,r)=>a+f(r),0)/rows.length;
  const pct=v=>(v*100).toFixed(1)+'%';
  console.log(`  ${label.padEnd(22)} n=${String(rows.length).padStart(4)}  fairness ${pct(avg(r=>r.m.fairPct)).padStart(7)}   prompts ${avg(r=>r.m.prompts).toFixed(1).padStart(5)}  actioned ${pct(avg(r=>r.m.prompts?r.m.promptsActioned/r.m.prompts:1)).padStart(7)}  late ${avg(r=>r.m.avgLate).toFixed(0).padStart(3)}s  worst-run ${Math.round(Math.max(...rows.map(r=>r.m.maxOnCourt))/60)}m`);
}
console.log('\n--- fairness & engine-vs-actual by squad size ---');
for(const n of [5,6,7,8,9,10]) summ('squad '+n, ok.filter(r=>r.n===n));
console.log('\n--- by coach reliability (how often prompts get actioned) ---');
for(const c of [1.0,0.9,0.75,0.5,0.3]) summ('coachSkill '+c, ok.filter(r=>r.coachSkill===c));
console.log('\n--- by win/equal slider ---');
for(const b of [0,0.25,0.5,0.75,1]) summ('bias '+b, ok.filter(r=>r.bias===b));
console.log('\n--- by disruption load ---');
summ('no events', ok.filter(r=>r.events===0));
summ('1 event', ok.filter(r=>r.events===1));
summ('2+ events', ok.filter(r=>r.events>=2));

const withInj=ok.filter(r=>r.m.issues.some(x=>/injured/.test(x)));
const withLate=ok.filter(r=>r.m.issues.some(x=>/arrived late/.test(x)));
const withLeave=ok.filter(r=>r.m.issues.some(x=>/left early/.test(x)));
console.log('\n--- specific real-world situations ---');
summ('with an injury', withInj);
summ('with a late arrival', withLate);
summ('with an early leaver', withLeave);
summ('5-player squad', ok.filter(r=>r.n===5));

const worst=[...ok].sort((a,b)=>b.m.fairPct-a.m.fairPct).slice(0,5);
console.log('\n--- worst fairness outcomes (for inspection) ---');
worst.forEach(r=>console.log(`  #${r.i} n=${r.n} ${r.formation} half=${r.halfMin} bias=${r.bias} coach=${r.coachSkill} fairness ${(r.m.fairPct*100).toFixed(0)}%  [${r.m.issues.join(' | ')||'no events'}]`));

if(failures.length) process.exit(1);
