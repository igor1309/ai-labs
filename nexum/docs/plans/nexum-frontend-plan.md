---
date: 2026-04-13
model: claude-opus-4-6
description: "Implementation plan: Nexum frontend core — state machines, services, HTTP client chain, UI, and composition root"
---

# Nexum Frontend Implementation Plan

Implements the five frontend specs (`nexum-app-state-machine.md`, `nexum-auth-state-machine.md`, `nexum-repo-services.md`, `nexum-auth-services.md`, `nexum-http-client-chain.md`) and the UX spec (`nexum-ux-spec-v1.md`) against the architecture defined in the frontend ADR (`nexum-frontend-adr-v0_2_0.md`), auth ADR (`nexum-frontend-auth-adr-v0_1_0.md`), and stack ADR (`nexum-stack-adr-v0_1_0.md`).

## Goal

Deliver the complete Nexum frontend: a Swift package containing state machines, services, and HTTP client chain (tested natively), plus a Swift-to-WASM web UI composed via a two-phase composition root. The result is a working single-page web application that authenticates, displays the repo table, supports search/sort/inline-edit, and handles duplicates — all against the locked OpenAPI contract.

## State machine runtime

Both state machines (app and auth) use `ObservableModel<State, Event, Effect>` from `IMRxObservation` ([swift-imrx](https://github.com/igor1309/swift-imrx)) as their reactive runtime. ObservableModel provides:

- `@Observable` macro — the reactivity layer required by the stack ADR (not Combine).
- Reducer signature `(State, Event) -> (State, Effect?)` — matches the spec reducer signatures exactly.
- Effect handler signature `(Effect) -> AsyncStream<Event>` — a thin adapter over the spec's `async -> Action` collaborator pattern; each collaborator call yields one event and finishes.
- Event serialization via `AsyncStream` + `for await` in a single `Task` — no custom serialization needed.
- `@unchecked Sendable`, no `@MainActor` — general-purpose, not tied to UI.
- No Combine dependency — WASM-compatible.

The spec-defined collaborator protocols (`AddRepo`, `GetRepos`, `EditNote`, `SessionResolver`, `Authenticator`) remain unchanged. The effect handler closure wraps collaborator calls:

```swift
// Example: app effect handler as ObservableModel.HandleEffect closure
func handleAppEffect(_ effect: AppEffect) -> AsyncStream<AppAction> {
    AsyncStream { continuation in
        Task {
            let action: AppAction = switch effect {
            case .getRepos: await mapGetRepos()
            case .addRepo(let url, let note): await mapAddRepo(url, note)
            case .editNote(let id, let note): await mapEditNote(id, note)
            }
            continuation.yield(action)
            continuation.finish()
        }
    }
}
```

Test infrastructure: `withMainSerialExecutor` from `swift-concurrency-extras` for deterministic async tests; `Task.megaYield()` for settling the event loop.

## Execution lock

Worktree required: yes
Expected worktree: worktrees/nexum-frontend
Expected branch: codex/nexum-frontend
Preflight check: [ ] done

## Scope guardrails

- Frontend only — no backend implementation (separate plan).
- No CLI implementation (separate plan).
- No deployment, infrastructure, or CI pipeline work.
- No token refresh (`TokenRefresher` out of scope per auth ADR v0.1.0).
- No detail page (v1 is table-only per UX spec).
- All service tests use HTTPClient fakes/spies — no real network calls.
- No changes to the OpenAPI contract or any ADR.
- No modifications to `swift-imrx` — use `IMRxObservation` as-is.

## Phase 1 — Swift Package Setup & Toolchain Validation

**Objective**: Establish the Swift package structure for the frontend core and validate that the WASM compilation target works end-to-end with JavaScriptKit. De-risk the stack ADR's WASM premise before writing any domain code.

**Key work items**:
- Create `nexum/frontend/` as a Swift package with targets: `NexumCore` (library), `NexumCoreTests` (tests), `NexumWeb` (executable, WASM target).
- Add `swift-imrx` (`IMRxObservation` product) as a dependency for `NexumCore`. Add `swift-concurrency-extras` as a test dependency for `NexumCoreTests`.
- Configure `Package.swift` with JavaScriptKit dependency for the WASM target.
- Add a minimal "hello world" that compiles to both native (for `swift test`) and WASM.
- Verify `swift test` runs natively for `NexumCoreTests`.
- Verify WASM compilation produces a working `.wasm` artifact.
- Establish module boundaries: `NexumCore` depends on `IMRxObservation` (no Combine, no WASM issues); `NexumWeb` depends on both `NexumCore` and `JavaScriptKit`.

**Dependencies**: none (first phase).

**Risks**: Swift WASM toolchain (6.1+) or JavaScriptKit may have unexpected limitations. This phase exists to surface those early.

**Validation**: `swift test` passes natively; WASM artifact compiles and loads in a browser.

**Completion signal**: Package structure committed, both native tests and WASM build succeed.

## Phase 2 — App State Machine

**Objective**: Implement the app state machine — all types, pure reducer, effect handler with collaborator protocols, and the filtered/sorted view function. This is the core domain model that everything else plugs into.

Spec: `nexum-app-state-machine.md`

**Key work items**:
- Define types: `RepoEntry`, `AppError`, `OperationState`, `QueryState`, `SortColumn`, `SortDirection`, `AppState`, `AppAction`, `AppEffect`.
- Implement the pure `reduce(state:action:)` function matching `ObservableModel.Reduce` signature: `(AppState, AppAction) -> (AppState, AppEffect?)` (behavior rules 1–10 from spec).
- Define collaborator protocols: `AddRepo`, `GetRepos`, `EditNote` with their result types — owned by the effect handler, living in the same module.
- Implement the app effect handler as a function matching `ObservableModel.HandleEffect` signature: `(AppEffect) -> AsyncStream<AppAction>`. Delegates to injected collaborators, yields the resulting action, and finishes the stream (behavior rules 11–14).
- Implement `filteredAndSorted(entries:query:)` pure function (behavior rules 15–19).
- Write all 32 tests enumerated in the spec. Reducer tests are pure (no async). Effect handler tests use `withMainSerialExecutor` + `Task.megaYield()` for determinism.

**Dependencies**: Phase 1 (package structure, `IMRxObservation` dependency).

**Risks**: None significant — pure Swift with no external dependencies beyond `IMRxObservation`.

**Validation**: All 32 spec tests pass via `swift test`. Reducer is pure (no side effects). Collaborator protocols live in the same module as the effect handler.

**Completion signal**: All app state machine tests green; types and protocols available for downstream phases.

## Phase 3 — Auth State Machine

**Objective**: Implement the auth state machine — auth types, pure reducer, effect handler with collaborator protocols, and the in-memory token cache. The auth state machine is the top-level state machine; the app state machine lives inside its `authenticated` phase.

Spec: `nexum-auth-state-machine.md`

**Key work items**:
- Define types: `AuthState`, `AuthPhase`, `AuthResult`, `AuthError`, `Token`, `AuthAction`, `AuthEffect`.
- Implement the pure `reduce(state:action:)` function matching `ObservableModel.Reduce` signature: `(AuthState, AuthAction) -> (AuthState, AuthEffect?)` (behavior rules 1–10 from spec).
- Define collaborator protocols: `SessionResolver`, `Authenticator` with `AuthenticateResult` — owned by the auth effect handler, living in the same module.
- Implement the auth effect handler as a function matching `ObservableModel.HandleEffect` signature: `(AuthEffect) -> AsyncStream<AuthAction>`. Delegates to injected collaborators (behavior rules 11–15). `.clearToken` yields no event (returns empty stream).
- Define `TokenCache` protocol and `InMemoryTokenCache` implementation (behavior rules 16–20).
- Wire the token provider as `{ tokenCache.read()?.value }` — a plain closure, not a separate type.
- Write all 24 tests enumerated in the spec (reducer: 11, effect handler: 6, token cache: 4, session resolver: 3). Effect handler tests use `withMainSerialExecutor` + `Task.megaYield()`.

**Dependencies**: Phase 1 (package structure, `IMRxObservation` dependency). Independent of Phase 2 — no shared types between app and auth state machines.

**Risks**: Auth effect handler's `.clearToken` returns `nil` in the spec but ObservableModel expects `AsyncStream<Event>` — use an empty stream (finish immediately, no yield). Straightforward adaptation.

**Validation**: All 24 spec tests pass via `swift test`. Reducer is pure. Collaborator protocols live in the same module as the auth effect handler. TokenCache lives in the auth module.

**Completion signal**: All auth state machine tests green; auth types and token cache protocol available for downstream phases.

## Phase 4 — HTTPClient Protocol & Repo Services

**Objective**: Define the `HTTPClient` protocol (the shared async surface for all services) and implement the three repo services that map collaborator protocol calls to REST endpoints.

Spec: `nexum-repo-services.md`

**Key work items**:
- Define `HTTPClient` protocol: `HTTPRequest`, `HTTPMethod`, `HTTPResult`, `HTTPClientError` — owned by the services module.
- Implement `GetReposService` conforming to `GetRepos` (behavior rules 1–6).
- Implement `AddRepoService` conforming to `AddRepo` (behavior rules 7–15).
- Implement `EditNoteService` conforming to `EditNote` (behavior rules 16–22).
- Create `HTTPClientSpy` / fake for tests.
- Write all 20 tests enumerated in the spec.

**Dependencies**: Phase 2 (collaborator result types `AddRepoResult`, `GetReposResult`, `EditNoteResult` and `RepoEntry`, `AppError` from the app state machine spec).

**Risks**: JSON decoding edge cases (malformed responses, missing fields). Mitigated by explicit test coverage for every error path.

**Validation**: All 20 spec tests pass. Each service conforms to its collaborator protocol. Services do not import auth types. `HTTPClient` protocol lives in the same module as the services.

**Completion signal**: All repo service tests green; `HTTPClient` protocol available for auth services and HTTP client chain.

## Phase 5 — Auth Services

**Objective**: Implement `LoginService` — the single auth service that maps the `Authenticator` protocol to `POST /auth/login`.

Spec: `nexum-auth-services.md`

**Key work items**:
- Implement `LoginService` conforming to `Authenticator` (behavior rules 1–10).
- Reuse `HTTPClientSpy` from Phase 4 for tests.
- Write all 6 tests enumerated in the spec.

**Dependencies**: Phase 3 (`AuthenticateResult`, `AuthError`, `Token` from auth state machine), Phase 4 (`HTTPClient` protocol from repo services).

**Risks**: None significant — same pattern as repo services.

**Validation**: All 6 spec tests pass. LoginService conforms to `Authenticator`. LoginService depends on `HTTPClient` only — does not import token cache, signing adapter, or persistence types.

**Completion signal**: All auth service tests green.

## Phase 6 — HTTP Client Chain

**Objective**: Implement `SigningAdapter` and `AuthInterceptor` as `HTTPClient`-conforming decorators. These are composition-root-level types, not part of the auth or services modules.

Spec: `nexum-http-client-chain.md`

**Key work items**:
- Implement `SigningAdapter`: injects Bearer token via async `tokenProvider` closure (behavior rules 1–6).
- Implement `AuthInterceptor`: observes responses, fires `onSessionLost` callback on 401 (behavior rules 7–12).
- Write all 12 tests enumerated in the spec (SigningAdapter: 6, AuthInterceptor: 6).

**Dependencies**: Phase 4 (`HTTPClient` protocol).

**Risks**: Async token provider interaction with the request pipeline. Mitigated by explicit per-call token fetch test (test 4).

**Validation**: All 12 spec tests pass. Both types conform to `HTTPClient`. Neither references auth state machine types directly. `SigningAdapter` receives a `() async -> String?` closure, not `TokenCache`.

**Completion signal**: All HTTP client chain tests green. Full frontend core test suite green.

## Phase 7 — UI Layer

**Objective**: Build the web UI using JavaScriptKit and Observation. The UI renders auth and app state machine states and dispatches actions — it knows nothing about services, effects, or the network.

Spec: `nexum-ux-spec-v1.md`, ADR: `nexum-frontend-adr-v0_2_0.md` (UI section), `nexum-frontend-auth-adr-v0_1_0.md` (UI section)

**Key work items**:
- Auth-driven routing: observe `authModel.state.phase` — `resolving` → loading/splash, `unauthenticated`/`authenticating` → login surface, `authenticated` → app surface.
- Login screen: username/password fields, submit dispatches `authModel.event(.credentialsSubmitted(...))`, error display derived from `authModel.state.result`.
- Repo table: observe `appModel.state` — 5 columns (Name as link, Stars, Description, Note, Added), all sortable. Display uses `filteredAndSorted(entries:query:)` over `appModel.state.repoTable` and `appModel.state.query`.
- Sort: dispatch `appModel.event(.toggleSortColumn(...))` on column header tap.
- Search: dispatch `appModel.event(.updateQuery(...))` on text input.
- Add repo form: URL + note inputs, explicit save dispatches `appModel.event(.addRepo(...))`, empty-note confirmation prompt.
- Inline note editing: click note cell to activate, explicit save/cancel controls, save dispatches `appModel.event(.editNote(...))`.
- Duplicate handling: on `appModel.state.postState == .error(.duplicate(existingId))`, scroll to and highlight the existing entry.
- Empty states: no entries → prompt to add first repo; search with no results → "No matches" with query echoed.
- Async indicators: loading/error derived from `appModel.state.fetchState` and `appModel.state.postState`.
- Reactivity is automatic: `ObservableModel` is `@Observable`, so JavaScriptKit rendering code observes `model.state` changes directly.

**Dependencies**: Phase 2 (app state machine types/actions), Phase 3 (auth state machine types/actions), Phase 1 (WASM/JavaScriptKit target).

**Risks**: JavaScriptKit DOM manipulation API may require workarounds. `@Observable` tracking behavior on WASM target may differ from native — Phase 1 de-risked the toolchain, and domain logic is already tested in Phases 2–6.

**Validation**: Manual browser testing of all UX spec behaviors. Automated tests where feasible (rendering logic that doesn't require a browser).

**Completion signal**: All UX spec behaviors verified in a browser: login → table renders → search/sort works → add repo → inline edit → duplicate highlight → empty states.

## Phase 8 — Composition Root & Integration

**Objective**: Wire the two-phase composition root that assembles all components and validates the end-to-end flow.

ADR: `nexum-frontend-auth-adr-v0_1_0.md` (Composition Root section)

**Key work items**:
- **Phase 1 (boot)**: construct `InMemoryTokenCache`, auth collaborators (`SessionResolver` with localStorage persistence decorator, `LoginService` with bare `HTTPClient`), auth effect handler closure, auth `ObservableModel<AuthState, AuthAction, AuthEffect>`. Dispatch `authModel.event(.boot)`.
- **Phase 2 (on authenticated)**: construct `ConcreteHTTPClient` (fetch-based via JavaScriptKit), `SigningAdapter(httpClient, { tokenCache.read()?.value })`, `AuthInterceptor(signedClient, { authModel.event(.sessionLost) })`, three repo services, app effect handler closure, app `ObservableModel<AppState, AppAction, AppEffect>`. Dispatch `appModel.event(.load)` on the returned model.
- Implement `ConcreteHTTPClient` using JavaScriptKit's `fetch` API.
- Implement localStorage persistence decorators for `SessionResolver` and `Authenticator`.
- Wire app graph teardown on session lost (authenticated → unauthenticated destroys app `ObservableModel` and all its dependencies).
- Define in-flight request behavior on session teardown (per implementation note: choose cancel or discard, document the choice).
- Integration test: boot → resolve session → authenticated → load repos → render table (using test doubles for network layer).

**Dependencies**: all prior phases (2–7).

**Risks**: Two-phase composition wiring is the integration point where all module boundaries meet. Mitigated by each module being independently tested. In-flight request teardown behavior needs an explicit decision.

**Validation**: Integration test passing. End-to-end manual test: fresh load (no token) → login → table loads → add repo → edit note → search/sort → logout → re-login → session persists across reload.

**Completion signal**: Full test suite green (`swift test`). WASM build succeeds. End-to-end flow verified in browser.

## Done criteria

- All five frontend specs are fully implemented with every enumerated test passing.
- All UX spec behaviors are verified in a browser.
- `swift test` passes (full native test suite).
- WASM build succeeds and the app loads in a browser.
- Two-phase composition root wires all components per the auth ADR.
- No spec drift — implementations match spec contracts exactly.
- Specs moved to `docs/specs/implemented/` after their respective phases complete.
