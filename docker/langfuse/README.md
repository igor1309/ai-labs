# docker/langfuse

Shared Langfuse v3 Docker Compose stack for local tracing and cost tracking across ai-labs projects.

```bash
cp docker/langfuse/.env.example docker/langfuse/.env
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d
docker compose -f docker/langfuse/docker-compose.yml down
```
