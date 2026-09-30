# Declaring verify (ADR-002, LAB-7 slice A): a process's verify block is
# validated, invalid rather than clamped, and a call that could not repair
# is refused before its first turn. Each mutation undoes one validation
# rule of the slice's brief, and the listed tests must fail with it.
# Run: scripts/revert-check.py <this file>
module: agister

# Rule 1: verify without command, timeout, max_attempts or instruction is
# invalid, naming the field.
[every verify field is required]
file: internal/domain/definition/documents.go
find: p.add(join("verify", key), "is required")
replace: _ = key
test: ./internal/domain/definition TestVerifyWithoutAFieldIsInvalid

# Rule 2: max_attempts below 1 is invalid.
[verify.max_attempts is at least 1]
file: internal/domain/definition/documents.go
find: if attempts < 1 {\n\t\t\tp.add("verify.max_attempts", "must be at least 1")
replace: if attempts < -1 {\n\t\t\tp.add("verify.max_attempts", "must be at least 1")
test: ./internal/domain/definition TestVerifyMaxAttemptsBelowOneIsInvalid

# Rule 3: max_attempts above the service's max_verify_attempts is invalid.
[verify.max_attempts stays within the service ceiling]
file: internal/domain/policy/policy.go
find: if verify.MaxAttempts > service.MaxVerifyAttempts {
replace: if verify.MaxAttempts > service.MaxVerifyAttempts+100 {
test: ./internal/domain/policy TestVerifyAttemptsAboveTheServiceCeilingAreInvalid

# Rule 4: verify.timeout above the call's effective timeout is invalid; a
# caller's --timeout narrowing it refuses the call before the first turn.
[verify.timeout stays within the effective timeout]
file: internal/domain/policy/policy.go
find: if verify.Timeout > *timeout {
replace: if verify.Timeout > service.MaxTimeout {
test: ./internal/domain/policy TestVerifyTimeoutAboveTheEffectiveTimeoutIsInvalid
test: ./internal/app TestVerifyTimeoutAboveTheCallersTimeoutRefusesTheCall
test: ./cmd/agister TestVerifyDeclarationEndToEnd

# Rule 5: a process with verify needs workspace.checkout.
[verify needs a checkout the call owns]
file: internal/domain/definition/documents.go
find: if process.Checkout == "" {\n\t\t\tp.add("verify"
replace: if process.Checkout == "never" {\n\t\t\tp.add("verify"
test: ./internal/domain/definition TestVerifyWithoutACheckoutIsInvalid

# Rule 6: repairs (max_attempts above 1) need a resumable agent and a
# runtime that resumes; the call is refused before its first turn and
# recorded, and check reports what it can know.
[repairs need sessions that can be continued]
file: internal/domain/definition/documents.go
find: func (v *Verify) Repairs() bool { return v != nil && v.MaxAttempts > 1 }
replace: func (v *Verify) Repairs() bool { return false }
test: ./internal/app TestVerifyRepairsWithoutResumableSessionsRefuseTheCall
test: ./internal/domain/settings TestVerifyRepairsNeedAResumableAgent
test: ./internal/app TestCheckWarnsOncePerProcessWithVerify
