# LAB-20: the consumers own their contracts' data model too

The contracts LAB-20 introduced, `CallResolution` (`ResolvedCall`,
`ResolvedWorkflow`, in `agister/internal/app/calls.go`) and
`InspectionResolver` (`InspectedProcess`, `InspectedWorkflow`, in
`agister/internal/app/definitions.go`), carry domain types as their
fields: `definition.Process`, `definition.Agent`, `definition.Mapping`,
`definition.Workflow`, `definition.Source`, `policy.Effective` and
`enforce.Plan`. The repository rule `protocol-owned-by-client` says the
client owns the dependency shape, its interface and its data model, so
these contracts must not hand the client another package's types.

Give each consumer its own types for what it reads from the result, with
only the fields it uses, and translate the resolver's results into them
field by field at the existing boundary (where `Resolver` answers each
contract). The interfaces' methods and the test doubles keep working; the
doubles build the consumer's own types. Calls and inspection behave
exactly as before.

Keep the scope to these contracts; other uses of domain types inside
`app` are not part of this change.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
