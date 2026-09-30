# Review fixes: use cases are built by constructors that keep every
# collaborator, the run record owns its snapshot types, and each component
# declares the interfaces it calls, none shared. Each mutation undoes one
# fix, and the listed tests must fail with it.
# Run: scripts/revert-check.py <this file>
module: agister

# The record's JSON for definitions, policy and plan is fixed by the run
# package, not by the packages that decide them.
[the effective policy's tags are the record's own]
file: internal/domain/run/snapshots.go
find: json:"permissions"
replace: json:"perms"
test: ./internal/domain/run TestRecordJSONForDefinitionsPolicyAndPlanIsFixed

[a definition source's tags are the record's own]
file: internal/domain/run/snapshots.go
find: json:"sha256"
replace: json:"digest"
test: ./internal/domain/run TestRecordJSONForDefinitionsPolicyAndPlanIsFixed

[the plan's tags are the record's own]
file: internal/domain/run/snapshots.go
find: json:"withheld"
replace: json:"not_granted"
test: ./internal/domain/run TestRecordJSONForDefinitionsPolicyAndPlanIsFixed

# What a call resolved is translated into them field for field.
[the recorded effective policy keeps the scope]
file: internal/app/recording.go
find: \t\tScope:       effective.Scope,\n
replace: 
test: ./internal/app TestCallRecordsWhatItResolvedUnderTheRecordsOwnTypes

[the recorded plan keeps what was withheld]
file: internal/app/recording.go
find: \t\tWithheld:   slices.Clone(plan.Withheld),\n
replace: 
test: ./internal/app TestCallRecordsWhatItResolvedUnderTheRecordsOwnTypes

[the recorded definitions keep the digest]
file: internal/app/recording.go
find: \t\t\tSHA256:    source.SHA256,\n
replace: 
test: ./internal/app TestCallRecordsWhatItResolvedUnderTheRecordsOwnTypes

[the recorded effective policy keeps the required permissions]
file: internal/app/recording.go
find: \t\tRequire:     slices.Clone(effective.Require),\n
replace: 
test: ./internal/app TestCallRecordsWhatItResolvedUnderTheRecordsOwnTypes

# A constructor keeps every collaborator it is given.
[NewChecker keeps the validator]
file: internal/app/check.go
find: validator: validator, runtimes: runtimes, sources: sources}
replace: runtimes: runtimes, sources: sources}
test: ./internal/app TestCheckReportsEveryProblemAcrossDocuments

[NewCalls keeps the hosted set]
file: internal/app/calls.go
find: \t\thosted:     hosted,\n
replace: 
test: ./internal/app TestCancelInterruptsAndReleases

# The composition root gives each use case the source it was built for.
[inspection reads the global-only source]
file: cmd/agister/main.go
find: app.NewInspection(resolverOn(layered))
replace: app.NewInspection(resolverOn(globalOnly))
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[the global write scope reads the layered source]
file: cmd/agister/main.go
find: Check: checkerOn(globalOnly)
replace: Check: checkerOn(layered)
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[the project write scope reads the global-only source]
file: cmd/agister/main.go
find: Check: checkerOn(layered)}
replace: Check: checkerOn(globalOnly)}
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

[calls read the global-only source]
file: cmd/agister/main.go
find: resolverOn(layered), runtimes, sources,
replace: resolverOn(globalOnly), runtimes, sources,
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

# The checker asks one runtime-catalog role, declared by it: the adapters the
# code provides, and what one adapter reports about itself.
[the probe asks the identity of an adapter the code does not provide]
file: internal/app/check.go
find: \t\t\tif !contains(known, mapping.Adapter) {\n\t\t\t\tcontinue // reported as an unknown adapter\n\t\t\t}\n
replace: 
test: ./internal/app TestCheckProbeAsksNoIdentityOfAnAdapterTheCodeDoesNotProvide

[the probe asks the identity for the agent's command]
file: internal/app/check.go
find: c.runtimes.Identity(ctx, mapping.Adapter, agent.Command)
replace: c.runtimes.Identity(ctx, mapping.Adapter, "")
test: ./internal/app TestCheckProbesEachAgentsRuntime

[the checker takes the adapters the code provides from its catalog]
file: internal/app/check.go
find: Adapters: known}
replace: Adapters: nil}
test: ./internal/app TestCheckProbesEachAgentsRuntime

