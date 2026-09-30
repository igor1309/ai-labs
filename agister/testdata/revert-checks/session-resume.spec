# Session resume in place (ADR-001 rule 12): Agister chooses no session ID,
# a continuation resumes the reported session without forking, and the
# runtime must report the session it resumed. Each mutation undoes one
# part, and the listed tests must fail with it.
# Run: scripts/revert-check.py <this file>
module: agister

# Agister chooses no session ID.
[a fresh call asks the runtime to resume no session]
file: internal/app/calls.go
find: ResumeSessionID: resumeSessionID,
replace: ResumeSessionID: resumeSessionID + record.ID,
test: ./internal/app TestCompletedCallSendsTheComposedPayloads

[a fresh Claude Code turn names no session]
file: internal/adapters/runtime/claudecode/claudecode.go
find: \tif request.ResumeSessionID != "" {\n\t\targs = append(args, "--resume"
replace: \targs = append(args, "--session-id", "00000000-0000-4000-8000-000000000001")\n\tif request.ResumeSessionID != "" {\n\t\targs = append(args, "--resume"
test: ./internal/adapters/runtime/claudecode TestArgumentsCarryPrimitivesAndContractFlags
test: ./internal/adapters/runtime/claudecode TestContinuationResumesInPlaceAndCostLimitIsPassed

# Claude Code resumes in place.
[a Claude Code continuation does not fork]
file: internal/adapters/runtime/claudecode/claudecode.go
find: args = append(args, "--resume", request.ResumeSessionID)\n
replace: args = append(args, "--resume", request.ResumeSessionID, "--fork-session")\n
test: ./internal/adapters/runtime/claudecode TestContinuationResumesInPlaceAndCostLimitIsPassed

[Claude Code reports that it resumes sessions]
file: internal/adapters/runtime/claudecode/claudecode.go
find: Version: version, Resume: true, CostLimit: true}
replace: Version: version, CostLimit: true}
test: ./cmd/agister TestContinuationEndToEnd

[a Claude Code resume turn reporting another session fails]
file: internal/adapters/runtime/claudecode/claudecode.go
find: \tif s.resumedElsewhere() {
replace: \tif s.ResumedSessionID == "never" {
test: ./internal/adapters/runtime/claudecode TestResumeReportingAnotherSessionFails
test: ./internal/adapters/runtime/claudecode TestConformance

[a Claude Code resume turn whose result names no session fails]
file: internal/adapters/runtime/claudecode/claudecode.go
find: reported := s.ProviderSessionID != "" || s.Result != nil
replace: reported := s.ProviderSessionID != ""
test: ./internal/adapters/runtime/claudecode TestResumeReportingAnotherSessionFails

# Codex resumes in place.
[Codex is contract codex/2]
file: internal/adapters/runtime/codex/codex.go
find: const Contract = "codex/2"
replace: const Contract = "codex/1"
test: ./internal/adapters/runtime/codex TestIdentityReportsResume

[Codex reports that it resumes sessions]
file: internal/adapters/runtime/codex/codex.go
find: Version: version, Resume: true}
replace: Version: version}
test: ./internal/adapters/runtime/codex TestIdentityReportsResume

[a Codex continuation runs exec resume on the thread]
file: internal/adapters/runtime/codex/codex.go
find: "exec", "resume", request.ResumeSessionID, "--json", "--skip-git-repo-check",
replace: "exec", "--json", "--skip-git-repo-check",
test: ./internal/adapters/runtime/codex TestResumeArguments
test: ./internal/adapters/runtime/codex TestConformance

[a Codex continuation sets the sandbox as config]
file: internal/adapters/runtime/codex/codex.go
find: "--config", fmt.Sprintf("sandbox_mode=%q", request.Primitives[0]),
replace: "--sandbox", request.Primitives[0],
test: ./internal/adapters/runtime/codex TestResumeArguments

[a Codex continuation keeps the settings of a fresh turn]
file: internal/adapters/runtime/codex/codex.go
find: \targs = append(args,\n\t\t"--config", `approval_policy="never"`,
replace: \tif request.ResumeSessionID != "" {\n\t\treturn append(args, "-"), nil\n\t}\n\targs = append(args,\n\t\t"--config", `approval_policy="never"`,
test: ./internal/adapters/runtime/codex TestResumeArguments

[a Codex resume turn reporting another thread fails]
file: internal/adapters/runtime/codex/codex.go
find: \tif s.resumedElsewhere() {
replace: \tif s.ResumedThreadID == "never" {
test: ./internal/adapters/runtime/codex TestResumeReportingAnotherThreadFails
test: ./internal/adapters/runtime/codex TestConformance

[a Codex resume turn that reports no thread fails]
file: internal/adapters/runtime/codex/codex.go
find: reported := s.ThreadID != "" || s.Completed || s.Failed != ""
replace: reported := s.ThreadID != ""
test: ./internal/adapters/runtime/codex TestResumeReportingAnotherThreadFails

# Every session ID Claude Code reports is checked.
[a Claude Code result naming another session fails]
file: internal/adapters/runtime/claudecode/claudecode.go
find: mismatch := s.check(sessionID)
replace: mismatch := s.check("")
test: ./internal/adapters/runtime/claudecode TestResumeReportingAnotherSessionFails

[a session mismatch is kept through reconciliation]
file: internal/adapters/runtime/claudecode/claudecode.go
find: (s.OtherSessionID != "" || reported && s.ProviderSessionID != s.ResumedSessionID)
replace: (reported && s.ProviderSessionID != s.ResumedSessionID)
test: ./internal/adapters/runtime/claudecode TestResumeReportingAnotherSessionFails

[Claude Code is contract claude-code/2]
file: internal/adapters/runtime/claudecode/claudecode.go
find: const Contract = "claude-code/2"
replace: const Contract = "claude-code/1"
test: ./cmd/agister TestContinuationEndToEnd
