import { chromium, APP_URL } from './_boot.mjs';
const b=await chromium.launch();
const ctx=await b.newContext();
await ctx.grantPermissions(['clipboard-read','clipboard-write']);
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push('con:'+m.text());});
await p.clock.install();
await p.goto(APP_URL); await p.waitForTimeout(150);
await p.click('#clockBtn'); await p.waitForTimeout(20); await p.click('#clockBtn'); await p.waitForTimeout(30); // force a save
await p.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1')); s.formation='2-2'; s.halfLen=6; s.shiftT=90; localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(150);
// open Plan then close → creates + activates the plan (the projection the engine recommends from)
await p.click('#planBtn'); await p.waitForTimeout(200); await p.click('#stratScrim .sheet-x'); await p.waitForTimeout(120);

let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' — '+x));};

await p.click('#clockBtn'); await p.waitForTimeout(30);
let followed=0, manual=0;
for(let step=0; step<10; step++){
  await p.clock.runFor(45000); await p.waitForTimeout(25);
  // is a change due? accept it on even steps (follow the engine), ignore on odd
  const hasDue=await p.evaluate(()=>!!document.querySelector('.due-now[data-id]'));
  if(hasDue && step%2===0){
    const did=await p.evaluate(()=>{
      const due=document.querySelector('.due-now[data-id]'); if(!due) return false;
      due.click();
      const pill=[...document.querySelectorAll('#benchGrid [data-id]')].find(el=>/⇄/.test(el.innerHTML))
               ||[...document.querySelectorAll('#benchGrid [data-id]')][0];
      if(pill){ pill.click(); return true; }
      return false;
    });
    if(did) followed++;
    await p.waitForTimeout(25);
  } else if(step%3===0){
    // manual off-plan sub: swap two on-court players
    const did=await p.evaluate(()=>{
      const cards=[...document.querySelectorAll('#courtList [data-id], #rink [data-id]')];
      if(cards.length<2) return false;
      cards[0].click(); cards[1].click(); return true;
    });
    if(did) manual++;
    await p.waitForTimeout(25);
  }
}
await p.waitForTimeout(100);
const S=await p.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')));
ok('no JS errors', errs.length===0, errs.slice(0,3).join('|'));
ok('recLog captured prompts', (S.recLog||[]).length>0, 'recLog='+(S.recLog||[]).length);
const changes=S.events.filter(e=>e.type==='sub'||e.type==='swap');
ok('actual changes recorded', changes.length>0, 'changes='+changes.length);
ok('every change has follow tag', changes.every(e=>e.follow), JSON.stringify(changes.map(e=>e.follow)));
// export
await p.click('#planBtn'); await p.waitForTimeout(200);
await p.click('#stratGame'); await p.waitForTimeout(150);
const clip=await p.evaluate(async()=>{ try{return await navigator.clipboard.readText();}catch(e){return 'ERR:'+e;} });
let J=null; try{J=JSON.parse(clip);}catch(e){}
ok('export parses', !!J, (clip||'').slice(0,80));
if(J){
  ok('recommendations[] populated', (J.recommendations||[]).length>0, 'len='+(J.recommendations||[]).length);
  ok('engineVsActual summary present', !!J.engineVsActual);
  ok('subs carry vsEngine', (J.subs||[]).every(s=>s.vsEngine));
  ok('some prompt actioned or lapsed tracked', (J.engineVsActual.promptsShown)>0);
  console.log('    engineVsActual:', JSON.stringify(J.engineVsActual));
  console.log('    rec[0]:', JSON.stringify(J.recommendations[0]));
  const fol=J.subs.find(s=>s.vsEngine!=='off-plan'); console.log('    followed sub:', JSON.stringify(fol||'(none)'));
  console.log('    drive: followed='+followed+' manual='+manual);
}
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
await b.close(); if(fail)process.exit(1);
