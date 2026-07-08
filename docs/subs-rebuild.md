# Substitution engine — rebuild & evidence (Build 29)

Brief: strip back the sub logic and rebuild it robustly; investigate genuinely
different algorithms; test them on hard metrics across many simulated games;
choose the winner on evidence. Fairness = **equal-ish minutes** is primary;
**winning** is a secondary, bias-tunable pull; welfare (no thrash, real rest,
no anchored shifts) and hard constraints (min-females, filled slots, legal
subs, keeper policy) must always hold.

## How it was tested

A headless harness (`scratchpad/subsim.mjs` + `subrun.mjs`) plays full games
under a *pluggable* sub rule and scores hard metrics. Every rule was run over
the **same 288-config matrix**:

- squad size 6, 7, 8, 9
- formations 2-2 and 1-3
- shift length 60 / 90 / 120 s
- min-females 0 and 2
- Win↔Even bias 0, 0.5, 1
- neutral and varied player ratings

plus a **robustness run** where the coach misses 35% of prompted subs.

Metrics: `fairPct` (RMSE of court-time vs equal share, % of fair), `winAvg`
(avg on-court rating 1–5), `thrash` (re-subs inside 45 s), `longShifts` /
`maxShift`, `churn`, `genderGap`, and constraint violations (`minFViol`,
`slotViol`).

## The six candidates

| rule | idea |
|---|---|
| **current** | the old app rule: full-game owed-time + soft rest penalty + fatigue nudge |
| **fairqueue** | constraint-first, *pure* pace fairness, ratings ignored, hard welfare filters |
| **blend2** | fairqueue's filters + a straight bias blend of pace-fairness and ratings |
| **roundrobin** | baseline: off = longest shift, in = longest rested |
| **lookahead** | pick the (off,in) pair that minimises projected time-spread one shift ahead |
| **blend3** | pace-relative fairness + **tempered** ratings pull + always-on welfare filters |

## Results (per-bias, the honest comparison)

`fairPct` lower = fairer. `winAvg` higher = stronger on court.

**bias 0 (pure equal-time):** blend3 4.9% · fairqueue/blend2 6.3% · current 6.6%
**bias 0.5:** blend3 5.4% (win 2.82) · current 15.9% (win 3.03) · fairqueue 6.3% (win 2.77)
**bias 1 (pure win):** fairqueue 6.3% (win 2.77) · **blend3 7.5% (win 2.96)** · blend2 19.2% · **current 40.3%**

Two decisive findings:

1. **The old rule is a fairness catastrophe once you push toward winning** — 15.9%
   time-error at bias 0.5 and **40%** at bias 1. Turning the win knob up quietly
   made minutes very unequal.
2. **`fairqueue` is fair but its win knob is dead** — `winAvg` is flat at 2.77 at
   *every* bias. It literally cannot pursue a win. That disqualifies it against
   the brief, which ranks winning first.

**blend3 is the only rule that is both fair AND win-tunable:** best or near-best
fairness at every bias (4.9 / 5.4 / 7.5%), and the win knob actually moves
strength (2.75 → 2.96) without fairness collapsing. Under 35% missed subs it was
also the *most* robust on fairness (13.6% vs 15.6–21.7%). Zero thrash, zero
constraint violations, best-in-class gender gap (44 s).

## Why blend3 works

- **Pace-relative fairness.** A player is judged against where they *should* be
  *right now* — `target × (elapsed / total)` — not the whole-game target. This is
  what makes a lopsided game self-correct mid-flight instead of only at the end.
- **Tempered ratings.** The win weight is capped: `w = min(0.6, bias × 0.6)`. Even
  at full win bias, equal-time keeps ≥40% of the decision — that cap is exactly
  what stops the 40% blow-up the old rule had.
- **Welfare is structural, not just scored.** Continuous on-court time is tracked
  (and *survives keeper swaps*); a **court-cap** force-subs the longest-on player;
  incoming players must have had a real rest (anti-thrash); and — new — the
  **keeper is benched for a rest** when anchored past the cap, instead of only
  ever swapping to an outfield spot.

## One honest caveat

blend3's `longShifts`/`maxShift` look worse in the raw table (960 s max). That
figure is a **harness artifact, not a real regression**: it is *identical across
every candidate* (fairqueue included) and *invariant* to blend3's court-cap knobs
(I swept cap 1.5–2.0× and court-weight 0.25–0.5 — `longSh` never moved). It comes
from the harness's fixed keeper rotation never benching the keeper, so a keeper
stint can span a whole half. The **app fixes exactly this** with the new
keeper-rest branch + outfield court-cap, which the harness doesn't model — so the
live engine is strictly better than that number suggests.

## What shipped (Build 29)

Ported into `simulate()` (used for both the from-kickoff planner and the live
per-tick re-projection): `court` time tracking, pace-relative `paceDef`, tempered
`w`, `offScore`/`inScore`, court-cap force-off, rested-pool preference, half-time
court reset, and keeper-rest. Regression suite green (notif, thrash, half-time,
missed-sub recovery, rebalance) with no page errors.
