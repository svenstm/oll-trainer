# Sunetzu — OLL Trainer

**<https://sunetzu.com>** · the trainer itself lives at
**<https://sunetzu.com/oll-trainer>**

Practice all 57 OLL cases, with an adaptive `learn` mode that schedules the
cases you are slowest and least sure on. Installable, and works offline.

The name is a pun — [Sune](https://www.speedsolving.com/wiki/index.php/Sune),
the best-known OLL case, and Sun Tzu — so the landing page is written in the
register that invites.

Three modes:

- **Train** — random cases from your selection.
- **Recap** — each selected case in turn.
- **Learn** — ARTS adaptive scheduling, backed by a durable solve history that
  survives clearing the session and days away from the app.

In every mode, a case you look at and blank on gets **I don't know** (or `i`)
rather than a guess. It shows you the algorithm and holds the setup on screen,
so you can run it against the cube already in your hands as many times as you
like — and it tells the scheduler the one thing a stopwatch cannot.

## Credit

The original OLL trainer, and the idea this app rebuilds, are the work of
**Roman Strakhov** (<https://github.com/Roman-/oll_trainer>). This is an
independent rewrite: none of its code, scramble data, or images are used here.
The case data in `src/core/data/` is generated from first principles by the
scripts in `scripts/`.

## Your data

Solves are stored in your browser and nowhere else — there is no account and
no server. The history is also the adaptive scheduler's whole memory, and it
cannot be reconstructed, so **Export data** on the case list writes a JSON
backup. Importing merges by solve id: restoring onto a fresh browser works,
importing the same file twice changes nothing, and two devices can be merged
without either losing anything.

## Development

```sh
pnpm install
pnpm dev            # dev server
pnpm test           # unit tests (node) + component tests (happy-dom)
pnpm type-check
pnpm lint
pnpm build          # production build into dist/
pnpm preview
pnpm verify:offline # build, then prove the PWA works with the network cut
```

`pnpm verify:offline` is the only check that reaches the "works offline"
claim above. It serves the build the way GitHub Pages does — under a base
path, with no SPA rewrite — installs the service worker in headless Chrome,
cuts the renderer's network, and then boots the app cold at the root and at a
deep link. It needs a local Chrome (set `CHROME_PATH` if it cannot find one)
and so runs by hand rather than in CI.

### Layout

- `src/core/` — pure TypeScript: cube model, patterns, scrambles, timer
  reducer, ARTS. No Vue, no DOM, no globals. Tested in the `node` environment.
- `src/stores/` — Pinia stores, `localStorage`-backed.
- `src/components/`, `src/views/` — the UI. `LandingView` is the public page at
  `/`; `SelectionView` (`/oll-trainer`) and `PracticeView`
  (`/oll-trainer/practice/:mode`) are the app. Component tests are
  `*.dom.test.ts` and run under happy-dom.
- `src/router/` — exports its `routes` table so the view tests drive the real
  one instead of restating it.
- `scripts/` — dev-only data generation and the offline check, run by hand;
  generated output is committed.

The plan this was built against lives in [`docs/PLAN.md`](docs/PLAN.md), kept
as written. Where the finished app departs from it, and why, is recorded in
[`docs/plan-deviations.md`](docs/plan-deviations.md); the scheduler's tuning is
in [`docs/arts-recalibration.md`](docs/arts-recalibration.md).

### Regenerating the data

`src/core/data/` is generated and committed; the app never runs the generators.

```sh
pnpm data:cases       # enumerate, bind to the standard numbering, verify, write
pnpm data:scrambles   # ~20 verified scrambles per case, via cubing
pnpm data:print       # draw all 57 derived patterns as ASCII, for eyeballing
pnpm arts:simulate    # synthetic multi-day timelines for scheduler tuning
```

`pnpm data:cases` refuses to write anything unless all 57 hand-entered
algorithms bind to exactly the 57 independently enumerated orientation
classes.

## Licence

MIT — see [LICENSE](LICENSE).
