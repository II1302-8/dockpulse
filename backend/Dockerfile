FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

FROM base AS builder
ENV UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON=python3.12
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM base AS runtime
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY --chown=app:app backend/app /app/app/
COPY --chown=app:app backend/alembic /app/alembic/
COPY --chown=app:app backend/alembic.ini backend/pyproject.toml backend/uv.lock /app/
COPY --chown=app:app docs/api/openapi.yml /docs/api/openapi.yml
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; r=urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=3); sys.exit(0 if r.status<500 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
