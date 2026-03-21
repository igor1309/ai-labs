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
- Do not create test helpers that duplicate existing spies or abstractions. Use existing test infrastructure (e.g. `CallSpy`, `AsyncSpy`) before inventing new helpers.
- Run tests before every commit.
- Test command: `swift test 2>&1 | xcsift --quiet`
