## Versioning

The CLI version is defined in `Sources/CLI/NerisCLI.swift` via `CommandConfiguration(version:)`. Update it on every release. This is the single source of truth for `neris --version` and the startup message.

## Testing

### Test Structure

- Test classes inherit from `TestContext`.
- `// MARK: - Helpers` section goes after all tests.
- `private typealias SUT = <Type>` lives under `// MARK: - Helpers` inside the class.
- `makeSUT` accepts `_ sourceLocation: SourceLocation = #_sourceLocation` and passes it to `trackForMemoryLeaks`.
- Helpers are private methods inside the class body — not free functions, not extensions.
- Extract repeated setup into private helpers (e.g. `filterResult(_:)`).

### TDD Discipline

- Write the test and stop. Do not add production code without a failing test asking for it.
- Compilation errors are not RED. RED means code compiles and a test fails with an assertion.
- Do not invent protocols, DI schemes, or abstractions ahead of a test requiring them.
- Production types start minimal. Dependencies may be added as params to satisfy the compiler, but must not be retained (stored) or wired until the failing assertion demands it.
- Do not pre-wire dependencies into `makeSUT` — let the failing test drive what the SUT needs.
- Production API design comes from tests. Do not decide production code shape independently — let the test define it.
- Spy types and production type shapes (enum vs typealias, return types) are driven by test assertions, not by specs or anticipated final design.
- Closure dependencies use named typealiases (see `Loop` for the pattern: `typealias Transport = ...`, then `private let transport: Transport`, then `init(transport: @escaping Transport)`).
- Do not create test helpers that duplicate existing spies or abstractions. Use existing test infrastructure (e.g. `CallSpy`, `AsyncSpy`) before inventing new helpers.
- Every type, generic parameter, and return type must trace to a specific `#expect(...)`. If no assertion breaks without it, remove it.
- Start new behavior with production failure. When a test introduces a new dependency or return path, make production code explicitly fail (`try?`, discard result) so RED has a real failing assertion. Do not wire the happy path during RED.
- Check `_Helpers/` before inlining factory calls. If a reusable `makeSome*` helper exists or should exist, use or create it.
- Run tests before every commit.
- Test command: `swift test 2>&1 | xcsift --quiet`
