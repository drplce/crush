import { chromium, APP_URL } from './_boot.mjs';
const b=await chromium.launch();
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' — '+x));};

async function fresh(cfg={}){
  const ctx=await b.newContext(); const p=await ctx.newPage(); await p.clock.install();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push('con:'+m.text());});
  await p.goto(APP_URL); await p.waitForTimeout(150);
  await p.click('#clockBtn'); await p.waitForTimeout(20); await p.click('#clockBtn'); await p.waitForTimeout(30);
  await p.evaluate(c=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
    s.halfLen=c.halfLen||15; s.shiftT=c.shiftT||180; s.gkT=c.gkT||300; s.formation=c.formation||'3-1';
    localStorage.setItem('goalGirls.v1',JSON.stringify(s)); }, cfg);
  await p.reload(); await p.waitForTimeout(150);
  return {ctx,p,errs};
}

// ---- FIX 3: prompts without ever opening Plan ----
console.log('\n[FIX 3] Prompts appear without opening the Plan screen');
{
  const {ctx,p,errs}=await fresh();
  await p.click('#clockBtn'); await p.waitForTimeout(40);
  const act=await p.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).activeStrat);
  ok('plan auto-activated on kickoff', act!=null, 'activeStrat='+act);
  await p.clock.runFor(8*60*1000); await p.waitForTimeout(60);
  const pills=await p.evaluate(()=>[...document.querySelectorAll('.pill.off')].filter(e=>e.getClientRects().length).length);
  ok('sub prompts render without opening Plan', pills>0, 'pills='+pills);
  ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
  await ctx.close();
}

// ---- FIX 1: a player cycling court->goal->court gets a rest flag ----
console.log('\n[FIX 1] "Never actually sat down" surfaces (Summer case)');
{
  const {ctx,p,errs}=await fresh();
  await p.click('#clockBtn'); await p.waitForTimeout(40);
  // Keep ONE player permanently on court, cycling her through goal like Summer. Ignore all prompts.
  // Player index 0 = the F1 starter; we never sub her.
  let flaggedAt=null;
  const target=await p.evaluate(()=>{ const S=JSON.parse(localStorage.getItem('goalGirls.v1')); const on=S.players.filter(x=>x.pos); return on[on.length-1].id; });
  for(let m=1;m<=14;m++){
    await p.clock.runFor(60*1000); await p.waitForTimeout(25);
    // at minute 6, rotate her into goal (mimics Summer's keeper spell) — engine treats goal as rest
    if(m===6) await p.evaluate(id=>{ const S=JSON.parse(localStorage.getItem('goalGirls.v1'));
      const me=S.players.find(x=>x.id===id), gk=S.players.find(x=>x.pos==='GK');
      if(me&&gk&&me.id!==gk.id){ const t=me.pos; me.pos=gk.pos; gk.pos=t; localStorage.setItem('goalGirls.v1',JSON.stringify(S)); }
    }, target).catch(()=>{});
    const st=await p.evaluate(id=>{
      const S=JSON.parse(localStorage.getItem('goalGirls.v1')); const me=S.players.find(x=>x.id===id);
      const el=document.querySelector(`[data-id="${id}"]`);
      return {ctSec:me.ctSec, pos:me.pos, due: el? /⇄/.test(el.innerHTML) : false};
    }, target);
    if(st.due && flaggedAt===null) flaggedAt=m;
  }
  const fin=await p.evaluate(id=>{const S=JSON.parse(localStorage.getItem('goalGirls.v1')); const me=S.players.find(x=>x.id===id); return {ctSec:me.ctSec,pos:me.pos};}, target);
  ok('ctSec accrues unbroken across a goal spell', fin.ctSec>=600, 'ctSec='+fin.ctSec);
  ok('long-on-court player gets flagged to come off', flaggedAt!==null, 'never flagged in 14 min');
  if(flaggedAt) console.log('    first flagged at minute '+flaggedAt+' (ctSec grew to '+fin.ctSec+'s)');
  ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
  await ctx.close();
}

// ---- FIX 2: keeper stint does not straddle half-time ----
console.log('\n[FIX 2] Keeper goal-stint carries across half-time');
{
  const {ctx,p,errs}=await fresh({halfLen:6, gkT:300});
  await p.click('#clockBtn'); await p.waitForTimeout(40);
  // run to 4:00 of H1 then put a fresh keeper in, so at the break they've done ~2:00 of a 5:00 interval
  await p.clock.runFor(4*60*1000); await p.waitForTimeout(30);
  await p.clock.runFor(2*60*1000+5000); await p.waitForTimeout(50); // reach half target
  // end the half: pause first (End button only shows when paused), then tap End
  await p.click('#clockBtn'); await p.waitForTimeout(60);
  await p.evaluate(()=>{ const w=document.querySelector('#clockExp'); if(w) w.hidden=false; });
  await p.click('#clockEnd'); await p.waitForTimeout(60); await p.click('#clockEnd'); // two-tap confirm
  await p.waitForTimeout(60);
  const S=await p.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')));
  const gk=S.players.find(x=>x.pos==='GK');
  ok('half ended', S.half===2||S.phase==='h2', 'phase='+S.phase);
  ok('keeper posSec preserved across the break', gk && gk.posSec>0, gk?('posSec='+gk.posSec):'no GK');
  ok('outfielders reset at the break', S.players.filter(x=>x.pos&&x.pos!=='GK').every(x=>x.posSec===0));
  ok('everyone ctSec cleared at the break', S.players.every(x=>x.ctSec===0));
  ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
  await ctx.close();
}
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
await b.close(); if(fail)process.exit(1);
