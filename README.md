# Crush · Control

A courtside bench & goal-control app for kids' **mixed floorball** (5-a-side:
1 goalkeeper + 4 outfield). Built for one coach to run rotations from a phone
during a game.

It's a **single self-contained HTML file** — no build step, no server, no
dependencies. Open `index.html` in any browser and it works, online or offline.

## What it does

- **Live game clock** — tap the clock in the header to start / pause. Score
  buttons (Goal / Against) at the bottom, with Undo.
- **Tap-to-swap rotations** — tap one player, then another, to substitute or
  swap positions. Not drag-and-drop.
- **Live sub recommendation** — the app suggests the next change: the
  longest-shift player comes off, the most-rested / most-owed bench player
  comes on. It shows as a countdown pill on the bench (`⇄ Name · 1:00`, turning
  amber when due) mirrored by an "Off" marker on the outgoing player. One tap
  executes it; Undo reverses it exactly.
- **Fair minutes** — every player has a target share of court time (from the
  half length × formation). Rows show who's *owed* time vs *over*, so you can
  defend rotation decisions with numbers.
- **Targets sheet** (burger menu) — per-player, per-position minute targets;
  tap a position to mark a player's preference (normal → prefer ★ → avoid ✕).
- **Mixed-team rule** — set a **minimum number of girls on court** (default 2).
  Subs that would drop below it are soft-blocked (tap again to override for
  injuries), illegal partners dim while selecting, an amber strip warns when
  you're short, and the recommendation brings a girl on for a boy to fix it.
- **Formations** — 2-2, 1-3, 3-1, 1-2-1 (tap the formation pill).
- **Events / Stats** — goal timeline (fix or delete a scorer) and a
  time-and-zones breakdown per player.
- **Roster & Settings** — rename players, set starting positions and sex,
  add/remove players, tune half length, shift length, keeper alert, and the
  minimum-girls rule.

The layout adapts: a **roster-list** view on phones, a **rink** view on iPad /
wide screens.

## Use it

- **Phone:** open the hosted URL (see below) or the file, then use your
  browser's **Add to Home Screen** — it launches fullscreen like a native app.
- **Desktop:** just open `index.html`.

Game state (roster, scores, times) is saved automatically in the browser's
**localStorage**. It is **per-device and per-browser** — it does not sync
between your phone and laptop, and each keeps its own game.

## Host it on GitHub Pages (optional)

This repo is Pages-ready — `index.html` is at the root.

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, branch `main`, folder `/ (root)`, Save.
3. After a minute your app is live at
   `https://<your-username>.github.io/<repo-name>/`.

**Note:** GitHub Pages on a **private** repo requires a paid plan (Pro/Team).
On a free account, either keep the repo private for backup only (no hosted URL),
or make it public to get the free Pages URL — there are no secrets or private
data in this app, so public is safe.

## Editing

Everything lives in `index.html`: `<style>` for the design, one `<script>` at
the bottom for all logic (state, clock, rotation engine, rules). Edit and
reload — no toolchain.
