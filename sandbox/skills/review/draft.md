Review phase 6 implementation
Pay special attention to:
1. How implementation fits phase 6 docs
2. Anti-patterns, violations of SOLID and “protocol owned by client” rule
3. Bloated functions and classes, clear separation of concerns. Violation of modular architecture. Composition root correctness: where dependencies are wired; ensure no “newing up” inside domain objects.
4. Unclear unreadable code, poor naming
5. Clear test setup
6. Test helpers and factories for clear concise tests
7. Missing test cases, edge cases
8. Assertion quality: are tests asserting observable behavior rather than implementation details.
9. Negative tests: ensure “does not” behaviors are covered (e.g., “does not notify twice”, “does not call loader on invalid transition”).
10. Overall consistency and readability 

For each fail: (a) what’s wrong, (b) why it violates principle/doc, (c) minimal fix, (d) test delta (new/updated cases), (e) risk/impact (API break? behavior change?).

On completion write your review into separate new markdown doc, create new branch, commit review and create PR.