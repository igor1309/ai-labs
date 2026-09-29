# Review fixes: use cases are built by constructors that keep every
# collaborator, and the run record owns its snapshot types. Each mutation
# undoes one fix, and the listed tests must fail with it.
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

# A constructor keeps every collaborator it is given.
[NewChecker keeps the validator]
file: internal/app/check.go
find: validator: validator, runtimes: runtimes, sources: sources}
replace: runtimes: runtimes, sources: sources}
test: ./internal/app TestCheckReportsEveryProblemAcrossDocuments

[NewCalls keeps the hosted set]
file: internal/app/calls.go
find: \t\thosted:      hosted,\n
replace: 
test: ./internal/app TestCancelInterruptsAndReleases

# The composition root gives each use case the source it was built for.
[inspection reads the global-only source]
file: cmd/agister/main.go
find: app.NewInspection(layered,
replace: app.NewInspection(globalOnly,
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
find: layered, runtimes, sources, git.Workspaces{}
replace: globalOnly, runtimes, sources, git.Workspaces{}
test: ./cmd/agister TestBuiltClientReadsOnlyTheSourcesGiven
