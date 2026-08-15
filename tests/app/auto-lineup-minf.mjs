import { chromium, APP_URL } from './_boot.mjs';
const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(APP_URL); await p.waitForTimeout(150);
await p.click('#clockBtn'); await p.waitForTimeout(20); await p.click('#clockBtn'); await p.waitForTimeout(30);
// 6 players, 3 female, minF=3 -> a rating-only auto pick would field just 2 females
await p.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
  s.players=s.players.slice(0,6); s.formation='3-1'; s.minF=3; s.halfLen=15;
  s.players.forEach((pl,i)=>{ pl.sex=(i%5<2||i===5)?'f':'m'; pl.gkOK=true; pl.pos=null;
    pl.rat={att:i<3?5:2, def:i<3?5:2, gk:3, fit:3}; });   // the 3 males rated LOW, females high? no: make males highest
  // males (idx 2,3,4) get the top ratings so a pure-rating pick would choose them
  s.players.forEach((pl,i)=>{ if(pl.sex==='m') pl.rat={att:5,def:5,gk:5,fit:3}; else pl.rat={att:1,def:1,gk:1,fit:3}; });
  ['GK','D1','F1','F2','F3'].forEach((k,i)=>{ s.players[i].pos=k; });
  s.strategies=[]; s.activeStrat=null;
  localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(180);
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' — '+x));};
const fem=await p.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).players.filter(x=>x.sex==='f').length);
ok('setup: 3 females, minF=3, males rated highest', fem===3, 'females='+fem);
await p.click('#planBtn'); await p.waitForTimeout(250);
// tap "Auto by rating" — must still satisfy the floor
await p.evaluate(()=>{ const b=[...document.querySelectorAll('#stratScrim button')].find(x=>/auto by rating/i.test(x.textContent)); if(b)b.click(); });
await p.waitForTimeout(250);
const res=await p.evaluate(()=>{
  const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
  const st=s.strategies[0]?.starters||{};
  const ids=Object.values(st);
  const femOn=ids.map(id=>s.players.find(x=>x.id===id)).filter(x=>x&&x.sex==='f').length;
  const line=(document.querySelector('#stratScrim').innerText.split('\n').find(l=>/^Start/.test(l.trim()))||'').trim();
  return {femOn, count:ids.length, line};
});
console.log('    '+res.line);
ok('auto line-up fields 5', res.count===5, 'count='+res.count);
ok('auto line-up honours the ♀ floor (3 of 5)', res.femOn>=3, 'females on court='+res.femOn);
ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
await b.close(); if(fail)process.exit(1);
