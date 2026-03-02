---
date: 2026-04-2
source: https://www.perplexity.ai/search/is-dockerized-service-exposed-tKiEOj0USOWVEqgsHbVALQ
---

# based on this discussion create ready to download markdown doc that would help ai-agent to draft web scout spec

Below is a self‑contained markdown doc you can save as e.g. `web-scout-mcp-spec.md` and feed to an AI agent as context when drafting a more formal spec.

***

# Web Scout MCP Architecture Draft

> Working notes for an AI agent to draft a detailed specification for a “Web Scout” system, implemented as Dockerized services exposed via a unified local MCP gateway.

## 1. Goals

Web Scout is an AI‑driven “web search and enrichment” capability exposed to MCP‑capable clients (Claude Desktop, Cursor, etc.) as one or more tools. The key properties:

- Runs search and enrichment engines in **Docker containers**.
- Exposes them as **MCP servers**, ideally behind a **single gateway/profile**.
- Provides a path from **single‑user local** to **multi‑user / remote** deployments.
- Avoids hard‑coding secrets in images; prefers centralized auth/secret handling.

The spec the agent should draft should describe both local‑dev and production‑ish setups.

## 2. High‑level architecture

### 2.1 Components

- **Search engine container(s)**
    - Example: `searxng` container, or any HTTP search API.
    - Internal HTTP API, not MCP‑aware.
- **Web Scout MCP adapter(s)**
    - One MCP server responsible for “web search” tools (e.g., `search_web`, `get_page`, `extract_snippets`).
    - Implemented in Node/Python/Go; **speaks MCP to the client** and HTTP to search backends.
    - Packaged as a Docker image.
- **(Optional) other service adapters**
    - Internal APIs (e.g., product catalog, analytics).
    - Each wrapped by its own MCP server, also Dockerized.
- **Unified MCP gateway (recommended)**
    - Presents a **single MCP endpoint/profile** to clients.
    - Fan‑out to multiple MCP servers (web‑scout, internal APIs, etc.).
    - Central place for auth, secrets, and tool‑level policy.
- **MCP client(s)**
    - IDEs, desktop apps, or headless LLM “agent runners”.
    - Configured with **one profile** pointing at the gateway.


### 2.2 Two deployment tiers

The spec should distinguish:

1. **Local developer setup (single user)**
    - Search engine in Docker.
    - Web Scout MCP adapter run either:
        - directly (stdio) with `npx` / `python`, or
        - as a Docker container.
    - Client connects directly to the MCP adapter, or via a simple gateway.
2. **Gateway‑based setup (multi‑tool / multi‑user)**
    - All MCP servers run in containers.
    - A gateway exposes one MCP endpoint/profile.
    - OAuth/secret management centralized at the gateway.

The agent should produce separate sections for both.

## 3. MCP modelling

### 3.1 Tools (MCP level) for Web Scout

The Web Scout MCP adapter should expose tools similar to:

- `search_web`
    - Input: query string, optional filters (language, time window, max results).
    - Output: structured list of results (title, URL, snippet, score, source engine).
- `get_page`
    - Input: URL.
    - Output: normalized HTML/text, metadata (title, headings).
- `extract_facts`
    - Input: URL or raw text, extraction schema (e.g., “product info”, “Q\&A”, “timeline”).
    - Output: structured JSON following requested schema.
- `run_pipeline` (optional)
    - Input: high‑level task (“compare framework X vs Y”), optional constraints.
    - Behaviour: orchestrates multiple search + fetch + extract steps and returns aggregated facts.

The spec should leave room for extension but define at least `search_web` and `get_page` clearly.

### 3.2 Transport choices

The agent should propose:

- **Local dev default**
    - **STDIO MCP** from client to Web Scout MCP process (for minimal friction).
    - Docker used only for the search engine (e.g., SearXNG container).
- **Gateway / production default**
    - Gateway exposed as STDIO or HTTP MCP endpoint to clients.
    - Gateway talks to MCP servers via:
        - STDIO (child processes) or
        - HTTP (remote servers) depending on deployment.

The spec should explain how to migrate from direct stdio to gateway without changing tool semantics.

## 4. Dockerization strategy

### 4.1 Containers to define

At minimum:

- `web-scout-search`
    - Image: search engine (e.g., SearXNG or a custom search API).
    - Ports: internal HTTP port (e.g., `8080`).
    - Config: bind‑mounted config file or environment‑driven settings.
- `web-scout-mcp`
    - Image: MCP adapter.
    - Entrypoint: launches MCP server process.
    - Environment:
        - URL of `web-scout-search`.
        - Credentials for external APIs if used.

Optional for gateway setup:

- `mcp-gateway`
    - Image: generic MCP gateway or equivalent.
    - Config: list of backend MCP servers and their tool names.


### 4.2 Local `docker compose` sketch

The agent can emit something along these lines:

```yaml
services:
  searxng:
    image: searxng/searxng:latest
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro

  web-scout-mcp:
    image: myorg/web-scout-mcp:latest
    environment:
      SEARXNG_URL: http://searxng:8080
    # Optionally expose HTTP MCP; for stdio, you just run it as a process
    # ports:
    #   - "127.0.0.1:7000:7000"
```

The spec should clearly state:

