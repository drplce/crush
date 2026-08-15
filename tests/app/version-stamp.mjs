// The build stamp must stay a BARE NUMBER (no name/suffix) and match the VERSION constant,
// in both places it is shown. Phone viewport: the gear is desktop-only, the burger is phone-only.
import { chromium, APP_URL } from './_boot.mjs';
import { readFile } from 'node:fs/promises';
const src=await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const ver=src.match(/const VERSION='([^']+)'/)?.[1];
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(APP_URL); await p.waitForTimeout(200);
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' — '+x));};
ok('VERSION is digits only', /^\d+$/.test(ver), 'VERSION="'+ver+'"');
// burger menu
await p.click('#menuBtn'); await p.waitForTimeout(200);
const menu=await p.evaluate(()=>document.querySelector('#menuScrim .menu-ver')?.textContent||'');
ok('burger menu shows "Build <n>"', menu.trim()==='Build '+ver, JSON.stringify(menu));
// phone: reach Roster & Settings through the burger menu (the gear is desktop-only)
await p.evaluate(()=>{ const b=[...document.querySelectorAll('#menuScrim [data-act]')].find(x=>x.dataset.act==='roster'); if(b)b.click(); });
await p.waitForTimeout(250);
const roster=await p.evaluate(()=>document.querySelector('#buildVer')?.textContent||'');
ok('Roster & Settings shows the same number', roster.trim()===ver, JSON.stringify(roster));
ok('no name/suffix anywhere in the stamp', !/[·a-zA-Z]/.test(roster.trim()), roster);
ok('no JS errors', errs.length===0, errs.slice(0,2).join('|'));
console.log('\n  VERSION = '+ver);
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
await b.close(); if(fail)process.exit(1);
