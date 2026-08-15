import { chromium, APP_URL } from './_boot.mjs';
const b=await chromium.launch();
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' — '+x));};
async function setup(mut){
  const ctx=await b.newContext(); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push('con:'+m.text());});
  await p.goto(APP_URL); await p.waitForTimeout(150);
  await p.click('#clockBtn'); await p.waitForTimeout(20); await p.click('#clockBtn'); await p.waitForTimeout(30);
  await p.evaluate(mut); await p.reload(); await p.waitForTimeout(180);
  return {ctx,p,errs};
}
console.log('[A] All-girls team — ♀ rule should vanish');
{
  const {ctx,p,errs}=await setup(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
    s.players=s.players.slice(0,7); s.players.forEach(pl=>{pl.sex='f';}); s.minF=2;
    localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
  await p.click('#editBtn'); await p.waitForTimeout(200);
  ok('Min-F setting hidden for all-girls squad', await p.evaluate(()=>document.querySelector('#minFField').hidden===true));
  await p.click('#rosterScrim .sheet-x'); await p.waitForTimeout(120);
  ok('no pink/blue sex dots on home', await p.evaluate(()=>document.querySelectorAll('.sexdot').length===0));
  await p.click('#planBtn'); await p.waitForTimeout(250);
  const txt=await p.evaluate(()=>document.querySelector('#stratScrim').innerText);
  ok('plan does not mention a female minimum', !/min \d+ female/i.test(txt), txt.slice(0,120));
  ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
  await ctx.close();
}
console.log('\n[B] All-boys team');
{
  const {ctx,p,errs}=await setup(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
    s.players=s.players.slice(0,7); s.players.forEach(pl=>{pl.sex='m';}); s.minF=2;
    localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
  await p.click('#editBtn'); await p.waitForTimeout(200);
  ok('Min-F hidden for all-boys squad', await p.evaluate(()=>document.querySelector('#minFField').hidden===true));
  await p.click('#rosterScrim .sheet-x'); await p.waitForTimeout(120);
  ok('no court warning banner', await p.evaluate(()=>{const w=document.querySelector('#courtWarn'); return !w||w.hidden;}));
  ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
  await ctx.close();
}
console.log('\n[C] Mixed team — rule still applies');
{
  const {ctx,p,errs}=await setup(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
    s.players=s.players.slice(0,7); s.players.forEach((pl,i)=>{pl.sex=i<3?'f':'m';}); s.minF=2;
    localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
  await p.click('#editBtn'); await p.waitForTimeout(200);
  ok('Min-F setting visible for mixed squad', await p.evaluate(()=>document.querySelector('#minFField').hidden===false));
  await p.click('#rosterScrim .sheet-x'); await p.waitForTimeout(120);
  ok('sex dots shown on home', await p.evaluate(()=>document.querySelectorAll('.sexdot').length>0));
  ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
  await ctx.close();
}
console.log('\n[D] Suggested shift & keeper in Plan');
{
  const {ctx,p,errs}=await setup(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
    s.players=s.players.slice(0,7); s.players.forEach(pl=>{pl.sex='f';});
    s.halfLen=15; s.shiftT=180; s.gkT=300; s.strategies=[]; s.activeStrat=null;
    localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
  await p.click('#planBtn'); await p.waitForTimeout(280);
  const txt=await p.evaluate(()=>document.querySelector('#stratScrim').innerText);
  ok('shift suggestion shown', /Suggested\s*225s|Suggested\s*\d+s/.test(txt), txt.match(/Suggested[^\n]*/g)?.join(' | ')||'none');
  console.log('    '+(txt.match(/Suggested[^\n]*/g)||[]).join('\n    '));
  ok('mentions squad size as the reason', /7 players/.test(txt));
  ok('mentions who can keep', /can keep/.test(txt));
  // tap "Use"
  const used=await p.evaluate(()=>{ const b=[...document.querySelectorAll('.sug-b.use')][0]; if(!b)return null; const v=b.dataset.v; b.click(); return v; });
  await p.waitForTimeout(200);
  const shiftNow=await p.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).shiftT);
  ok('tapping Use applies the suggestion', used && String(shiftNow)===used, 'used='+used+' shiftT='+shiftNow);
  const t2=await p.evaluate(()=>document.querySelector('#stratScrim').innerText);
  ok('shows a tick once matched', /✓ Suggested/.test(t2), (t2.match(/Suggested[^\n]*/g)||[]).join(' | '));
  ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
  await ctx.close();
}
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
await b.close(); if(fail)process.exit(1);
