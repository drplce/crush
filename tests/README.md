# Goal Girls — test suite

Two layers: **app tests** drive the real `index.html` in a browser, **engine tests** run the
substitution logic headlessly so thousands of matches can be played in seconds.

```bash
./tests/run-all.sh          # ~1 min
./tests/run-all.sh full     # the big sweeps (~3 min)
```

Needs Node 18+ and Playwright (`npm i -D playwright`, or an existing global install —
`_boot.mjs` finds either). No other dependencies, no build step.

---

## app/ — drives the real build

Each file launches Chromium against `index.html` and asserts on actual DOM and stored state.
Games are played on Playwright's **fake clock**, so a 30-minute match runs in milliseconds.

| File | Covers |
|---|---|
| `regression.mjs` | Branding, storage key, settings/Plan layout, formation notation, a full fake-clock game, chimes, late-join |
| `rest-keeper-prompt-fixes.mjs` | The "never actually sat down" rest flag, keeper stint across half-time, prompts without opening the Plan screen |
| `engine-vs-actual.mjs` | Recommendation logging and the `engineVsActual` export block |
| `share-export.mjs` | Share/download of the game file, filename, JSON validity, footer layout |
| `goalie-optout.mjs` | A player marked "won't play goal" never appears in the engine's keeper plan |
| `minf-urgent-fix.mjs` | Breaking the female floor prompts a fix immediately, not at the next shift |
| `single-sex-and-suggestions.mjs` | All-girls / all-boys squads ignore the female rule; suggested shift & keeper values |
| `auto-lineup-minf.mjs` | "Auto by rating" still satisfies the female floor |

`_boot.mjs` resolves Playwright and the app URL relative to the repo — no machine-specific paths.

## engine/ — headless, thousands of games

| File | What it is |
|---|---|
| `engine.mjs` | The decision logic **mirroring the shipped scorers**. Keep in sync with `simulate()` in `index.html` |
| `subsim.mjs` | Idealised harness — perfect coach, fixed cadence. Good for isolating engine behaviour |
| `matchsim.mjs` | **Real-world** match sim: prompts missed or actioned late, breaks in play, injuries, late arrivals, early departures, sin-bins, toilet breaks, over-eager coaches, kids who refuse to come off |
| `edge.mjs` | 70 hand-built nasty scenarios (degenerate squads, infeasible constraints, extreme knobs) |
| `fuzz.mjs` | Randomised configs, seeded so any failure reproduces: `node engine/fuzz.mjs 20000` |
| `goalie.mjs` | The opt-out gets zero goal time **and** still an equal share of total minutes |
| `stress.mjs` | Real-world sweep, squads 5–10 |
| `stress2.mjs` | Expanded sweep — squads 4–12, all-girls/all-boys/mixed, halves 5–30 min, keeper availability from everyone down to nobody |

### Hard invariants (must never break)

Court-time conservation · per-player zone accounting · always five on court when five are
available · the female floor honoured **when feasible and on a mixed squad** · a goalie opt-out
honoured whenever two or more players are willing to keep · no NaN, no negative time, nobody
plays longer than the game.

### Deliberate non-failures

Some outcomes look like faults but are arithmetic or the coach's call, and the suites encode that:

- **Only one willing keeper** — they can't cover a whole game, so someone else must take goal.
- **Nobody willing to keep** — the app falls back to the whole squad rather than field an empty goal.
- **A short-handed squad** (fewer players than slots) can't field five.
- **A breach inside the coach's own reaction window** is them walking to the bench, not an engine fault.
  Only a breach that outlasts the reaction window *with an attentive coach* counts as a failure.

---

## Interpreting the numbers

`fairness` is RMSE of each player's court time against their **availability-weighted** fair share
(so a kid who arrives at half-time isn't counted as owed a full game). Lower is better; it is a
harsher metric than a raw min/max spread, so read it in comparison, not absolutely.

Findings that have held up across sweeps:

- **Squad size dominates.** ~16% at 6 players → ~46% at 10 → ~57% at 12. Beyond ~9, one rotation
  cannot share a game fairly — shorten the shift (the Plan suggests this).
- **Coach reliability is the next biggest factor** — ~29% acting on every prompt → ~42% acting on 30%.
- **Over-subbing helps** (~38% never subbing off-plan → ~25% subbing on your own initiative).
- **Breaks in play cost fairness** (~31% → ~38% when subs only land on a ~90s stoppage).
- **A kid who won't come off is expensive** (~43% vs ~32%) — they block the queue.

## When you change the engine

`engine/engine.mjs` mirrors the shipped scorers; update it in the same commit as `index.html` or
the sweeps will be testing yesterday's logic. The app tests always drive the real build, so they
catch drift between the two.
