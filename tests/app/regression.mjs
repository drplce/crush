// Consolidated regression + engine-drive suite for the live Goal Girls build.
// Runs against the real single-file app via Playwright (fake clock for the game drive).
import { chromium, APP_URL } from './_boot.mjs';
let pass=0, fail=0; const fails=[];
const ok=(name,cond,extra='')=>{ if(cond){pass++; console.log('  ✓ '+name);} else {fail++; fails.push(name+(extra?' — '+extra:'')); console.log('  ✗ '+name+(extra?' — '+extra:''));} };

const browser=await chromium.launch();
const ctx=await browser.newContext();
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });

// ---- A. DOM / regression smoke ----
console.log('\n[A] DOM & regression checks');
await page.goto(APP_URL);
await page.waitForTimeout(300);

const bodyTextEarly=await page.evaluate(()=>document.body.innerText);
ok('no JS/console errors on load', errors.length===0, errors.join(' | '));
ok('title is Goal Girls', (await page.title())==='Goal Girls', await page.title());
const wordmark=await page.evaluate(()=>document.body.innerText.match(/GOAL.?GIRLS/i)?.[0]||document.querySelector('.wordmark, [class*=word]')?.textContent||'');
ok('wordmark shows GOAL·GIRLS', /GOAL.?GIRLS/i.test(await page.content()), '');

// seeded roster present (rendered in memory — persist is lazy until first save)
const seededNames=['Mia','Jack','Priya','Tom','Sara','Leo','Ana','Ben'];
const shown=seededNames.filter(n=>bodyTextEarly.includes(n)).length;
ok('seeded roster rendered (8 names)', shown===8, shown+' of 8 names shown');

// trigger a save (start+stop clock), then check storage key: rebrand + flush
await page.click('#clockBtn'); await page.waitForTimeout(30); await page.click('#clockBtn'); await page.waitForTimeout(50);
const keys=await page.evaluate(()=>Object.keys(localStorage));
ok('storage uses goalGirls.v1', keys.includes('goalGirls.v1'), keys.join(','));
ok('no legacy crushControl.* keys', !keys.some(k=>/crush/i.test(k)), keys.join(','));
const nPlayers=await page.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')||'{}').players?.length||0);
ok('persisted roster is 8 after save', nPlayers===8, 'got '+nPlayers);

// no visible "midfield" anywhere on the main screen
const bodyText=await page.evaluate(()=>document.body.innerText);
ok('no visible "midfield" on home', !/midfield/i.test(bodyText), '');

// Open Roster & Settings (gear)
await page.click('#editBtn');
await page.waitForTimeout(200);
const rosterOpen=await page.evaluate(()=>document.querySelector('#rosterScrim')?.classList.contains('open'));
ok('Roster & Settings opens', rosterOpen);
ok('Settings has Formation control', await page.locator('#fmSettings').count()>0);
ok('Settings has Sound cues toggle', await page.locator('#soundTog').count()>0);
ok('Settings has Half length (#halfLen)', await page.locator('#halfLen').count()>0);
ok('Settings has Min F (#minF)', await page.locator('#minF').count()>0);
const rosterText=await page.evaluate(()=>document.querySelector('#rosterScrim')?.innerText||'');
ok('shift-length NOT in Settings', !/shift\s*length/i.test(rosterText), '');
ok('keeper alert/interval NOT in Settings', !/keeper (alert|interval)/i.test(rosterText), '');
// build stamp must match the VERSION constant in the source — self-updating, so a version bump can't break it
const srcVer=(await (await import('node:fs/promises')).readFile(new URL('../../index.html', import.meta.url),'utf8')).match(/const VERSION='([^']+)'/)?.[1]||'';
const uiVer=await page.evaluate(()=>document.querySelector('#buildVer')?.textContent||'');
ok('build stamp matches source VERSION', srcVer && uiVer.trim()===srcVer.trim(), 'ui='+uiVer+' src='+srcVer);
// 'F' pink square + 'M' blue in roster (sex markers)
ok('roster shows F/M sex markers', /\b[FM]\b/.test(rosterText));
await page.click('#rosterScrim .sheet-x');
await page.waitForTimeout(150);

