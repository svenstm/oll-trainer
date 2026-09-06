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

## Licence

MIT — see [LICENSE](LICENSE).
