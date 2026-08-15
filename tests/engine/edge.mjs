// Edge-case battery: ~100 deliberately nasty scenarios against the engine model.
// Each game is checked against hard INVARIANTS (things that must NEVER break),
// plus soft QUALITY flags (things that are allowed but worth knowing).
import { FORMATIONS, playGame } from './subsim.mjs';
import { mkV2 } from './engine.mjs';

const rule=mkV2(0.25,1.0);
const SLOTS=5;

// flexible player builder: sexes = array like ['f','f','m',...]; rats = fn(i)->{att,def,gk,fit}
function mkPlayers(sexes, rats){
  return sexes.map((s,i)=>({id:i,name:String.fromCharCode(65+i),sex:s,rat:rats?rats(i):{att:3,def:3,gk:3,fit:3}}));
}
const rep=(x,n)=>Array.from({length:n},()=>x);
const mix=(f,m)=>[...rep('f',f),...rep('m',m)];
const flat=()=>({att:3,def:3,gk:3,fit:3});
const varied=i=>({att:1+((i*3)%5),def:1+((i*7)%5),gk:1+((i*5)%5),fit:1+((i*2)%5)});
const oneStar=i=>i===0?{att:5,def:5,gk:5,fit:5}:{att:2,def:2,gk:2,fit:2};
const oneGK=i=>i===0?{att:2,def:2,gk:5,fit:2}:{att:3,def:3,gk:1,fit:3};
const noGK=()=>({att:3,def:3,gk:1,fit:3});

// ---- build scenario list ----
const scen=[];
const add=(name,cfg,opts={})=>scen.push({name,cfg,opts});

// Degenerate squad sizes
add('exactly 5 (no bench)', {players:mkPlayers(mix(2,3),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:0});
add('5 players minF=2 (1 fem only)', {players:mkPlayers(mix(1,4),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:2}, {minFfeasible:false});
add('4 players (short-handed)', {players:mkPlayers(mix(2,2),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:0}, {shortHanded:true});
add('6 players (1 sub)', {players:mkPlayers(mix(2,4),varied), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:2});
add('huge squad 12', {players:mkPlayers(mix(5,7),varied), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2});
add('huge squad 14', {players:mkPlayers(mix(6,8),varied), formation:'3-1', halfMin:25, shiftSec:120, gkSec:300, minF:2});

// Constraint feasibility extremes
add('all-male minF=2 (infeasible)', {players:mkPlayers(rep('m',8),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:2}, {minFfeasible:false});
add('all-female minF=0', {players:mkPlayers(rep('f',8),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:0});
add('all-female minF=4', {players:mkPlayers(rep('f',8),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:4});
add('minF=4 with exactly 4 fem', {players:mkPlayers(mix(4,4),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:4});
add('minF=4 with 3 fem (infeasible)', {players:mkPlayers(mix(3,5),flat), formation:'2-2', halfMin:20, shiftSec:90, gkSec:300, minF:4}, {minFfeasible:false});

// Rating skew
add('one superstar, bias=1', {players:mkPlayers(mix(3,5),oneStar), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, bias:1}, {starHog:true});
add('one superstar, bias=0', {players:mkPlayers(mix(3,5),oneStar), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, bias:0});
add('one elite GK, bias=1', {players:mkPlayers(mix(3,5),oneGK), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, bias:1});
add('no good GK anywhere', {players:mkPlayers(mix(3,5),noGK), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, bias:0.5});
add('all identical ratings', {players:mkPlayers(mix(3,5),flat), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, bias:0.5});

// Clock / shift extremes
add('ultra-short half 1min', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:1, shiftSec:90, gkSec:300, minF:2});
add('very long half 45min', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:45, shiftSec:120, gkSec:300, minF:2});
add('hyper shift 20s', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:20, shiftSec:20, gkSec:300, minF:2}, {thrashRisk:true});
add('rare shift 600s', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:25, shiftSec:600, gkSec:300, minF:2}, {longRunRisk:true});
add('keeper never rotates (gk=0)', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:25, shiftSec:90, gkSec:0, minF:2}, {gkStuck:true});
add('keeper churns (gk=45s)', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:20, shiftSec:90, gkSec:45, minF:2});

// Coach ignores prompts (missed subs)
add('50% missed subs', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, missRate:0.5});
add('90% missed subs', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, missRate:0.9});
add('100% missed subs (never sub)', {players:mkPlayers(mix(3,5),varied), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:2, missRate:1.0}, {noSubs:true});

