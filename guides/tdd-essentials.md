# Strict TDD Process Essentials

## Core TDD Discipline
- **One test at a time** - Never write multiple tests simultaneously
- **Red-Green-Refactor cycle** - Always see failing test before implementing
- **Minimal implementation** - Write only enough code to pass the current test
- **Two-level process** - Inner R-G-R cycle for individual tests, outer cycle runs ALL tests before commit
- **Commit after green** - Every successful test cycle gets committed, but only after ALL tests pass

## Implementation Standards
- **Document design decisions** - Add inline comments explaining non-obvious choices (like atomicBurn mutex decisions)
- **Atomic commits** - Each commit represents one complete feature with all tests passing
- **Meaningful commit messages** - Follow conventional commits with clear explanations

## When Stuck Protocol
- **Ask before proceeding** if unable to create a proper failing test
- **Don't cheat TDD** - Resist urge to implement multiple behaviors at once
- **Verify assumptions** - Always run tests to confirm red/green states

## Quality Gates
- **Inner cycle validation** - Individual test must pass before moving to next step
- **Outer cycle validation** - Full test suite must pass before any commit
- **No broken intermediate states** - Never leave code in failing state
- **Progressive disclosure** - Each test reveals next requirement naturally

## Additional Best Practices
- **Test naming clarity** - Descriptive test names that explain expected behavior
- **Mock isolation** - Proper dependency injection for testable units
- **Error-first testing** - Test failure cases before success cases
- **Spec compliance** - Always reference original requirements in commits

## Advanced TDD Patterns

### Test-First Structure Design
- **Define test signatures first** - Write all test method names before any implementation
- **Create failing assertions** - Start with placeholder implementations that fail
- **Implement incrementally** - Only write enough code to make current test pass

### Comprehensive Edge Case Testing
- **Exhaustive boolean combinations** - Test all true/false state permutations
- **Nested loop coverage** - Use systematic loops for complete state space testing
- **Boundary condition testing** - Explicitly test edge cases and limits

### Documentation Standards
- **Inline effect documentation** - Document expected behavior directly in effect definitions
- **Complex logic comments** - Explain non-obvious guard conditions and business rules
- **Decision rationale** - Record why specific implementation approaches were chosen

### Spy Pattern for Dependencies
- **Typed spy objects** - Create specific spy classes for each external dependency
- **Call verification** - Explicitly verify call counts and parameter values
- **Asynchronous expectations** - Use XCTestExpectation for completion callback testing

### Factory Method Best Practices
- **Randomized defaults** - Use random values to catch hidden assumptions
- **Specific overrides** - Allow targeted parameter customization for focused testing
- **Centralized creation** - Keep all test data creation in dedicated factory methods

### Memory Safety in Tests
- **Leak detection tracking** - Use trackForMemoryLeaks for all test subjects
- **Precise error reporting** - Include file/line parameters for accurate failure location
- **Long-lived object testing** - Verify memory management of persistent components

These principles have proven effective for maintaining code quality and preventing regressions while following true TDD methodology.