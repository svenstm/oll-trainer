# OLL Trainer — Vue rewrite plan

Status: agreed, not started · 2026-09-06

A ground-up rewrite of the vanilla-JS OLL trainer at
`~/Documents/workspace/oll_trainer` (branch `adaptive-case-selection`) as a
Vue 3 + TypeScript + Vite application, with a redesigned UI and independently
generated case data.

The old repo is **reference only**. It is never a build dependency and no code,
scramble data, or SVG asset is copied from it.

---

## 1. Goals

1. Same trainer, better bones: typed domain logic, unit-tested, no globals.
2. A UI that is pleasant to look at and usable on a phone.
3. `learn` mode (ARTS adaptive scheduling) becomes genuinely long-term — memory
   state survives clearing the session and survives days away.
4. All case data generated from first principles, so the project has clean
   provenance and can be published.

### Non-goals

- Feature parity with the old settings panel (arbitrary colour pickers are gone).
- Accounts, sync, or a backend of any kind.
- WCA inspection or +2/DNF penalties.
- Import/export of history (see §12 — flagged as a risk, deliberately excluded).

---

## 2. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | New sibling dir `~/Documents/workspace/oll-trainer`, fresh `git init`, public GitHub repo | Old repo's `origin` is upstream (`Roman-/oll_trainer`), not a fork; a Vue rewrite can never be PR'd back. Old repo stays as a working reference to diff behaviour against. |
| 2 | Light/dark/system theme toggle; timer & scramble size sliders retained | The three free-text colour inputs cannot coexist with a designed stylesheet. Size tuning is a real ergonomic need and is kept as proper sliders. |
| 3 | Durable `solves` history, session is a filtered view | Today `timesArray` is both the session list and the entire ARTS training corpus, so "clear" silently destroys the memory model. Splitting them is what makes spaced repetition possible. |
| 4 | New `ollTrainer.v1.*` localStorage namespace, no legacy migration | Old data lives on a different origin (`file://` / bestsiteever.net) and its `ms` values are DOM-derived and quantised to 10 ms. Not worth importing. |
| 5 | Framework-free `src/core/` + Pinia stores | ARTS, scramble maths, the timer state machine and time formatting are all pure functions. Keeping them Vue-free makes them testable with no DOM and no Pinia instance. |
| 6 | `<OllFace>` renders cases from a 21-slot pattern; no image files | Every one of the 57 old SVGs had identical structure (1 frame + 9 U-face + 12 side stickers, always 9 oriented / 12 unoriented) with hardcoded colours. As data + one component it is theme-aware, animatable, crisp at any size. |
| 7 | Tailwind CSS v4 | User preference. CSS-first config via `@theme`; no `tailwind.config.js`. |
| 8 | vue-router, `/` and `/practice/:mode` | Replaces the magic `practiceMode` number (0–3) and `display:none` toggling. Gives back-button, deep links, and a validated `Mode` union type. |
| 9 | `performance.now()` + rAF, hold-to-ready | Old timer used `setInterval(…, 10)` on `Date.getTime()` and recovered the result by re-parsing `timer.innerHTML`. |
| 10 | Compress long inter-solve gaps sub-linearly | Old code clamps every gap to ≤5 min, which was fine for a session-scoped array but destroys overnight decay once history is durable. See §7. |
| 11 | Deep `core/` unit tests + a few happy-dom component tests | The old app's bugs live in keyboard handling and mode switching, so those need at least smoke coverage. |
| 12 | GitHub Pages + `vite-plugin-pwa` | Preserves the "works offline" property of the original (which relied on opening `index.html` from `file://`, impossible with a bundled SPA) and improves on it. |
| 13 | Results panel: Session tab + Cases tab | Old panel grouped by case only, with no best/worst/ao5/ao12 — unusual for a cubing timer. Per-case grouping is kept because it is what learn mode needs. |
| 14 | Regenerate all case data from first principles | Upstream has **no LICENSE file** (all rights reserved) and its scramble corpus and SVGs are Roman Strakhov's work. Generating our own removes the question entirely. |
| 15 | Bind enumerated patterns → standard numbers/names via 57 canonical algs | Enumeration yields 57 patterns but not the community's numbering. Deriving the binding from algorithms gives a cross-check that catches typos. |
| 16 | Show canonical alg + 2–3 generated alternatives | Machine-optimal algs are often unergonomic. Reproduces the old `a` / `a2` behaviour at no extra cost. |
| 17 | README credit to Roman Strakhov, no in-app footer link; MIT licence | The idea and the app being replaced are his; the code and data are not. The speedsolving thread is his support channel, so it should not be linked from this app. |

