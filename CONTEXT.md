# OLL Trainer

Drilling the 57 OLL cases: the app serves a case, the user sets it up on a real cube, recognises it and solves it, and the time feeds an adaptive schedule.

## Language

### Cases and setups

**Case**:
One of the 57 last-layer orientation patterns, identified by its community number. A cube is "in" a case when its first two layers are solved and its last layer is oriented like the case; the last-layer permutation is irrelevant.
_Avoid_: OLL (for a single case), pattern (that is the case's sticker map)

**Angle**:
Which way round the case is presented on the U face, as a quarter-turn offset. Learn mode chooses it for coverage, so the same case at a different angle is a different thing to drill.
_Avoid_: Rotation, AUF

**Scramble**:
A move sequence that turns a solved cube into a given case at a given angle. Many scrambles reach the same case, each ending on a different last-layer permutation.
_Avoid_: Setup, sequence

**Case reached**:
The moment a tracked cube is in the served case at the served angle, by whatever route the user's turns took — not necessarily the shown scramble.

**OLL solved**:
First two layers solved and the last layer fully oriented, any permutation. Ends a solve.

### Timing

**Inspection**:
The countdown of up to 15 seconds that starts on case reached and ends on the user's first turn. Exists only with a smart cube.

**Recognition time**:
How much of the inspection the user used before their first turn — the time spent recognising the case.

**Solve time**:
From the first turn after inspection to OLL solved with a smart cube; from release to stop with the keyboard or touch timer, where it includes recognition.

**Blank**:
An attempt the user could not solve because they did not recognise the case — by pressing _I don't know_, or by letting inspection run out. Carries no time, and opens study mode.
_Avoid_: DNF, skip, fail

### Hardware

**Smart cube**:
A Bluetooth cube that reports its turns and state to the app. An optional input alongside the keyboard and touch timer.
_Avoid_: Bluetooth cube, connected cube

**Hold**:
The colours the user keeps on top and in front while training (default yellow top, green front). Turns the smart cube's own frame into the frame scrambles and angles are written in.
_Avoid_: Orientation (that word belongs to OLL itself), grip
