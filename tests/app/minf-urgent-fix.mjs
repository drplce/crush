import { chromium, APP_URL } from './_boot.mjs';
const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.clock.install();
await p.goto(APP_URL); await p.waitForTimeout(150);
await p.click('#clockBtn'); await p.waitForTimeout(20); await p.click('#clockBtn'); await p.waitForTimeout(30);
// 8 players, minF=2, long shift (300s) so the OLD behaviour would wait ages for the fix
await p.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
  s.halfLen=15; s.shiftT=300; s.gkT=300; s.formation='3-1'; s.minF=2;
  s.players=s.players.slice(0,8);
  // 3 females, 5 males. Put 2 females on court initially.
  s.players.forEach((pl,i)=>{ pl.sex = i<3?'f':'m'; pl.gkOK=true; pl.ctSec=0; pl.sec=0; pl.zone={goal:0,def:0,mid:0,att:0}; pl.pos=null; });
  ['GK','D1','F1','F2','F3'].forEach((k,i)=>{ s.players[i].pos=k; });  // players 0,1,2 = the 3 females on court
  localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(150);
await p.click('#planBtn'); await p.waitForTimeout(200); await p.click('#stratScrim .sheet-x'); await p.waitForTimeout(100);
await p.click('#clockBtn'); await p.waitForTimeout(40);
await p.clock.runFor(60000); await p.waitForTimeout(50);
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' — '+x));};
// now BREAK the female floor: swap two on-court females for bench males (simulating injuries/manual moves)
await p.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
  const fem=s.players.filter(x=>x.sex==='f'&&x.pos);
  const males=s.players.filter(x=>x.sex==='m'&&!x.pos);
  // take 2 females off, put 2 males on -> only 1 female left on court (below minF=2)
  for(let i=0;i<2;i++){ const f=fem[i], m=males[i]; m.pos=f.pos; f.pos=null; f.restSec=60; }
  localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(200);
await p.click('#clockBtn'); await p.waitForTimeout(60);   // resume
const femOn=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('goalGirls.v1'));return s.players.filter(x=>x.pos&&x.sex==='f').length;});
ok('setup: below the female floor', femOn<2, 'femOn='+femOn);
// warning banner should show
const warn=await p.evaluate(()=>{const w=document.querySelector('#courtWarn'); return w&&!w.hidden?w.textContent:'';});
ok('warning banner shows', /need/i.test(warn), warn||'(none)');
// KEY: an actionable sub prompt should appear IMMEDIATELY, not after the 300s shift
await p.clock.runFor(8000); await p.waitForTimeout(80);
const pills=await p.evaluate(()=>[...document.querySelectorAll('.pill.off')].filter(e=>e.getClientRects().length).map(e=>e.textContent.trim()));
ok('immediate sub prompt to restore the floor (not waiting 5 min)', pills.length>0, 'no prompt after 8s');
if(pills.length) console.log('    prompt: '+pills[0]);
ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
await b.close(); if(fail)process.exit(1);