// Plan sheet: keeper re-pick + shift length live here (moved out of settings)
await page.click('#planBtn');
await page.waitForTimeout(250);
const planText=await page.evaluate(()=>document.querySelector('#stratScrim')?.innerText||'');
ok('Plan opens', await page.evaluate(()=>document.querySelector('#stratScrim')?.classList.contains('open')));
ok('Plan has Re-pick keeper control', /re-?pick keeper/i.test(planText), planText.slice(0,200));
ok('Plan has shift length control', /shift/i.test(planText), '');
ok('Plan has win/equal bias slider', /(win|equal|fair)/i.test(planText), '');
await page.click('#stratScrim .sheet-x');
await page.waitForTimeout(150);

// Formation 3-1 = 3 attackers + 1 defender (attack-first)
await page.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1')); s.formation='3-1'; localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
await page.reload(); await page.waitForTimeout(300);
const slotZones=await page.evaluate(()=>{
  const s=JSON.parse(localStorage.getItem('goalGirls.v1'));
  return s.formation;
});
ok('formation set to 3-1', slotZones==='3-1');
// count rendered def vs att slots via the rink DOM
const zoneCounts=await page.evaluate(()=>{
  const def=document.querySelectorAll('.z-def, .role-def').length;
  const att=document.querySelectorAll('.z-att, .role-att').length;
  return {def,att};
});
ok('3-1 renders more attack slots than defence (attack-first)', zoneCounts.att>zoneCounts.def, JSON.stringify(zoneCounts));

// ---- B. Engine drive with fake clock ----
console.log('\n[B] Engine-driven game (fake clock)');
const page2=await ctx.newPage();
const err2=[];
page2.on('pageerror',e=>err2.push(String(e)));
page2.on('console',m=>{ if(m.type()==='error') err2.push('console: '+m.text()); });
await page2.clock.install();
await page2.goto(APP_URL);
await page2.waitForTimeout(200);
// set a short half so the game moves through phases quickly (2 min half)
await page2.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1')); s.formation='2-2'; s.halfLen=6; localStorage.setItem('goalGirls.v1',JSON.stringify(s)); });
await page2.reload(); await page2.waitForTimeout(200);

// start the clock
await page2.click('#clockBtn');
await page2.waitForTimeout(50);
const running=await page2.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).running);
ok('game starts running', running===true);

// advance 3 minutes of game time
await page2.clock.runFor(180000);
await page2.waitForTimeout(200);
const elapsed=await page2.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).elapsed);
ok('clock advanced (~180s)', elapsed>=150 && elapsed<=210, 'elapsed='+elapsed);

// sub recommendation surfaced (⇄ pill) — engine is producing prompts
const hasSubPill=await page2.evaluate(()=>/⇄/.test(document.querySelector('#courtList')?.innerHTML||'') || /⇄/.test(document.querySelector('#benchGrid')?.innerHTML||'') || /⇄/.test(document.body.innerHTML));
ok('engine surfaces a sub recommendation (⇄)', hasSubPill);

// minutes accruing and roughly tracking (no NaN)
const secs=await page2.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).players.map(p=>p.sec));
ok('all player seconds are finite numbers', secs.every(s=>Number.isFinite(s)), JSON.stringify(secs));
ok('on-court players accrued time', secs.filter(s=>s>0).length>=5, JSON.stringify(secs));

// run to end of first half target (halfLen=6min=360s) to trigger chime
await page2.clock.runFor(200000);
await page2.waitForTimeout(200);
const chimed=await page2.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).chimed);
ok('half-target chime flag set after target', chimed===true);
const warn2=await page2.evaluate(()=>JSON.parse(localStorage.getItem('goalGirls.v1')).warn2);
ok('2-min-to-end warning fired', warn2===true);

// no errors during the whole engine drive
ok('no JS errors during game drive', err2.length===0, err2.join(' | '));

// ---- C. Late-join regression ----
console.log('\n[C] Late-join player');
await page2.click('#editBtn');
await page2.waitForTimeout(150);
await page2.click('#addPlayer');
await page2.waitForTimeout(150);
const lateP=await page2.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('goalGirls.v1')); const p=s.players[s.players.length-1]; return {restSec:p.restSec, seg:p.seg}; });
ok('late player seeded with restSec>0 (eligible to sub on)', lateP.restSec>0, JSON.stringify(lateP));
ok('late player has leading bench seg (strip lines up)', Array.isArray(lateP.seg)&&lateP.seg.length>=1&&lateP.seg[0].z==='bench', JSON.stringify(lateP.seg));

await browser.close();
console.log('\n===== '+pass+' passed, '+fail+' failed =====');
if(fail) { console.log('FAILURES:\n - '+fails.join('\n - ')); process.exit(1); }
