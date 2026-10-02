---
status: accepted
---

# Smart-cube attempts get inspection, and their time is stored in two parts

The original plan ([`PLAN.md`](https://github.com/svenstm/oll-trainer/blob/66b7946/docs/PLAN.md)) ruled out WCA inspection. With a smart cube we reverse that: once the cube reaches the served case, a 15-second inspection runs, the first turn starts the solve, and OLL solved stops it. That moves recognition out of the solve time, unlike every keyboard solve in the history. So a smart-cube attempt stores its recognition time and solve time separately, and records that it came from the cube. The pace model is fed their sum, which keeps it comparable with the existing history. Splitting the two signals in the model stays possible later, because the data is already there.

## Considered Options

- **Solve timed from first turn, recognition discarded** (pure WCA). Rejected: every cube time would look faster than its keyboard predecessors, and the scheduler would think cases improved when nothing had changed. Recognition is also half of what an OLL drill trains.
- **Solve timed from case reached, inspection only cosmetic.** Rejected: it keeps comparability, but throws away the split, which only a smart cube can measure.

## Consequences

- Inspection running out is a **blank**, not a +2 or DNF. Penalties remain a non-goal.
- Keyboard and touch attempts are unchanged and have no inspection.
- The new solve fields are optional, so older history and backups import as they are.