---

## 3. Structure

```
oll-trainer/
├─ scripts/                     dev-only, run manually, output committed
│  ├─ enumerate-cases.ts          57 orientation classes from combinatorics
│  └─ generate-scrambles.ts       cubing.js search → ~20 scrambles/case
├─ src/
│  ├─ core/                     PURE TypeScript. No Vue, no DOM, no globals.
│  │  ├─ cube.ts                 facelet model, applyMoves, parse/invert
│  │  ├─ pattern.ts              21-slot OLL pattern, derive from cube state
│  │  ├─ scramble.ts             inverse(), applyRotation(), pickScramble()
│  │  ├─ time.ts                 formatMs(), ao(n), best/worst/mean
│  │  ├─ timer.ts                pure reducer: (state, event, now) => state
│  │  ├─ arts.ts                 buildModel(), pickNext(), pickRotation()
│  │  ├─ types.ts                Solve, OllCase, Mode, Settings…
│  │  └─ data/                   GENERATED, committed
│  │     ├─ cases.ts               id, name, group, pattern, algs
│  │     └─ scrambles.ts           57 × ~20 verified strings
│  ├─ stores/                   Pinia + localStorage persistence
│  │  ├─ solves.ts               durable history + session view + sessionStartTs
│  │  ├─ selection.ts            selected case ids
│  │  └─ settings.ts             theme, sizes, holdMs, tau
│  ├─ components/               dumb: props in, events out
│  │  ├─ OllFace.vue             renders a case from its pattern
│  │  ├─ TimerDisplay.vue
│  │  ├─ ScrambleLine.vue
│  │  ├─ CaseReveal.vue          shown after each solve
│  │  ├─ ResultsPanel.vue        Session / Cases tabs
│  │  ├─ StrengthBar.vue
│  │  ├─ Sparkline.vue           hand-rolled inline SVG, no chart lib
│  │  └─ ThemeToggle.vue
│  ├─ views/
│  │  ├─ SelectionView.vue
│  │  └─ PracticeView.vue
│  └─ router/index.ts
└─ .github/workflows/           ci.yml (typecheck+lint+test), deploy.yml
```

---

## 4. Domain types

```ts
type Mode = 'train' | 'recap' | 'learn'
type Rotation = '' | 'y' | 'y2' | "y'"

/** 21 slots: 9 U-face (row-major), then 12 side stickers (3 per side, B R F L). */
type Pattern = readonly (0 | 1)[] // length 21, exactly 9 oriented

interface OllCase {
  id: number // standard 1..57
  name: string // 'Sune', 'Runway', …
  group: OllGroup // one of the 14 shape groups
  pattern: Pattern
  alg: string // canonical, ergonomic — what the app teaches
  alternatives: string[] // 2–3 shortest generated solutions
}

interface Solve {
  id: string
  caseId: number
  ms: number // true elapsed, full precision
  scramble: string
  rotation: Rotation
  ts: number // wall clock, epoch ms
  mode: Mode
}
```

The 14 groups, sizes summing to 57:
`All Edges Oriented Correctly` (7), `No Edges Flipped Correctly` (8),
`L-Shapes` (6), `Lightning Bolts` (6), `P-Shapes` (4), `I-Shapes` (4),
`Fish-Shapes` (4), `Knight Move Shapes` (4), `Awkward Shapes` (4),
`T-Shapes` (2), `Squares` (2), `C-Shapes` (2), `W-Shapes` (2),
`Corners Correct, Edges Flipped` (2).

---

## 5. Data pipeline (the risky part — build first)

Run manually, output committed. The app never runs this.

**Step 1 — enumerate.** Valid last-layer orientation states: 4 edges each
flipped or not with an even number flipped (2⁴/2 = 8), 4 corners each twisted
0/1/2 summing to 0 mod 3 (3⁴/3 = 27) → 216 states. Quotient by the 4
U-rotations and drop the solved state → exactly **57** classes. (Not a plain
÷4: a few states are fixed by a U-rotation, so count orbits via Burnside rather
than dividing.) Pure combinatorics, no external data.