- For **stdio**, MCP clients spawn `web-scout-mcp` directly (no port).
- For **HTTP**, clients or gateways call `http://localhost:7000/mcp` (or similar).


## 5. Unified MCP gateway design

The agent should describe how to put a gateway in front of multiple Dockerized MCP servers, exposing them via one profile.

### 5.1 Responsibilities

- Present a single MCP endpoint to clients.
- Maintain a registry: `tool_name` → backend MCP server.
- Start/stop MCP servers (containers or processes), or connect to long‑running ones.
- Merge the tool lists from all backends.
- Optionally:
    - Handle user authentication.
    - Enforce tool‑level policies (who can call what).
    - Perform token exchange / secret injection for outgoing calls.


### 5.2 Profile concept

For each MCP client “profile”, the gateway config might define:

- Which backends are **enabled**.
- User/role‑specific visibility for tools.
- Environment/credential config used when starting backends.

The spec should ask the agent to:

- Define a **profile schema** (YAML/JSON) with at least:
    - Profile ID/name.
    - Enabled backends list.
    - Per‑backend config overrides (e.g., rate limits, timeouts).


### 5.3 Tool routing

The gateway should:

- On startup or on first use:
    - Ask each backend MCP server for its `list_tools`.
    - Build an internal map from tool name → backend handle.
- On `call_tool` from the client:
    - Look up which backend handles that tool.
    - Forward the call and return the response.
    - Optionally log usage per profile / per user.

The spec should state that **tool names must be unique** across backends or namespaced (`web_scout.search`, `internal.search`) to avoid collisions.

## 6. Auth and secrets

The spec should explicitly address auth differences between “pure local” and “Docker/gateway” setups.

### 6.1 Local dev (single user)

- Web Scout MCP adapter can read secrets from:
    - Local env vars,
    - A `.env` file,
    - Or client‑side configuration (if safe).
- Search engine containers (e.g., SearXNG) may not need secrets if unspecialized.
- No user identity; calls are effectively “trusted local user”.


### 6.2 Gateway / multi‑user

The agent should propose patterns like:

- **Gateway owns user auth**
    - Users authenticate with the gateway (OAuth/OIDC).
    - Gateway stores tokens/keys in a secure store.
    - Web Scout MCP container receives only:
        - Narrowly scoped tokens, or
        - Service account credentials, not raw user tokens.
- **Per‑tool scopes**
    - Certain tools (`run_pipeline` that posts to external systems) can require higher scopes or explicit user consent.
    - Gateway enforces these before forwarding calls.
- **Secret handling**
    - No credentials baked into images.
    - Use environment injection at runtime, secrets mounts, or a secrets manager.
    - Distinguish between:
        - User‑bound secrets (per user).
        - Service‑bound secrets (shared).

The spec should ask the agent to enumerate minimal security requirements and nice‑to‑have controls.

## 7. Client integration

The specification should include examples for typical MCP clients.

### 7.1 Direct Web Scout MCP (no gateway)

Example config entry (pseudo‑JSON):

```jsonc
"mcpServers": {
  "web-scout": {
    "command": "npx",
    "args": ["-y", "web-scout-mcp"],
    "env": {
      "SEARXNG_URL": "http://localhost:8080"
    }
  }
}
```


### 7.2 Via gateway

Example where the client only knows about a single gateway:

```jsonc
"mcpServers": {
  "gateway": {
    "command": "mcp-gateway",
    "args": ["--profile", "default"]
  }
}
```

Inside the gateway’s own config, the `web-scout-mcp` backend is registered and started as needed.

The agent should generate concrete examples for:

- At least one IDE / desktop client.
- A headless “agent runner” using an MCP‑aware SDK.


## 8. Non‑functional requirements for Web Scout

The spec should cover:

- **Latency targets**
    - E.g., `search_web` should aim for < 3–5 seconds P95 for typical queries with a limited backend set.
- **Resilience**
    - If SearXNG / backend is down, the MCP adapter should return structured error messages, not crash.
- **Rate limiting**
    - Optional: per profile / per user rate limits to avoid abusing external sites/APIs.
- **Logging \& observability**
    - Basic request/response logging (sanitized).
    - Metrics: number of queries, error rates by backend.
- **Configuration**
    - YAML/JSON config file for Web Scout MCP (backend URL, timeouts, filters).
    - Config reload story (restart vs live reload).


## 9. Migration path

The agent should include a “migration/extension” section:

- Start with:
    - SearXNG container + Web Scout MCP running as a local process (stdio).
    - One client configured directly to that MCP server.
- Then evolve to:
    - Web Scout MCP containerized.
    - Gateway in front, exposing Web Scout + additional MCP servers.
    - Optional: move gateway to a server and talk over HTTP MCP.
- Future‑proofing:
    - Ensure Web Scout MCP can be run both as:
        - a child process (stdio), and
        - a standalone HTTP server (for gateways / remote use).

***

**Instruction for the AI agent:**
Use this document as a checklist. Turn each section into a concrete specification with:

- Clear API schemas for MCP tools (inputs/outputs).
- Concrete config file formats.
- Example deployment manifests (compose, k8s, systemd).
- Security considerations and recommended defaults.
- At least one detailed “end‑to‑end” sequence diagram: client → gateway → Web Scout MCP → search backend → back.
