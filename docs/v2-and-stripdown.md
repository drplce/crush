# Engine v2 + UI strip-down (Builds 30–31)

Follows on from `subs-rebuild.md` (the blend3 rebuild, build 29). This round acted on
three decisions from you: treat GK as a rest role, share attack/defence roughly evenly,
and strip the app down hard. Season mode was descoped. Formation labels were fixed.

## 1. GK-as-rest — the model, simplified

Two currencies, three states:

| | Bench | Goalkeeper | Outfield |
|---|---|---|---|
| **Game time** (fairness) | not playing | **counts** | **counts** |
| **Running load** (welfare) | full rest | **some rest** | no rest |

- Fairness is on total minutes (goal + outfield both count — GK is still a game).
- Welfare is now a single **running-load** number = continuous outfield time. A spell in
  goal bleeds it down (some rest); the bench clears it. GK is tracked as its own bucket.

This **deleted** the court-cap, max-shift and long-shift parameters and the keeper-rest
special case from build 29 — goal already *is* the rest. Welfare is enforced by a soft,
steepening run-nudge in the off-score (negligible early, decisive as someone nears ~3
shifts of unbroken running), not a hard cap.

**Evidence (432-config harness, subrun2.mjs).** A soft steep nudge matched a hard cap's
worst-case run (≈600s vs a 960s = full-half anchor with no welfare term) while keeping
better fairness and role balance and needing no disruptive override:

| variant | fairPct | win | roleSpread | worst run |
|---|---|---|---|---|
| no welfare term | 5.1% | 2.86 | 0.261 | 900s |
| **soft run-nudge (shipped)** | **5.9%** | **2.81** | **0.18** | **600s** |
| hard cap | 6.5–7.2% | 2.79–2.83 | 0.19 | 600s |

Win knob still moves (2.75 → 2.85 across bias), zero thrash, zero constraint violations.

## 2. Role-share fairness (attack ↔ defence)

Before: the engine balanced total minutes and goal-share, but **not** attack vs defence —
a player could get stuck in one role all game. Now att/def are shared out to whoever's had
least of that role (the same principle the keeper rotation already used for goal). Cut
"stuck in one role" players ~30% (roleSpread 0.261 → 0.20) for a tiny fairness cost.

It's **formation-change-proof by construction** — it shares whatever slots exist right now,
so switching 2-2 → 3-1 → 1-3 mid-game just redistributes on the fly. Kept soft (weight 0.6)
so it never overrides skill/win when you turn the knob up.

## 3. Formation labels fixed + 1-2-1 cut

Labels were reversed. Now **attack-first**: **3-1 = 3 attackers + 1 defender** (chase),
**1-3 = 1 attacker + 3 defenders** (protect), 2-2 balanced. The 1-2-1 formation and its
whole midfield concept were removed. The engine *executes* whatever structure you pick and
re-plans instantly; it does not choose the formation — that's your call from the scoreboard.

## 4. UI/UX strip-down

Nav had a phone burger menu **and** a duplicate header button row. Removed the burger; the
four header buttons — **Plan · Events · Stats · ⚙** — are the single one-tap nav everywhere.

- **Six screens → four.** "Strategy" and "Game plan" were two screens for one job (both
  projected a rotation — Game plan via a *stale second engine* that predated the rebuild).
  Merged into one **Plan** screen driven by the one authoritative engine. Deleted the stale
  projection outright.
- **One plan, always active.** Dropped multi-plan compare / New / Duplicate / Delete /
  naming — power-user clutter for a casual coach.
- **Season descoped**, capability preserved: the store keeps building in the background
  (games auto-capture at full-time) so a season view can return later with history intact.
  "Copy game" export moved to the Plan screen; per-player target-vs-actual moved into Stats.
- **Prefer/avoid zone flags removed** — relative-share role balance handles it automatically.

## Verification

432-config harness for the engine; browser regression suite green (rebalance, notifications,
anti-thrash, half-time, missed-sub recovery, re-plan) plus a new UI strip-down check — all
passing, no page errors. Live at build 31.

## Deliberately left for a later pass

- Engine *suggesting* a formation from score + time (the "coach watching the game" idea) —
  needs its own design so it doesn't flip-flop.
- Season *view* (the background data is already accruing).
- "Sub straight onto GK first" — trial it at the bench before deciding whether to encode it.
