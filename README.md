# OLL Trainer

Practice all 57 OLL cases, with an adaptive `learn` mode that schedules the
cases you are slowest and least sure on.

Three modes:

- **Train** — random cases from your selection.
- **Recap** — each selected case in turn.
- **Learn** — ARTS adaptive scheduling, backed by a durable solve history that
  survives clearing the session and days away from the app.

## Credit

The original OLL trainer, and the idea this app rebuilds, are the work of
**Roman Strakhov** (<https://github.com/Roman-/oll_trainer>). This is an
independent rewrite: none of its code, scramble data, or images are used here.
The case data in `src/core/data/` is generated from first principles by the
scripts in `scripts/`.

## Development

```sh
pnpm install
pnpm dev            # dev server
pnpm test           # unit tests (node) + component tests (happy-dom)
pnpm type-check
pnpm lint
pnpm build          # production build into dist/
pnpm preview
```

### Layout

- `src/core/` — pure TypeScript: cube model, patterns, scrambles, timer
  reducer, ARTS. No Vue, no DOM, no globals. Tested in the `node` environment.
- `src/stores/` — Pinia stores, `localStorage`-backed.
- `src/components/`, `src/views/` — the UI. Component tests are `*.dom.test.ts`
  and run under happy-dom.
- `scripts/` — dev-only data generation, run by hand; output is committed.

The plan this is being built against lives in [`docs/PLAN.md`](docs/PLAN.md).
The scheduler's tuning is recorded in
[`docs/arts-recalibration.md`](docs/arts-recalibration.md).

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
