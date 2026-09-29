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
find: json:"max_attempts"
replace: json:"maxAttempts"
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

[a constraint's tags are the record's own]
file: internal/domain/run/snapshots.go
find: json:"on_unknown"
replace: json:"onUnknown"
test: ./internal/domain/run TestRecordJSONForDefinitionsPolicyAndPlanIsFixed

# What a call resolved is translated into them field for field.
[the recorded effective policy keeps the scope]
file: internal/app/recording.go
find: \t\tScope:       effective.Scope,\n
replace: 
test: ./internal/app TestCallRecordsWhatItResolvedUnderTheRecordsOwnTypes

[the recorded effective policy keeps the constraints]
file: internal/app/recording.go
find: \t\tConstraints: constraints,\n
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
find: validator: validator, adapters: adapters, identities: identities, sources: sources}
replace: adapters: adapters, identities: identities, sources: sources}
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
find: resolverOn(layered), sources,
replace: resolverOn(globalOnly), sources,
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven

# The checker asks two roles, each declared by it: the adapters the code
# provides, and what one adapter reports about itself.
[the probe asks the identity of an adapter the code does not provide]
file: internal/app/check.go
find: \t\t\tif !contains(known, mapping.Adapter) {\n\t\t\t\tcontinue // reported as an unknown adapter\n\t\t\t}\n
replace: 
test: ./internal/app TestCheckProbeAsksNoIdentityOfAnAdapterTheCodeDoesNotProvide

[the probe asks the identity for the agent's command]
file: internal/app/check.go
find: c.identities.Identity(ctx, mapping.Adapter, agent.Command)
replace: c.identities.Identity(ctx, mapping.Adapter, "")
test: ./internal/app TestCheckProbesEachAgentsRuntime

[the checker takes the adapters the code provides from its catalog]
file: internal/app/check.go
find: Adapters: known}
replace: Adapters: nil}
test: ./internal/app TestCheckProbesEachAgentsRuntime

# The reaper asks the run store for the checkouts running runs use through a
# role of its own, not through the adoption role.
[NewReaper keeps the checkouts source]
file: internal/app/reap.go
find: checkouts: checkouts, 
replace: 
test: ./internal/app TestACheckoutARunningRunUsesIsNotDiscarded

[the built reaper reads live checkouts from another store]
file: cmd/agister/main.go
find: app.NewReaper(evidence, evidence,
replace: app.NewReaper(evidence, fsruns.Store{Dir: config.Home},
test: ./cmd/agister TestBuiltReaperLeavesACheckoutARunningRunUses

# Calls prepare the workspace and capture its changes through two roles.
[the built calls prepare the workspace through the wired role]
file: cmd/agister/main.go
find: git.Workspaces{}, git.Workspaces{}, provenance
replace: struct{ app.CallWorkspaces }{}, git.Workspaces{}, provenance
test: ./cmd/agister TestWorkspaceChangesAreKept

[the built calls capture changes through the wired role]
file: cmd/agister/main.go
find: git.Workspaces{}, git.Workspaces{}, provenance
replace: git.Workspaces{}, struct{ app.CallChanges }{}, provenance
test: ./cmd/agister TestWorkspaceChangesAreKept

# No interface is shared: ports.go holds data only.
[an interface is shared from ports.go]
file: internal/app/ports.go
find: // Examples are definitions shipped
replace: type Shared interface{ Method() }\n\n// Examples are definitions shipped
test: ./internal/archtest TestSharedDataFileDeclaresNoInterface
