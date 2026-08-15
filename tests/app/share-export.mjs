import { chromium, APP_URL } from './_boot.mjs';
const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push('con:'+m.text());});
await p.goto(APP_URL); await p.waitForTimeout(200);
await p.click('#clockBtn'); await p.waitForTimeout(20); await p.click('#clockBtn'); await p.waitForTimeout(30);
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' — '+x));};
await p.click('#planBtn'); await p.waitForTimeout(250);
ok('Share game button present', await p.locator('#stratShare').isVisible());
ok('Share button label', (await p.evaluate(()=>document.querySelector('#stratShare').textContent))==='Share game');
// footer wraps to 2 rows on a phone width — check 4 buttons render
ok('footer has 4 actions', await p.locator('#stratScrim .sheet-foot button').count()===4);
// no native share in headless → fallback download path. Capture the download.
const [dl]=await Promise.all([
  p.waitForEvent('download').catch(()=>null),
  p.click('#stratShare')
]);
ok('Share triggers a file download (fallback)', !!dl, 'no download event');
if(dl){
  const fn=dl.suggestedFilename();
  ok('filename looks right', /^goalgirls-\d{4}-\d{2}-\d{2}-\d+-\d+\.json$/.test(fn), fn);
  const path=await dl.path(); const fs=await import('fs');
  const content=fs.readFileSync(path,'utf8'); let J=null; try{J=JSON.parse(content);}catch(e){}
  ok('downloaded file is valid game JSON', !!J && J.app==='Goal Girls' && !!J.engineVsActual, (content||'').slice(0,60));
}
ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
// phone-width layout sanity
await p.setViewportSize({width:390,height:800}); await p.waitForTimeout(100);
const rows=await p.evaluate(()=>{ const bs=[...document.querySelectorAll('#stratScrim .sheet-foot button')]; const tops=new Set(bs.map(b=>Math.round(b.getBoundingClientRect().top))); return tops.size; });
ok('footer wraps to 2 rows on phone', rows===2, 'rows='+rows);
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
await b.close(); if(fail)process.exit(1);