// Cross-product sweep of the hard axes → fills out to ~100
const FORMS=['2-2','3-1','1-3'];
const NS=[6,7,8,9,10];
const BIAS=[0,0.5,1];
let cid=0;
for(const f of FORMS) for(const n of NS) for(const b of BIAS){
  cid++;
  const fem=Math.max(2,Math.floor(n*0.4));
  add(`sweep ${f} n=${n} bias=${b}`, {players:mkPlayers(mix(fem,n-fem),varied), formation:f, halfMin:20, shiftSec:90, gkSec:300, minF:2, bias:b});
}

// ---- run + check invariants ----
function check(s){
  const cfg={bias:0.5, missRate:0, ...s.cfg};
  let m, threw=null;
  try{ m=playGame(cfg, rule); }catch(e){ threw=String(e&&e.stack||e); }
  const issues=[], flags=[];
  if(threw){ issues.push('THREW: '+threw.split('\n')[0]); return {name:s.name, ok:false, issues, flags, m:null}; }

  const n=cfg.players.length, expectSlots=Math.min(n,SLOTS);
  // 1. no NaN anywhere
  for(const k of ['fair','spread','rmse','fairPct','maxRun','roleSpread','goalSpread','genderGap','winAvg']){
    if(!Number.isFinite(m[k])) issues.push(`NaN/Inf ${k}=${m[k]}`);
  }
  // 2. court-time conservation: sum of on-court seconds == totalGame * slotsFielded
  const totalGame=cfg.halfMin*60*2;
  const sumSec=m._secs.reduce((a,x)=>a+x,0);
  const expected=totalGame*expectSlots;
  // when short-handed, slotViol accrues and fielded<SLOTS; allow either exact match or bounded by full
  const consvOK = Math.abs(sumSec-expected) <= totalGame*0.02 || (n<SLOTS);
  if(!consvOK) issues.push(`court-time leak: sum=${sumSec} expected≈${expected}`);
  // 3. per-player zone accounting: sec == goal+def+att
  m._players.forEach(p=>{ const z=m._z[p.id]; const zs=z.goal+z.def+z.att; if(Math.abs(m._st[p.id]-zs)>2) issues.push(`zone mismatch ${p.name}: sec=${m._st[p.id]} zsum=${zs}`); });
  // 4. no negative time
  if(m._secs.some(x=>x<0)) issues.push('negative seconds');
  // 5. always field 5 (unless short-handed squad<5)
  if(n>=SLOTS && m.slotViol>0) issues.push(`slotViol=${m.slotViol} (dropped below 5 on court)`);
  // 6. minF respected when feasible
  const femCount=cfg.players.filter(p=>p.sex==='f').length;
  const minFfeasible = s.opts.minFfeasible!==false && femCount>=cfg.minF && cfg.minF<=SLOTS;
  if(minFfeasible && m.minFViol>0) issues.push(`minFViol=${m.minFViol} despite feasible (fem=${femCount}, minF=${cfg.minF})`);
  // 7. maxRun sanity: no continuous run longer than the whole game
  if(m.maxRun>totalGame) issues.push(`maxRun ${m.maxRun}>totalGame ${totalGame}`);

  // soft flags
  if(s.opts.noSubs && m.thrash>0) flags.push('thrash despite noSubs?');
  if(m.thrash>0) flags.push(`thrash=${m.thrash}`);
  if(m.fairPct>0.15) flags.push(`fairness loose ${(m.fairPct*100).toFixed(0)}%`);
  if(m.maxRun>cfg.shiftSec*4) flags.push(`maxRun ${m.maxRun}s (>${cfg.shiftSec*4})`);
  if(m.minFViol>0 && !minFfeasible) flags.push(`minF broken but infeasible (expected)`);
  if(s.opts.starHog) flags.push(`star share vs others: fairPct=${(m.fairPct*100).toFixed(0)}%`);

  return {name:s.name, ok:issues.length===0, issues, flags, m};
}

console.log(`=== Edge battery: ${scen.length} scenarios ===\n`);
let pass=0, failN=0; const failed=[]; const flagged=[];
for(const s of scen){ const r=check(s); if(r.ok){pass++;} else {failN++; failed.push(r);}
  if(r.flags.length) flagged.push({name:r.name, flags:r.flags});
  console.log(`${r.ok?'✓':'✗'} ${r.name}${r.issues.length?'  !! '+r.issues.join('; '):''}`);
}
console.log(`\n${pass}/${scen.length} scenarios hold all invariants.`);
if(failed.length){ console.log('\nINVARIANT FAILURES:'); failed.forEach(f=>console.log(' ✗ '+f.name+': '+f.issues.join('; '))); }
console.log('\nQUALITY FLAGS (allowed, informational):');
flagged.forEach(f=>console.log(' • '+f.name+': '+f.flags.join(', ')));
if(failed.length) process.exit(1);
