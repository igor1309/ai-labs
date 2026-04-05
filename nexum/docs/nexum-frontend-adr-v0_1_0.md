---
title: "ADR: Nexum Frontend Architecture"
date: 2026-04-05
version: 0.1.0
status: accepted
type: adr
---

# ADR: Nexum Frontend Architecture

## Context

Nexum is a private single-user repo memory system. The frontend is one of two separately built and deployed components. This ADR locks the frontend's external contract and internal architecture.

## External Contract

The frontend consumes a REST API with three endpoints. The OpenAPI schema (`nexum-openapi-v1.yaml`) is the locked contract definition.

### Endpoints

- `POST /repos` — add a new repo entry (repoUrl + note)
- `GET /repos` — read the full snapshot array
- `PATCH /repos/{id}/note` — edit a repo's note

### Response Conventions

- `POST` and `PATCH` return `{ ok: true }` on success. The frontend re-reads via `GET` to update the table.
- `POST` returns `409` with `{ existingId }` on duplicate.
- All errors use a uniform envelope: `{ error: true, code, message }`.

### Auth

Bearer token in `Authorization` header. The frontend knows nothing about the auth provider.

### No Server-Side Query

`GET /repos` accepts no query parameters. Sorting and search are client-side operations over the returned snapshot array.

## Internal Architecture

### State Machine

The state machine is the core of the frontend. All state lives here.

**State:**

- `repoTable` — the snapshot data (array of repo entries from last `GET`)
- `fetchState` — `GET` operation status (idle / loading / success / error)
- `postState` — `POST` or `PATCH` operation status (idle / loading / success / error)
- `query` — current search string and sort parameters

**Reducer:** Pure synchronous function. Handles all state transitions — user typed in search, toggled sort column, toggled sort direction, cleared an error, received a response.

**Effect handler:** Handles async transitions. Triggered by actions like "add repo" or "load table." Dispatches results back into the reducer. Does not know how async work is performed — it calls injected collaborators.

### Effect Handler Collaborators

The effect handler depends on three protocol-level collaborators:

- `addRepo(url, note)` → success / duplicate(existingId) / error
- `getRepos()` → [RepoEntry] / error
- `editNote(id, note)` → success / error

These are the effect handler's entire async surface. It does not know about HTTP, network, or auth.

### Services

Each collaborator has a concrete implementation that depends on the HTTP client protocol.

- `AddRepoService` — implements `addRepo`, depends on `HTTPClient`
- `GetReposService` — implements `getRepos`, depends on `HTTPClient`
- `EditNoteService` — implements `editNote`, depends on `HTTPClient`

The three services share the same `HTTPClient` protocol as a dependency. This is shared dependency for simplicity, not coupling — each service could use a different HTTP implementation if needed.

### HTTP Client and Request Signing

`HTTPClient` is a protocol. The concrete implementation handles raw HTTP requests.

`SigningAdapter` wraps a concrete `HTTPClient`, injecting the Bearer token into every request. It conforms to the same `HTTPClient` protocol. Services receive the signing adapter — they never see the raw client or know that signing exists.

### UI

The UI renders the state machine's current state and dispatches actions into it. It knows nothing about services, effects, or the network.

Async indicators (loading/error for reads and writes) are derived directly from `fetchState` and `postState` — a cross-cutting UI concern, not a domain concept.

### Composition Root

The app entry point wires everything:

```
ConcreteHTTPClient
       │
       ▼
SigningAdapter(httpClient) ← conforms to HTTPClient protocol
       │
       ├──▶ AddRepoService(httpClient)  ─┐
       ├──▶ GetReposService(httpClient)  ─┼──▶ EffectHandler(addRepo, getRepos, editNote)
       └──▶ EditNoteService(httpClient)  ─┘                    │
                                                               ▼
                                              StateMachine(reducer, effectHandler)
                                                               │
                                                               ▼
                                                          UI(stateMachine)
```

Cross-cutting concerns (logging, error tracking) are composed here — as HTTP client decorators, effect handler wrappers, or both.

## Key Principles

- **Client owns interfaces.** The frontend defines the protocols it consumes. Backend conforms to them.
- **Dependency inversion.** Services depend on the `HTTPClient` protocol, not a concrete implementation. The effect handler depends on collaborator protocols, not services directly. Auth is injected via adapter, not known by consumers.
- **Single responsibility.** Reducer: sync state transitions. Effect handler: async orchestration. Services: endpoint-specific request/response mapping. Signing adapter: auth header injection. UI: rendering.
- **Composition over configuration.** All wiring happens in the composition root. No service locators, no singletons, no ambient state.