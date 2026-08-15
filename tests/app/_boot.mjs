// Shared bootstrap for the browser-driven tests.
// Finds Playwright wherever it's installed and resolves the app under test relative to this repo,
// so the suite runs from any checkout without hard-coded machine paths.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let chromium = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
  try { chromium = require(p).chromium; break; } catch (e) { /* try next */ }
}
if (!chromium) throw new Error('Playwright not found. Install it (npm i -D playwright) or set NODE_PATH.');

export { chromium };
export const APP_URL = new URL('../../index.html', import.meta.url).href;

// tiny assertion helper shared by every app test
export function makeOk() {
  const state = { pass: 0, fail: 0, fails: [] };
  const ok = (name, cond, extra = '') => {
    if (cond) { state.pass++; console.log('  ✓ ' + name); }
    else { state.fail++; state.fails.push(name); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  const done = () => {
    console.log(`\n===== ${state.pass} passed, ${state.fail} failed =====`);
    if (state.fail) process.exit(1);
  };
  return { ok, done, state };
}
