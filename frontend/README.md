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

Frontend smoke tests use Vitest, React Testing Library, and Prism.

The test command starts a Prism mock API from the OpenAPI specification at `docs/api/openapi.yml`, then runs the frontend test suite.

### Run tests locally

```bash
cd frontend
bun install
bun run test
```
