// Randomized fuzz: thousands of random configs, same hard invariants as edge.mjs.
// Deterministic PRNG (seeded) so any failure is reproducible.
import { playGame } from './subsim.mjs';
import { mkV2 } from './engine.mjs';

const rule=mkV2(0.25,1.0), SLOTS=5;
const N=+(process.argv[2]||3000);
let seed=1234567;
const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
const pick=a=>a[Math.floor(rnd()*a.length)];
const ri=(lo,hi)=>lo+Math.floor(rnd()*(hi-lo+1));

function mkCfg(){
  const n=ri(4,14);
  const fem=ri(0,n);
  const sexes=[...Array(fem).fill('f'),...Array(n-fem).fill('m')];
  const players=sexes.map((s,i)=>({id:i,name:'P'+i,sex:s,rat:{att:ri(1,5),def:ri(1,5),gk:ri(1,5),fit:ri(1,5)}}));
  return {
    players, formation:pick(['2-2','3-1','1-3']),
    halfMin:pick([1,5,10,16,20,25,30,45]),
    shiftSec:pick([20,45,60,90,120,180,300,600]),
    gkSec:pick([0,45,120,180,300,600]),
    minF:ri(0,4),
    bias:pick([0,0.25,0.5,0.75,1]),
    missRate:pick([0,0,0,0.25,0.5,0.9,1.0]),
  };
}

let pass=0; const fails=[];
for(let i=0;i<N;i++){
  const cfg=mkCfg();
  let m, threw=null;
  try{ m=playGame(cfg, rule); }catch(e){ threw=String(e&&e.stack||e).split('\n')[0]; }
  const issues=[];
  if(threw){ issues.push('THREW: '+threw); }
  else {
    const n=cfg.players.length, expectSlots=Math.min(n,SLOTS), totalGame=cfg.halfMin*60*2;
    for(const k of ['fairPct','maxRun','roleSpread','goalSpread','winAvg']) if(!Number.isFinite(m[k])) issues.push(`NaN ${k}`);
    const sumSec=m._secs.reduce((a,x)=>a+x,0), expected=totalGame*expectSlots;
    if(!(Math.abs(sumSec-expected)<=totalGame*0.02 || n<SLOTS)) issues.push(`leak sum=${sumSec} exp≈${expected}`);
    if(m._secs.some(x=>x<0)) issues.push('neg sec');
    if(n>=SLOTS && m.slotViol>0) issues.push(`slotViol=${m.slotViol}`);
    const femCount=cfg.players.filter(p=>p.sex==='f').length;
    const feasible=femCount>=cfg.minF && cfg.minF<=SLOTS;
    if(feasible && m.minFViol>0) issues.push(`minFViol=${m.minFViol} feasible(fem=${femCount},minF=${cfg.minF})`);
    if(m.maxRun>totalGame) issues.push(`maxRun>${totalGame}`);
  }
  if(issues.length){ fails.push({i, cfg:summarize(cfg), issues}); } else pass++;
}
function summarize(c){ return `${c.formation} n=${c.players.length} fem=${c.players.filter(p=>p.sex==='f').length} half=${c.halfMin} shift=${c.shiftSec} gk=${c.gkSec} minF=${c.minF} bias=${c.bias} miss=${c.missRate}`; }

console.log(`=== Fuzz: ${N} random games (seed 1234567) ===`);
console.log(`${pass}/${N} hold all invariants.`);
if(fails.length){
  console.log(`\n${fails.length} FAILURES (first 25):`);
  fails.slice(0,25).forEach(f=>console.log(` ✗ #${f.i} [${f.cfg}]  ${f.issues.join('; ')}`));
  process.exit(1);
} else {
  console.log('No invariant violations across the entire fuzz run.');
}