# The reaper adopts runs and reads the checkouts running runs use through
# one role of its own, over one run store.
[the built reaper adopts from another store]
file: cmd/agister/main.go
find: app.NewReaper(evidence, 
replace: app.NewReaper(fsruns.Store{Dir: config.Home}, 
test: ./cmd/agister TestBuiltReaperLeavesACheckoutARunningRunUses

[the reaper discards a checkout a running run uses]
file: internal/app/reap.go
find: case slices.Contains(live, checkout.Dir):
replace: case slices.Contains(live, checkout.Dir) && false:
test: ./internal/app TestACheckoutARunningRunUsesIsNotDiscarded

[the reaper reads live checkouts again after adopting]
file: internal/app/reap.go
find: handle, record, err := c.adopter.Adopt(ctx, listed.ID)\n\t\tif err != nil {\n\t\t\tcontinue\n\t\t}\n
replace: handle, record, err := c.adopter.Adopt(ctx, listed.ID)\n\t\tif err != nil {\n\t\t\tcontinue\n\t\t}\n\t\tlive, liveErr = c.adopter.LiveCheckouts(ctx)\n
test: ./internal/app TestLiveCheckoutsAreReadBeforeTheRunIsAdopted

# The built reaper ends processes through the supervisor's, which refuse a
# reference they did not make and say why.
[the supervisor drops the error of a reference it did not make]
file: internal/adapters/runtime/supervisor/processes.go
find: \tgroup, token, err := ParseRef(ref)\n\tif err != nil {\n\t\treturn app.ReapLeft, err\n
replace: \tgroup, token, err := ParseRef(ref)\n\tif err != nil {\n\t\treturn app.ReapLeft, nil\n
test: ./cmd/agister TestBuiltClientReapsAbandonedRunsWhenACallIsSubmitted

# Calls prepare the workspace and capture its changes through two roles.
[the built calls prepare the workspace through the wired role]
file: cmd/agister/main.go
find: git.Workspaces{}, git.Workspaces{}, supervisor.Commands{}
replace: struct{ app.CallWorkspaces }{}, git.Workspaces{}, supervisor.Commands{}
test: ./cmd/agister TestWorkspaceChangesAreKept

[the built calls capture changes through the wired role]
file: cmd/agister/main.go
find: git.Workspaces{}, git.Workspaces{}, supervisor.Commands{}
replace: git.Workspaces{}, struct{ app.CallChanges }{}, supervisor.Commands{}
test: ./cmd/agister TestWorkspaceChangesAreKept

# No interface is shared: ports.go holds data only.
[an interface is shared from ports.go]
file: internal/app/ports.go
find: // Examples are definitions shipped
replace: type Shared interface{ Method() }\n\n// Examples are definitions shipped
test: ./internal/archtest TestSharedDataFileDeclaresNoInterface

# Each component declares the interfaces it uses and no other file names them.
[the resolution names the runner interface the calls declare]
file: internal/app/resolve.go
find: \tidentity  RuntimeIdentity\n
replace: \tidentity  RuntimeIdentity\n\trunner    TurnRunner\n
test: ./internal/archtest TestNoInterfaceIsNamedOutsideItsFile

[the checker names an interface the calls declare]
file: internal/app/check.go
find: \tsources     []string // input source kinds the code provides\n
replace: \tsources     []string // input source kinds the code provides\n\tclock       CallClock\n
test: ./internal/archtest TestNoInterfaceIsNamedOutsideItsFile

# Calls resolve through the role they declare, not the concrete Resolver.
[a call resolves from a snapshot of its own, not the one taken at submit]
file: internal/app/calls.go
find: res, err := resolver.Resolve(
replace: res, err := c.resolver.Snapshot(ctx).Resolve(
test: ./internal/app TestCallsResolveThroughTheResolutionTheyDeclare

# The resolver checks the runtime through its identity; the calls build the
# runner for the same adapter and command when they execute.
[the resolver asks the identity for no command]
file: internal/app/resolve.go
find: r.identities.Identity(ctx, res.mapping.Adapter, res.agent.Command)
replace: r.identities.Identity(ctx, res.mapping.Adapter, "")
test: ./internal/app TestCallChecksAndRunsTheRuntimeOfItsAgent

[the calls build the runner for no command]
file: internal/app/calls.go
find: c.runners.Runner(res.mapping.Adapter, res.agent.Command)
replace: c.runners.Runner(res.mapping.Adapter, "")
test: ./internal/app TestCallChecksAndRunsTheRuntimeOfItsAgent

[a runner that cannot be built is not a refusal]
file: internal/app/calls.go
find: fail(refuse("runtime mapping %s: %v", res.mapping.Name, err))
replace: fail(err)
test: ./internal/app TestRefusalsComeBeforeEffects

[the built calls get no runner from the registry]
file: cmd/agister/main.go
find: resolverOn(layered), runtimes, sources,
replace: resolverOn(layered), runtime.Registry{}, sources,
test: ./cmd/agister TestWorkspaceChangesAreKept

# An adapter the code does not provide is reported once, as an unknown
# adapter, with or without the probe.
[the unknown adapter is not reported as what it is]
file: internal/domain/settings/settings.go
find: "unknown adapter %q (available: %s)"
replace: "adapter %q is missing (available: %s)"
test: ./internal/app TestCheckProbeAsksNoIdentityOfAnAdapterTheCodeDoesNotProvide

[the probe reports an unknown adapter a second time]
file: internal/app/check.go
find: continue // reported as an unknown adapter
replace: problem("agent "+name, "adapter %s is not provided", mapping.Adapter)\n\t\t\t\tcontinue
test: ./internal/app TestCheckProbeAsksNoIdentityOfAnAdapterTheCodeDoesNotProvide
