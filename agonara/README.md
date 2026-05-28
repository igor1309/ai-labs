---
date: 2026-05-27
model: gpt-5
description: "Agonara backend and product docs for a structured learning program environment"
---

# Agonara

Structured learning program environment with the first Identity and Operations slice implemented.

## Description

Helps curators assemble and maintain learning programs from trusted sources, while learners progress through them with clear sequence, checkpoints, and evidence of mastery. AI assists program construction and learning support but does not own the curriculum.

## Stack

- Node.js 22 backend workspace
- SQLite persistence through `better-sqlite3`
- HTTP API with server-side sessions, CSRF protection, request correlation, health, diagnostics, and audit responses
- Operator CLI for bootstrap status and first-Admin bootstrap
- Docker image and Compose service for private self-hosted operation

## Key Separations

- **Program corpus** (topics, concepts, materials, checks, criteria) is owned by the curator
- **Student state** (answers, attempts, progress, weak areas) is owned by the learner
- **LLM output** is assistant material until a human accepts it
- **Identity** is the stable ownership and attribution subject
- **Admin** is instance-scoped operational authority, separate from program participation
- **Program Membership** owns program participation lifecycle and policy

## Identity Operations Demo

Run these commands from the repository root. The local shell on some machines may default to a newer Node version, so the examples pin the project-declared Node 22 runtime when it is installed through `nvm`.

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
npm install
rm -f /tmp/agonara-demo.sqlite /tmp/agonara-cookies.txt
```

Check whether first-Admin bootstrap is still available:

```bash
AGONARA_BOOTSTRAP_SECRET=operator-secret AGONARA_DB_PATH=/tmp/agonara-demo.sqlite node agonara/src/cli.js identity bootstrap-status --json
```

Expected shape:

```json
{"status":"accepted","value":{"available":true}}
```

Bootstrap the first Admin through the CLI. Secrets are read from JSON stdin so they do not appear in CLI arguments.

```bash
printf '%s' '{"bootstrapSecret":"operator-secret","password":"correct horse battery staple"}' | AGONARA_BOOTSTRAP_SECRET=operator-secret AGONARA_DB_PATH=/tmp/agonara-demo.sqlite node agonara/src/cli.js identity bootstrap-admin --display-name 'Root Admin' --login admin@example.test --stdin-json --json
```

Start the HTTP API against the same demo database:

```bash
AGONARA_BOOTSTRAP_SECRET=operator-secret AGONARA_DB_PATH=/tmp/agonara-demo.sqlite HOST=127.0.0.1 PORT=18080 npm start --workspace agonara
```

In another shell, verify operations health and sign in:

```bash
curl -s http://127.0.0.1:18080/operations/health
curl -s -c /tmp/agonara-cookies.txt -X POST http://127.0.0.1:18080/identity/sessions -H 'content-type: application/json' --data '{"login":"admin@example.test","password":"correct horse battery staple"}'
```

Capture the CSRF token from that login response, then exercise an Admin operation:

```bash
LOGIN_RESPONSE=$(curl -s -c /tmp/agonara-cookies.txt -X POST http://127.0.0.1:18080/identity/sessions -H 'content-type: application/json' --data '{"login":"admin@example.test","password":"correct horse battery staple"}')
CSRF=$(printf '%s' "$LOGIN_RESPONSE" | node -e 'let body = ""; process.stdin.on("data", chunk => body += chunk); process.stdin.on("end", () => console.log(JSON.parse(body).value.csrfToken));')
curl -s -b /tmp/agonara-cookies.txt -H "x-agonara-csrf: $CSRF" -H 'content-type: application/json' -X POST http://127.0.0.1:18080/identity/identities --data '{"displayName":"Second Identity"}'
curl -s -b /tmp/agonara-cookies.txt http://127.0.0.1:18080/identity/audit-events
```

The first Admin can create identities and inspect audit events. Mutating Admin endpoints require both the session cookie and `x-agonara-csrf`.

## Docker Demo

The container persists SQLite state under `/data` and refuses to start without an operator bootstrap secret.

```bash
docker build -t agonara:local agonara
docker run --rm -p 127.0.0.1:18080:8080 -e AGONARA_BOOTSTRAP_SECRET=operator-secret agonara:local
```

Compose exposes the same service on `127.0.0.1:18080` with a named volume:

```bash
AGONARA_BOOTSTRAP_SECRET=operator-secret docker compose -f agonara/compose.yaml up --build
```

## Admin Board Demo

The Admin operations board is served by the same Agonara runtime at `/admin`. Start the local or Docker demo, then open:

```text
http://127.0.0.1:18080/admin
```

On a clean database, use the bootstrap secret from `AGONARA_BOOTSTRAP_SECRET` to create the first Admin. After bootstrap, the board supports sign in, logout, identity creation, local password credential binding, identity disablement, Admin grant/revoke, operational access inspection, and audit event inspection. Authority decisions and last-Admin protection remain owned by the HTTP API.
