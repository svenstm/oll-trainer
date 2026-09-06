# Where the build differs from the plan

[`PLAN.md`](PLAN.md) is kept as written. This records the three places the
finished app deliberately departs from it, and why.

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

## ARTS constants

See [`arts-recalibration.md`](arts-recalibration.md). `strengthSpan` changed on
measurement; `tau` and the gap compression did not. Two consequences of §7's
own constants are recorded there rather than fixed.
