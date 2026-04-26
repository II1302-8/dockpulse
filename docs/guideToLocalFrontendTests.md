## Frontend Tests

Frontend smoke tests use Vitest, React Testing Library, and Prism.

The test command starts a Prism mock API from the OpenAPI specification at `docs/api/openapi.yml`, then runs the frontend test suite.

### Run tests locally

```bash
cd frontend
bun install
bun run test