# ARTS recalibration

The open tuning task from [PLAN.md §7](PLAN.md). The constants were fitted
against a _within-session_ timeline where gaps ran 20 s to 20 minutes. This
records what they do once the history is durable, and what changed as a result.

Measured with `pnpm arts:simulate` (and `-- --sweep-k`, `-- --distribution`)
against a simulated learner who speeds up with practice and slows down with
time away. That learner deliberately does not share ARTS's forgetting curve —
if it did, the numbers would only show the model agreeing with itself. The
conclusions are pinned by `src/core/arts.multiday.test.ts`.

## What changed

**`strengthSpan`: 2.0 → 1.0.** Activation occupies about `[-1.25, +0.15]` in
practice:

| phase                     | min   | p05   | median | p95   | max   |
| ------------------------- | ----- | ----- | ------ | ----- | ----- |
| early (first ~120 solves) | −1.40 | −1.19 | −0.92  | −0.35 | −0.27 |
| learning                  | −1.38 | −0.78 | −0.21  | 0.09  | 0.15  |
| mature                    | −0.10 | −0.09 | 0.01   | 0.09  | 0.14  |

With `tau = -0.8` and a span of 2.0, `(act − tau) / span` topped out at 47 %,
so the strength bar could never fill past half. A span of 1.0 maps the range
that actually occurs onto the full bar.

## What did not change

**`tau` stays at −0.8, gentle −0.4, eager −1.4.** tau turned out to have a
narrower job than the plan assumed. Once every case is introduced, `pickNext`
always serves the lowest activation — steps 2 and 4 of the selection collapse
into the same branch — so tau only decides _introduce a new case or rescue an
old one_, plus the display. In that role it paces introduction sensibly:
across a 57-case selection, all cases are introduced by session 9 at −0.4 and
by session 4 at −1.4.

**The gap compression stays as specified.** `SESSION_GAP = K = 600 s`.

## What was found and not fixed

**A long absence is cheap.** By §7's own constants a month reads as ~5623 s of
virtual time against a night's ~2922 s — about two nights. Once a case has a
dozen encounters spread over tens of thousands of seconds of virtual time,
adding 5623 s moves its activation by roughly 0.1, so a well-drilled set still
reads "all strong" after a month away.

Raising `K` does not fix this. Activation is `ln Σ dt^-d`: a log of a sum, so
it is dominated by encounter _count_, and extra virtual time enters only
logarithmically. Sweeping `K` from 10 to 240 minutes — a 24× change, taking a
month from ~1.6 h to ~21 h of virtual time — moved the 30-day p10 activation
only from −0.07 to −0.26, still nowhere near tau.

**The ranking goes flat in the moment you return.** A long gap adds the _same_
virtual time to every case, swamping the differences between them. Measured
spread across 16 cases: 0.33 at the end of a week's training, 0.04 after 30
days away. The first picks after a long absence are close to arbitrary.

Both are consequences of §7's chosen constants and of the ACT-R formula, not
defects in the port, so changing them is a plan-level decision rather than a
code fix. Two things take the sting out of it:

- It is arguably honest. After a month, everything really is roughly equally
  rusty — the simulated learner's own familiarity is near zero for every case.
- It self-corrects fast. Slow times after the break push `alpha` up, and the
  spread is back to 0.36 after **five** solves.

If it is ever worth tightening, the lever is not `K` but the formula: making
the decay depend on time since a case's _own_ last encounter, rather than on
a shared virtual clock, would keep long absences discriminating.