**Step 2 — bind to standard numbering.** Hand-enter 57 canonical algorithms,
one per case, from an openly-licensed reference. Invert each, apply to a solved
cube, read off its pattern. That pattern binds the case number and name to the
enumerated class.

> Verification: the set of 57 derived patterns must equal the set of 57
> enumerated classes, exactly. Any typo in any algorithm fails this test loudly
> rather than silently producing a wrong case.

**Step 3 — generate scrambles.** For each case, use `cubing`'s search to find
~20 distinct short solutions, invert them into scrambles. `cubing` is
`MPL-2.0 OR GPL-3.0-or-later`; MPL is file-level copyleft and it is a dev
dependency that never ships, so nothing is imposed on this project's code.

**Step 4 — verify.** Every generated scramble, applied to a solved cube, must
yield exactly its own case's pattern with the last layer otherwise solved.
This single test validates the cube model, the enumeration, the alg binding and
the generator against each other.

Additional invariants asserted in tests: ids are exactly 1..57; the 14 groups
are disjoint and their union is all 57; every case has ≥1 scramble; every move
matches `/^[URFDLB][2']?$/`; every pattern has exactly 9 of 21 oriented; the
count of unoriented U-face stickers equals the count of oriented side stickers.

Note: the old `algsmap.js` contained no wide or slice moves, so the old
rotation remap (a case-insensitive regex over `R/F/L/B`) happened to be safe.
The new `applyRotation` is token-based, because the algorithms _do_ contain
`r`/`f`/`l` and that regex would corrupt them.

---

## 6. Persistence

```
ollTrainer.v1.schema     : 1
ollTrainer.v1.solves     : Solve[]        ← durable, ARTS replays this
ollTrainer.v1.selection  : number[]
ollTrainer.v1.settings   : { theme, timerSize, scrambleSize, holdMs, tau }
ollTrainer.v1.session    : { startedAt: number }
```

- Session view = `solves.filter(s => s.ts >= session.startedAt)`.
- **Clear session** sets `startedAt = now`. Non-destructive.
- **Reset progress** empties `solves`. Confirmed, destructive, clearly separated
  in the UI from the above.
- Solves from all three modes feed the ARTS history, as in the old app.

---

## 7. ARTS changes

Port `arts.js` faithfully — activation `ln Σ dtᵏ^-dₖ`, alpha nudged by the
bounded log-ratio of actual to predicted recall time, Theil–Sen fit of
turns-per-second for execution floors, `introEvery` coverage guard, spacing
hold on recently-served cases — with one substantive change and one open
tuning task.

**Change: gap handling.** Replace the flat `min(gap, min(3·medGap, 5 min))`
clamp with

```
vtDelta = gap ≤ SESSION_GAP ? gap
                            : SESSION_GAP + K·ln(1 + (gap − SESSION_GAP)/K)
SESSION_GAP = 600 s,  K = 600 s
```

so a break within a sitting is real time, an hour ≈ 1675 s, a night ≈ 2922 s,
a month ≈ 5623 s. Long absences still decay, monotonically, without
annihilating every case at once.

**Open tuning task (phase 2).** The constants (`tau = −0.8`, `c = 0.25`,
`F = 0.9`, `alphaInit = 0.30`) were fitted against a _within-session_ timeline
where gaps ranged 20 s – 20 min. On a durable timeline, after any real break
almost every case sits below `tau`, so "at risk" stops discriminating. The
selection _ordering_ (serve the lowest activation first) is scale-robust and is
what actually drives the schedule; `tau` should be re-read as an
introduction/display threshold and recalibrated once the compression is in.
Do not assume the compression alone fixes this — verify with synthetic
multi-day timelines in tests.

---

## 8. Timer contract

```
idle    ─space↓─▶ holding ──holdMs──▶ ready (green)
                     └── release early ──▶ idle
ready   ─space↑─▶ running
running ─any key↓─▶ stopped   (record solve, show reveal, draw next scramble)
stopped ─key↑───▶ idle
```

- `holdMs` default 300, settable to 0 to reproduce the old feel.
- Elapsed time from `performance.now()` deltas; rAF drives the display only.
- `Solve.ms` is the true value, never re-parsed from rendered text.
- Touch: `touchstart` = hold/stop, `touchend` = start (as today).
- Implemented as a pure reducer in `core/timer.ts`, tested with no DOM.

