// Verify the "won't play goal" opt-out: the flagged player must accrue ZERO goal time
// yet still receive ~equal TOTAL time (filled with outfield minutes).
import { playGame } from './subsim.mjs';
import { mkV2 } from './engine.mjs';
const rule=mkV2(0.25,1.0);

function players(n, noGoalIds=[]){
  const ps=[];
  for(let i=0;i<n;i++){ ps.push({id:i,name:String.fromCharCode(65+i),sex:i%5<2?'f':'m',
    rat:{att:1+((i*3)%5),def:1+((i*7)%5),gk:1+((i*5)%5),fit:1+((i*2)%5)}, gkOK:!noGoalIds.includes(i)}); }
  return ps;
}

function run(label, cfg){
  const m=playGame(cfg, rule);
  const goalById={}; m._players.forEach(p=>goalById[p.id]=m._z[p.id].goal);
  const totalById={}; m._players.forEach(p=>totalById[p.id]=m._st[p.id]);
  return {m, goalById, totalById};
}

let pass=0, fail=0; const notes=[];
function check(name, cond, detail){ if(cond){pass++; console.log('  ✓ '+name);} else {fail++; console.log('  ✗ '+name+' — '+detail);} }

for(const [n,formation,half] of [[8,'2-2',25],[7,'3-1',20],[9,'1-3',30],[6,'2-2',20]]){
  const noGoal=0; // player A opts out
  const cfg={players:players(n,[noGoal]), formation, halfMin:half, shiftSec:90, gkSec:300, minF:0, bias:0.5};
  const {m, goalById, totalById}=run('', cfg);
  console.log(`\n[${formation} n=${n} half=${half}m] player A = won't play goal`);
  // 1. flagged player gets ZERO goal time
  check('flagged player has 0 goal time', goalById[noGoal]===0, `goal=${goalById[noGoal]}s`);
  // 2. someone else absorbed the keeping (goal time exists for others)
  const othersGoal=Object.entries(goalById).filter(([id])=>+id!==noGoal).reduce((a,[,g])=>a+g,0);
  check('other players still cover goal', othersGoal>0, `others goal sum=${othersGoal}`);
  // 3. flagged player still gets ~equal TOTAL time (within fair band)
  const totalGame=half*60*2, fair=totalGame*5/n;
  const flaggedTotal=totalById[noGoal];
  const pct=Math.abs(flaggedTotal-fair)/fair;
  check('flagged player total ≈ fair share', pct<=0.15, `total=${Math.round(flaggedTotal)}s fair=${Math.round(fair)}s (${(pct*100).toFixed(0)}% off)`);
  console.log(`    A: total ${Math.round(flaggedTotal)}s (fair ${Math.round(fair)}s), goal ${goalById[noGoal]}s`);
}

// control: WITHOUT the flag, player A does get some goal time (proves the flag is what suppresses it)
console.log('\n[control] no opt-out — player A should get some goal time');
const ctrl=run('', {players:players(8,[]), formation:'2-2', halfMin:25, shiftSec:90, gkSec:300, minF:0, bias:0.5});
check('unflagged player A gets goal time', ctrl.goalById[0]>0, `goal=${ctrl.goalById[0]}s`);

console.log(`\n===== goalie opt-out: ${pass} passed, ${fail} failed =====`);
if(fail) process.exit(1);
