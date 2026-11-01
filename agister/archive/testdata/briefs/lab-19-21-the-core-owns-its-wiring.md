# LAB-19, LAB-20, LAB-21: the core owns its wiring and its consumers own their contracts

Three architecture review findings, never ruled on; line numbers are from
when they were raised and may have moved. Confirm each in the code before
fixing; where one does not hold, say so and change nothing for it.

- **LAB-19, a local composition root.** `agister/cmd/agister/main.go`
  assembles the core's internal graph: validation scopes, the resolvers,
  verification, `app.Host` with Settings, Checker, Inspection, Calls and
  Runs wired one by one, and the `Build` closure `app.Gated` requires
  (`internal/app/gate.go`). `app.Host` exposes those concrete use cases
  and has no constructor of its own. Move that assembly into an `app`
  construction function that returns the core's client contract; `main`
  keeps building infrastructure (adapters, stores, runtimes) and choosing
  decorators, and passes them in.
- **LAB-20, no private types in consumer contracts.** `CallResolution`
  (`internal/app/calls.go`) and `InspectionResolver`
  (`internal/app/definitions.go`) take and return `Resolver`'s private
  `overrides`, `resolution` and `workflowResolution` types, so nothing
  outside package `app` can implement them; the counted resolver double
  lives in `export_test.go` for that reason. Give each consumer request
  and result types it owns, translate `Resolver`'s results at the
  boundary, and let the external tests implement their own double.
- **LAB-21, roles instead of `*Hosted`.** `NewRuns` (`internal/app/runs.go`)
  takes the concrete `*Hosted` but only cancels; `NewCalls` takes it to
  register and remove a cancellation callback. Declare a consumer-owned
  interface for each role, keep `Hosted` as the implementation attached at
  composition, and let a `Runs` cancellation test use its own double
  instead of submitting a real call first.

Behaviour stays the same: this is structure only. Keep the existing tests
passing; move or rewrite a test only where it reached into what these
changes make private, and say which.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