Hotkeys carried over: `Delete` removes last solve, `Shift+Delete` clears
session, `Esc` closes overlays, plus the "unselect this case" action during
practice.

---

## 9. UI

**SelectionView** — the 57 cases as `<OllFace>` tiles grouped by shape, click a
tile to toggle, click a group header to toggle the group, a select-all/none
control, and Train / Recap / Learn actions. Responsive grid, not a fixed table.

**PracticeView** — scramble line, large timer, results panel, and after each
solve a `CaseReveal` showing the face, number, name, canonical alg and
alternatives. Learn mode additionally shows the status line
(`n / 57 introduced · m at risk`) and the gentle↔eager `tau` slider in settings.

**ResultsPanel** — two tabs:

- _Session_: count, mean, best, worst, ao5, ao12, then solves newest-first.
- _Cases_: grouped by case with per-case mean, strength bar (learn mode),
  and a sparkline of that case's times over the durable history.

Deleting a solve is a hover `×` plus an undo toast — no `confirm()` dialogs
anywhere.

---

## 10. Tests

`core/` (node environment, deterministic via injected clock and RNG):

- cube model: move parsing, inversion round-trips, applyMoves
- enumeration produces exactly 57 classes
- alg-derived patterns == enumerated patterns (57/57)
- every generated scramble reproduces its case's pattern
- data invariants (ids, groups disjoint & complete, move regex, 9-of-21)
- `applyRotation` is token-based and leaves wide moves intact
- `formatMs`, `ao(n)` edge cases (fewer than n solves, trimming)
- timer reducer: every transition, early release, stop-on-any-key
- ARTS on synthetic timelines: decay ordering, unseen-case introduction,
  `introEvery` starvation guard, spacing hold, alpha bounds, gap compression
  monotonicity, multi-day behaviour

`stores/`: persistence round-trip, session/durable split, clear-vs-reset.

`components/` (happy-dom, `*.dom.test.ts`): keyboard wiring, selection grid
toggling, route guard on empty selection, results tab switching.

Vitest defaults to the `node` environment; only `*.dom.test.ts` uses happy-dom.

---

## 11. Phases

**Phase 1 — scaffold**

- `pnpm create vue@latest oll-trainer` → TS, Router, Pinia, Vitest, ESLint,
  Prettier (no JSX, no e2e)
- add Tailwind v4 (`@tailwindcss/vite`, `@theme`, `@custom-variant dark`
  bound to `data-theme`), `vite-plugin-pwa`, `happy-dom`, `@vue/test-utils`,
  `cubing` (dev)
- `base: '/oll-trainer/'`, router on `import.meta.env.BASE_URL`, PWA scope and
  `start_url` matching, `404.html` fallback emitted for Pages
- `ci.yml` and `deploy.yml`
- README with credit, `LICENSE` (MIT)

**Phase 2 — core + data**

- cube model, pattern, enumeration
- 57 canonical algs, binding, cross-check test
- scramble generation, verification, commit generated data
- scramble/time/timer/ARTS modules with their tests
- ARTS constant recalibration against synthetic multi-day timelines

**Phase 3 — stores + views**

- three stores with persistence
- router, guards, SelectionView, PracticeView
- timer wiring, results panel, case reveal

**Phase 4 — polish + deploy**

- `OllFace` visual design, theme tokens, mobile layout
- sparklines, undo toasts, transitions
- PWA icons/manifest, deploy, verify offline

---

## 12. Risks & open items

**No export/import — flagged, deliberately excluded.** With no migration path,
no account, and history now durable and long-lived, a cleared browser profile
or a new laptop erases everything, and the ARTS model _is_ that history. Roughly
30 lines and one button. Recommend reconsidering before phase 3 ships.

**ARTS recalibration is real work,** not a constant tweak — see §7.

**Canonical algorithm entry is 57 manual lines** and the one place a human typo
enters the pipeline. The cross-check test is what makes that safe; do not skip
or weaken it to get the data landed faster.

**GitHub Pages + history routing** 404s on hard refresh of a deep link. The
deploy workflow must emit `404.html` as a copy of `index.html`.

**PLAN.md placement:** `pnpm create vue@latest` refuses (or offers to wipe) a
non-empty target directory. At phase 1, move this file aside, scaffold, then
restore it to `docs/PLAN.md`.
