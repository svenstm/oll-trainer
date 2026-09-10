# Where the build differs from the plan

[`PLAN.md`](PLAN.md) is kept as written. This records the places the finished
app deliberately departs from it, and why.

## Export/import was added (§12 excluded it)

The plan listed import/export as a non-goal, then flagged its absence as the
top risk and recommended reconsidering before phase 3 shipped. It was added:
with no account, no sync and no migration path, the solve history is
unreconstructable and _is_ the learn-mode memory model, so a cleared browser
profile would lose it permanently.

Import merges by solve id rather than replacing, which makes it safe in all
three situations that matter — restoring onto an empty profile, re-importing
the same file, and merging two devices.

## Generated alternative algorithms were dropped (§16)

Decision 16 wanted 2–3 generated alternatives per case, "at no extra cost"
because the scramble generator was already running a search. That premise did
not hold.

`cubing`'s fast solver (`experimentalSolve3x3x3IgnoringCenters`) can only
express "solve the whole cube", and the optimal solver (`solveTwips`) did not
finish a single case in six minutes even with a restricted generator set.
Masking its target pattern so permutation is free — the shape an OLL-only
search needs — was not accepted in the form tried.

Full-cube solutions _are_ valid OLL algorithms for their case: whether a
sequence orients a state depends only on the orientation vector, not on the
permutation. But they run 12–18 moves against a canonical algorithm's 8–11, so
they would be worse than the algorithm they sat beside, not an alternative to
it.

Building an OLL solver — IDA* over the cube group with a pruning table — would
have cost more than the rest of phase 2 together. The `alternatives` field was
removed rather than left permanently empty. Re-adding it, if ever wanted, means
either that solver or a second hand-entered algorithm per case; the latter
doubles the one table the plan calls the single place a human typo can enter
the pipeline.

## A browser-driven offline check was added (§10, phase 1)

The plan's test list stops at `core/`, the stores, and happy-dom component
tests, and phase 1 scaffolds with e2e declined. That left the README's
headline "works offline" claim — the reason `vite-plugin-pwa` is in the
project at all — with nothing testing it. happy-dom has no service worker, so
no test in the planned set can reach it.

`pnpm verify:offline` (`scripts/verify-offline.ts`) closes that gap without
becoming an e2e suite: it drives headless Chrome over the DevTools protocol
using Node's built-in `WebSocket` and `fetch`, so it adds no dependency, and
it asserts service-worker behaviour rather than UI behaviour. It serves the
build through a server that reproduces the two GitHub Pages properties
`vite preview` does not — a base path and no SPA rewrite — so the `404.html`
fallback is exercised as deployed.

It stays out of CI, which is why it is a script and not a test: it needs a
real browser and a real service worker.

## Solve time is no longer the only signal ("I don't know")

`arts.ts` opened by stating that solve time is the only signal and that there
is no self-rating. There now is one, of exactly one bit: an **I don't know**
button, pressed before the timer is ever started, on a case the user has looked
at and blanked on.

The reason for taking the rating is that the timer cannot express this. Blanking
has three possible shapes without it, and all three are lies: you eventually
work the case out and record a 40-second solve, so the case reads as _known but
slow_; you press Escape, and the scheduler learns nothing at all about the one
case it most needed to hear about; or you walk away, and the time lands outside
the `[minMs, maxMs]` band and is discarded. The most informative event in a
session was the only one with nowhere to go.

What it does to the model:

- **Alpha jumps** to `alphaBlank` (0.52, most of the way to `alphaMax`) rather
  than taking an `lr`-sized step, and never moves down. The bounded log-ratio
  step is sized for timing jitter; this is not a noisy measurement.
- **An encounter is pushed with `d = dMax`.** It has to be an encounter, or the
  case would keep reading as never introduced when in fact it has been met and
  failed. But an encounter _raises_ activation, and a case you just blanked on
  must not read as strong — so `dMax` collapses its contribution within a second
  or two of virtual time, and the case sinks to the bottom of the lowest-
  activation ordering `pickNext` serves from. It comes back on its own, once the
  spacing hold-off has let a few other cases through.
- **It stays out of every timing statistic**: not in `byCase`, so not in the
  execution floors, the Theil-Sen `tps` fit, or `counts`; and not in `statsFor`,
  so not in the mean, best, worst, ao5, ao12 or the sparkline. A blank folded in
  as a zero would make failing at a case look like getting faster at it.

`Solve` became a discriminated union on `outcome`, and the `unknown` variant has
no `ms` field at all rather than a zero or a null. That is the whole point: the
compiler walks you to every site that reads a time and makes each one decide. A
sentinel would have left all of them compiling.

One display-only special case exists, `blankedLast`. `pickNext` needs no such
thing — by the time it runs, real time has passed and the `dMax` encounter has
already decayed. But the model is a computed over the solve history, so it stays
frozen at the instant the blank was recorded, where `dt` is still at its
one-second floor and activation has not begun to fall. Without the guard, the
case you just failed would sit in the Cases tab reading almost fully strong, at
exactly the moment you are most likely to look at it.

### Study mode

Pressing it does _not_ draw the next case. The setup stays on screen, because it
is also the setup on the physical cube in front of the user, and scrambles here
are applied from solved — so `apply setup → run the algorithm → cube is solved
again → repeat` works indefinitely off the same line. The timer is switched off
entirely for the duration (`useTimer`'s new `enabled`), and removed from the
screen rather than zeroed.

Reps taken here are deliberately **not recordable**. A rep executed while
reading the algorithm off the screen is neither an honest time nor an honest
recall, but it would still mint an encounter — so three reps of "practice" would
leave the case reading strong. Instead **Try it timed** leaves study and serves
the same case with a fresh scramble, a fresh angle and the solution hidden: one
real measurement, taken where it is most informative.

Backups went to version 2. A v1 file is read losslessly, since a solve without
an `outcome` was necessarily timed. Writing v2 is what matters: an older build
reads the version, refuses the file and says so, instead of quietly taking every
blank in it for an ordinary solve.

## The reveal names the angle it is drawn at (§9)

§9 has `CaseReveal` show "the canonical alg", and it does — but the face beside
it is the orientation that was actually served, which is one of four angles.
On three of them the algorithm as written does not solve the cube in the user's
hands, and study mode exists precisely so that algorithm can be run against
that cube. So the line is now the cube rotation that squares the served angle
up with the algorithm, followed by the algorithm itself, unchanged: `y2 R' U' R
U' R' U2 R F R U R' U' F'`. Rewriting the algorithm into its conjugate would
have been equally correct and unrecognisable — the whole point is to teach the
one sequence.

A second, quieter departure fed the same bug. §5 step 2 stores the pattern the
inverted algorithm produces; `verify-cases.ts` stored
`canonicalPattern(...)` of it instead — the lexicographically smallest of its
four rotations, which is what the _enumeration_ returns and has no relation to
how any algorithm is written. For 42 of the 57 cases that is a different angle,
so the case list, the results tab and the landing page all drew those cases
turned away from their own algorithm. Patterns are now stored as derived, and
the binding test compares them turn for turn rather than up to a rotation;
canonicalising is left to the two checks that are genuinely about equivalence
classes (collisions, and the comparison against the enumerated set).

## ARTS constants

See [`arts-recalibration.md`](arts-recalibration.md). `strengthSpan` changed on
measurement; `tau` and the gap compression did not. Two consequences of §7's
own constants are recorded there rather than fixed.
