# Pace: replacing the forgetting curve

Design for `src/core/pace.ts`, which replaces `src/core/arts.ts`. Settled by
grilling on 2026-09-11, built and backtested on 2026-09-12. The section
**[What the backtest changed](#what-the-backtest-changed)** records the three
places the design as agreed did not survive contact with a simulation.

## Why

ARTS scored a case by ACT-R activation — `ln Σ dt^-d` — evaluated at the
current instant. Three measured consequences, all against the real history in
`oll-trainer-2026-09-11.json`:

**The bar was a recency countdown, not a memory meter.** `dt` is floored at one
second (`arts.ts:206`), so a fresh encounter always contributes exactly `1.0`.
Every first rep therefore scored exactly 80%, whatever the time — 3.06 s and
6.10 s both read 80%. A lone encounter then falls below `tau = -0.8` in about
ten seconds, which is less than one solve. Holding the history fixed and
advancing only the clock, case 42 (four reps, best-drilled in the set) reads:

| +0 s | +10 s | +30 s | +60 s | +300 s | +1 h         |
| ---- | ----- | ----- | ----- | ------ | ------------ |
| 100% | 63%   | 44%   | 33%   | 7%     | 0% — at risk |

Every case in the file reads 0% and at-risk one hour after the session ends.

**The time axis conflated two scales.** `compressGap` passes gaps under ten
minutes through at full strength and flattens everything beyond
logarithmically. A night reads as 2922 virtual seconds — so **49 minutes of
uninterrupted practice decays a case exactly as much as eight hours of sleep**,
and two hours of practice ages it more than a year away from the cube.

**The premise doesn't hold for OLL.** Execution is an overlearned motor
sequence; it does not decay on a scale a forgetting curve models. What does
vary is recognition, and the signal for that is already in the history: how
this case performs relative to your other cases.

`docs/arts-recalibration.md` is kept as the record of why the constants were
fitted the way they were, and is now historical.

## The model

Two numbers per case, computed from the last three timed solves. No elapsed-time
term anywhere.

### par

The reference a case is measured against. Built from demonstrated results, so
`pace = 1.0` is reachable by construction:

- Take each case's median of its last three timed solves.
- Eligible cases are those with at least three timed solves.
- **Fewer than 5 eligible cases:** `par = algMoveCount(case) / 3.0` — the
  move-count seed, no personal data.
- **5 or more:** `par` is the **interpolated** 25th percentile of those medians
  — "as good as my better cases". Interpolated, not index-selected, so par
  slides continuously as cases improve instead of jumping when one case
  overtakes another.
- Apply the move-count correction only when the Theil-Sen fit is credible;
  otherwise par is flat across cases. The fit is two-parameter —
  `expected = intercept + slope * moves` — and runs on each case's **best**
  time, not its window median. See [check 3](#what-the-backtest-changed) for
  why both of those matter.

p25 rather than the median matters: with a median par, half the selection sits
above par by definition and can never all go green.

### pace and spread

From the last three timed solves of a case:

- `pace   = median(last3) / par` — lower is better, `1.0` is par.
- `spread = max(last3) / median(last3)` — worst-vs-median, not max/min.

Worst-vs-median is deliberate. Max/min flips on where the window happens to
fall: case 10 spreads 3.5x over all four solves but only 1.6x over the last
three, because its fast solve was its first.

### score

One number, driving both the queue and the bar:

```
score = pace * max(1, spread / 1.5)
```

A blank ("I don't know") in the last three pins the score to worst. It does not
enter `spread` — it has no time to contribute.

### state

| state         | condition                                                     |
| ------------- | ------------------------------------------------------------- |
| `introducing` | fewer than 3 timed solves — **no bar at all**, not a zero bar |
| `at-risk`     | blank in the last 3, or `spread > 1.5`                        |
| `learning`    | scored, gate passed, not yet at par                           |
| `mastered`    | scored, gate passed, `score <= 1.0`                           |

A blank expires naturally when it falls out of the last-three window — three
clean reps, the same evidence bar every other case clears. No special clearing
logic.

## The bar

Length and colour both derive from `score`:

- Length: `clamp((barCeiling - score) / (barCeiling - masteredAt), 0, 1)`
- Colour: at-risk red, otherwise the ready green.

Length tracks `score` rather than `pace` alone so a case cannot render as a
full bar in the at-risk colour. It also means the bar _is_ your position in the
queue — what you see and what gets served next are the same number.

## The scheduler

One ordering, no priority tiers. `arts-recalibration.md` records that tau's
tiers collapsed into the same branch in practice; don't rebuild them.

1. Drop cases held back by `recentlyServed` (unchanged).
2. If an intro is due (`introEvery` / `introStarved`) **or** nothing scored is
   off par, serve an unfinished case — the one closest to earning a score, so
   half-learned cases cannot pile up. "Unfinished" means unseen _or_ seen fewer
   than three times; see [check 3](#what-the-backtest-changed).
3. Otherwise serve the **highest** `score`.
4. Tiebreak, and the fallback once every case is at par: **least recently
   served**, measured in trials.

Step 4 is what replaces decay as the source of gradient. It is in the
scheduler's native units, it is immune to the sleep objection, and it stays
deterministic under test.

## Settings

`tau` is deleted rather than reinterpreted. The slider labelled _"Introduce new
cases: gentle ↔ eager"_ (`PracticeView.vue:377`) drives `introEvery` directly,
mapped **12 (gentle) ↔ 3 (eager)** — the label becomes literally true.

`BACKUP_VERSION` stays at **2**. Solves are the only durable data and they are
untouched; `parseSettings` already defaults missing keys, so a stray `tau` in
an existing export is ignored. Bumping would make new exports unreadable by the
deployed build in exchange for nothing.

## Blast radius

**Delete:** `activation`, `compressGap`, the virtual timeline, `Encounter.d`,
`alpha`, `tau`/`tauGentle`/`tauEager`, `strengthSpan`, `c`, `F`, `lr`, the
`alpha*` and `d*` bounds, `sessionGapMs`, `gapKMs`, `maxEncounters`, and the
`floors` map with `floorLo`/`floorHi` — its job (separating "slow because the
alg is long" from "slow because forgotten") is now done by the move-count term
in par.

**Keep:** `algMoveCount`, the Theil-Sen `tps` fit, the `minMs`/`maxMs` time
band, blanks as categorical failure, `recentlyServed`, `introEvery` /
`introStarved`, `ROTATIONS` / `pickRotation`, `learnStatus` (redefined), and
the fold-over-history property so deleting a solve still un-learns it.

**Files:** `arts.ts` → `pace.ts`. `arts.test.ts` rewritten.
`arts.multiday.test.ts` **deleted** — all 220 lines pin multi-day forgetting
behaviour that will no longer exist. `simulate-arts.ts` → `simulate-pace.ts`.
Touch `ResultsPanel.vue`, `PracticeView.vue`, `stores/settings.ts`,
`core/parse.ts`, `core/types.ts`, `PLAN.md`, `plan-deviations.md`.

Side benefit: activation summed over every encounter, making a replay quadratic
in encounters per case (the reason `maxEncounters` existed). The new model needs
only the last three solves, a count, and a last-served index — the replay is
linear and the cap is unnecessary.

## Worked example

Against the 25-solve history, `par = 3.86 s` from 6 eligible cases:

| case | n   | pace | spread | score | bar  | state             |
| ---- | --- | ---- | ------ | ----- | ---- | ----------------- |
| 10   | 4   | 2.52 | 1.36x  | 2.52  | 24%  | learning          |
| 47   | 4   | 2.20 | 1.32x  | 2.20  | 40%  | learning          |
| 55   | 4   | 1.49 | 1.13x  | worst | 0%   | at-risk (blank)   |
| 9    | 3   | 1.37 | 1.15x  | 1.37  | 81%  | learning          |
| 42   | 4   | 1.00 | 3.53x  | 2.35  | 32%  | at-risk (erratic) |
| 40   | 2   | —    | —      | —     | —    | introducing       |
| 35   | 1   | —    | —      | —     | —    | introducing       |
| 52   | 3   | 0.76 | 1.04x  | 0.76  | 100% | mastered          |

Case 42 is the one worth reading twice: at par on pace, but it went
3.97 → 13.65 → 3.46 → 3.86, so the spread penalty pushes it above 9 and 55 in
the queue without pushing it above 10, which is genuinely the slowest case.
That is the behaviour a single activation scalar could not express.

## Acceptance

Run `pnpm pace:simulate`. Three checks, against a learner who never forgets,
starts slow on every case, and improves asymptotically toward a per-case floor.

| check | asks                                                | result over 5000 trials                  |
| ----- | --------------------------------------------------- | ---------------------------------------- |
| 1     | Does par converge, or chase its own tail?           | drift 93% early → **0.1%** late          |
| 2     | Is mastery reachable by more than the top quartile? | **11–16 of 16**, oscillating             |
| 3     | Does any case starve or grind?                      | reps **34..636**, none below `minSolves` |

Check 2 oscillates rather than settling because a three-solve window under
±20% jitter will always read some case high. That is honest measurement noise,
not drift.

On the 25-solve reference history, par moves seed 3.667 → flat 5.307 → fitted
4.062 → 3.991 and does not oscillate, but six eligible cases is too thin to
separate the models on its own. The simulation is what the design rests on.

## What the backtest changed

Three defects that the grilling did not catch and the simulation did. All three
are in the implementation now; the design above describes the fixed version.

**Half-introduced cases starved, permanently.** Q5 settled that a case needs
three timed solves before it is scored, but never said how such a case should
be _scheduled_. Scoring it as "at par" put it below every case needing work,
and `introStarved` only counted first sightings — so a case met once stopped
resetting the intro counter and never competed in the main ordering either.
After 1200 trials: `reps: 1,1,147,1,2,1,1,2,1,150,133,113,106,197,191,153`.
Eight of sixteen cases frozen forever. `introStarved` now counts any unfinished
case, and `pickNext` finishes the one closest to earning a score.

**Mastery was a rank, not an achievement.** Par is the 25th percentile of your
own cases, so `score <= 1` can be held by at most a quarter of them however
good you get. The simulation pinned `mastered` at exactly 2 of 16 — 25% of the
8 eligible — and stayed there for 1200 trials. Q6 claimed p25 avoided the
treadmill that a median par has; it does not, it just moves the quantile.
Mastery is now a margin above par, `masteredAt = 1.25`, and the bar fills there.

**Par had no intercept, so short algorithms could never reach it.** Recognition
costs the same whatever the algorithm's length, so seconds-per-move is
systematically worse for short cases. With `par = rate × moves`, every 7-move
case sat at pace 1.44–1.53 while within 13% of its true floor, and the
scheduler ground 730–800 reps into them. `arts.ts` had dodged this by
subtracting an execution floor before fitting — the `floors` map this design
deleted. Par now fits the floor instead, as a two-parameter Theil-Sen. The same
cases now reach par in 144–453 reps.

Fitting on window medians also made the fit fail outright: cases sit at
different learning stages, so a drilled 13-move case beats a fresh 9-move one,
the pairwise slopes go negative and the median slope with them. Best times sit
near the execution floor, where a length relationship is legible.

## Known limitations, stated up front

- With 6 eligible cases you are barely over the threshold where par goes
  personal. Expect par to be jumpy until more cases have three solves.
- `masteredAt = 1.25` is a judgement, not a measurement. It is the margin that
  makes mastery reachable in simulation; whether it matches what _you_ would
  call "I know this case" is the one number worth revisiting with real use.
- The Theil-Sen fit is fragile at this data volume. On the reference history it
  succeeds from best times (tps 5.33) but is **unfittable** from window medians.
  Hence par uses the correction only when the fit is credible, and falls back to
  a flat par when it is not.
- Nothing decays, by design. If recognition does fade over months, this model
  will not notice — least-recently-served is the only thing that will
  eventually re-probe a green case.
