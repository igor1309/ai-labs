# LAB-<n>: <the component, one line>

## Intent

<What the component is and does, in a few sentences. Name the kind
(core, adapter, UI module, preview app) and the `mizan-ble/AGENTS.md`
section that binds it. Say what it does not know or do.>

## Done when

1. <The spec implemented in `mizan-ble/ios/Sources/<Name>`, and the exact
   `Package.swift` entries; "touch nothing else there".>
2. <The API: every public type and signature. The brief fixes it; Codex
   does not choose it.>
3. <Cores and adapters: every row of `QA.md` names its evidence as
   `<Name>Tests.<test>`, and that test exists and passes. Only the
   evidence lines change; no scenario text. UI modules: the state shape,
   events, view and previews instead.>
4. <Test rules: one Swift Testing struct, no sleeps proving that nothing
   happened. A core: fakes of its interfaces and a fake clock. An
   adapter: the QA rows on the real binding, and its own logic through a
   fake of the binding passed to an internal init. A real-time test
   asserts lower bounds and stream ends only. A machine: reducer tests in
   pairs, state and effect, through one-line `assert` helpers; handler
   tests through spies.>
5. `swift build` and `swift test` pass in `mizan-ble/ios`;
   `node --test scripts/tests/ci-workflow-paths.test.js` passes from the
   repo root. `mizan-ble/docs/log.md` gains this component's line only,
   under today's date, saying what changed for the product (LAB-<n>), and
   `mizan-ble/README.md`'s `ios/` row names the module.

## Out of scope

<Every neighbouring component with its issue, the root, any follow-up
issue, any spec (only `QA.md` evidence lines change; if a spec looks wrong
or silent, stop and report it), `ARCHITECTURE.md`, CI workflows.>

## Sources

mizan-ble/ARCHITECTURE.md
mizan-ble/AGENTS.md
mizan-ble/docs/spec/<name>/SPEC.md
mizan-ble/docs/spec/<name>/QA.md
<a merged module of the same kind, as the pattern; for a machine, its
spec's `## Decided`; for a UI module, the frames' PNGs and the copy file>

## Open

None.
