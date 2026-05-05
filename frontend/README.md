# DockPulse Frontend

React + TypeScript + Vite

## Getting started

```bash
bun install
bun run dev
```

The dev server starts at `http://localhost:5173`. API requests to `/api/*` are proxied to the backend at `http://localhost:8000`.

## Working with the API

**Real backend** -- run `docker compose up` from the repo root first, then:

```bash
bun run dev
```

**Mock backend** -- no backend needed:

```bash
bun run dev:mock
```

Starts a Prism mock server from the OpenAPI spec and proxies to it automatically.

## Commands

| Command            | What it does                                |
| ------------------ | ------------------------------------------- |
| `bun run dev`      | Start dev server (proxies to real backend)  |
| `bun run dev:mock` | Start dev server with mock API              |
| `bun run build`    | Production build to `dist/`                 |
| `bun run check`    | Type-check with tsc                         |
| `bun run lint`     | Lint with Biome                             |
| `bun run lint:fix` | Lint + auto-fix                             |
| `bun run format`   | Format with Biome                           |
| `bun run gen:api`  | Generate TypeScript types from OpenAPI spec |

## IDE setup

[VS Code](https://code.visualstudio.com/) + [Biome extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)

## Frontend Tests

Frontend tests use Vitest, React Testing Library, and stubbed `fetch`/`EventSource`.
The structure mirrors the backend test suite: shared fixtures and factories live
alongside the test files and exercise the same flows the running app does.

| Layer        | Backend equivalent                | Frontend equivalent                                       |
| ------------ | --------------------------------- | --------------------------------------------------------- |
| Test runner  | `pytest`                          | `vitest run`                                              |
| HTTP harness | `httpx.AsyncClient` over ASGI app | `mockFetch` helper + `@testing-library/react`             |
| Streams      | aiomqtt test stubs                | `FakeEventSource` mock with `emit`/`emitOpen`/`emitError` |
| Fixtures     | `tests/conftest.py`               | `src/test/setup.ts`, `src/test/helpers.tsx`               |
| Factories    | `tests/_helpers.py`               | `makeBerth`, `makeUser`, `makeEvent`, `buildAuthContext`  |
| Coverage     | `pytest-cov` (`fail_under = 80`)  | `@vitest/coverage-v8` (`thresholds.lines = 80`)           |

Tests live next to the source they exercise:

```
src/
  __tests__/                  app + HarborMap entry tests
  components/__tests__/       UI panels + layout chrome
  hooks/__tests__/            data hooks (fake timers + mocked fetch/EventSource)
  lib/__tests__/              pure helpers
  pages/__tests__/            page components (Dashboard, Settings)
  test/                       shared setup, factories, EventSource mock
```

### Run tests locally

```bash
cd frontend
bun install
bun run test           # full suite (boots Prism alongside vitest, mirrors CI)
bun run test:watch     # vitest watch mode, no Prism
bun run test:cov       # full suite with v8 coverage report
```

### Writing new tests

- Reach for `renderWithAuthLayout` whenever a component uses `useOutletContext`.
- Use `mockFetch((url, init) => ...)` to replace the network layer; combine with
  `jsonResponse` / `errorResponse` from `src/test/helpers.tsx`.
- For SSE-driven hooks, drive the `FakeEventSource` via `getLastEventSource()`
  and call `emit("berth.update", payload)`.
- Keep factory builders in sync with `src/api-types.ts` — when a schema changes,
  the type checker catches stale fixtures.
