# Deploying to Railway

> Status: **planned** — this guide will be written once local `docker compose up` is validated (Step 6 of v1.1).

## What will happen

Railway detects `docker-compose.yml` at the repo root and provisions each service as a separate Railway service in the same project. The postgres, embeddings, and reranker services become persistent Railway services; the api and ui services deploy from their respective Dockerfiles.

The main Railway documentation for this flow:
https://railway.app/docs/deploy-from-github

## Anticipated steps

1. Push the repo to GitHub.
2. Create a new Railway project → "Deploy from GitHub repo".
3. Railway parses `docker-compose.yml` and creates five services.
4. Set `ANTHROPIC_API_KEY` as a project-level secret in Railway's environment variables panel.
5. The `api` service's `DATABASE_URL`, `EMBEDDINGS_BASE_URL`, and `RERANKER_BASE_URL` will need to reference Railway's internal service hostnames instead of the compose service names. Railway injects these automatically when services reference each other.
6. Assign a public domain to the `ui` service. Leave the rest private.

## Known gaps to resolve before writing this guide

- Whether Railway's docker-compose support handles `depends_on: condition: service_healthy` or requires a manual workaround.
- Memory requirements: `bge-m3` needs ~5 GB RAM; Railway's hobby plan caps at 8 GB per service.
- Cold-start latency: model weights download from HuggingFace on first deploy. Railway volumes persist them on subsequent deploys.

This file becomes a full guide in the v1.2 deployment task.
