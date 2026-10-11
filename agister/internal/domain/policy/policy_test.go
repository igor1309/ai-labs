package policy_test

import (
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

var service = definition.Service{
	MaxTimeout:  time.Hour,
	MaxAttempts: 1,
	Permissions: []string{"repository.read", "repository.search", "repository.diff", "repository.history.read", "repository.write", "repository.history.write", "process.execute", "network"},
	Writing:     []string{"repository.write", "repository.history.write"},
}

// review are a static review's limits, by their top-level field: a
// process of these tests holds each that its extra fields do not set.
var review = []struct{ field, text string }{
	{"workspace", "workspace: {access: read-only, scope: candidate, revision: candidate_revision, clean: true}"},
	{"tools", "tools: {allow: [repository.read, repository.diff, repository.search]}"},
	{"timeout", "timeout: 20m"},
	{"retry", "retry: {max_attempts: 1}"},
	{"isolation", "isolation: {deny: [repository.write, repository.history.write, process.execute, network]}"},
}

// process is a review process with the static review's limits, extra's
// top-level fields in place of its own.
func process(t *testing.T, extra string) definition.Process {
	t.Helper()
	set := map[string]bool{}
	for _, line := range strings.Split(extra, "\n") {
		if field, _, ok := strings.Cut(line, ":"); ok && !strings.HasPrefix(line, " ") {
			set[field] = true
		}
	}
	var limits []string
	for _, limit := range review {
		if !set[limit.field] {
			limits = append(limits, limit.text)
		}
	}
	p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "review"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: review
type: process
prompt: review
input:
  instruction: Review.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
output:
  format: text
` + strings.Join(limits, "\n") + "\n" + extra)})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestAReviewComposesItsOwnLimits(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, process(t, ""), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(effective.Permissions, ",") != "repository.read,repository.diff,repository.search" ||
		effective.Access != "read-only" || effective.Scope != "candidate" || effective.Timeout != 20*time.Minute || effective.MaxAttempts != 1 {
		t.Fatalf("effective = %+v", effective)
	}
}

// With no policy, the service's ceilings bound the process's own limits
// directly (ADR-030 rule 4): one above them is invalid, never clamped.
func TestTheServiceBoundsTheProcess(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"timeout: 2h":                "timeout 2h0m0s exceeds the service limit 1h0m0s",
		"retry: {max_attempts: 3}":   "retry.max_attempts 3 exceeds the service limit 1",
		"tools: {allow: [teleport]}": `tools.allow: unknown permission "teleport"`,
		"isolation: {deny: [warp]}":  `isolation.deny: unknown permission "warp"`,
	}
	for extra, want := range cases {
		if _, err := policy.Compose(service, process(t, extra), policy.Caller{}); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", extra, err, want)
		}
	}
}

// A process that sets no timeout has none to run under: nothing else gives
// one.
func TestAProcessWithoutATimeoutIsInvalid(t *testing.T) {
	t.Parallel()
	p := process(t, "")
	p.Limits.Timeout = nil
	if _, err := policy.Compose(service, p, policy.Caller{}); err == nil || !strings.Contains(err.Error(), "timeout: the process sets none") {
		t.Fatalf("err = %v", err)
	}
}

func TestAProcessHoldsItsOwnLimits(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, process(t, `
timeout: 45m
retry: {max_attempts: 1}
tools: {allow: [repository.read, repository.search]}
isolation: {deny: [repository.search]}
`), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if effective.Timeout != 45*time.Minute || strings.Join(effective.Permissions, ",") != "repository.read" {
		t.Fatalf("effective = %+v", effective)
	}
}

func TestCallerMayOnlyShorten(t *testing.T) {
	t.Parallel()
	short, long := 5*time.Minute, 2*time.Hour
	if effective, err := policy.Compose(service, process(t, ""), policy.Caller{Timeout: &short}); err != nil || effective.Timeout != short {
		t.Fatalf("effective = %+v, %v", effective, err)
	}
	if _, err := policy.Compose(service, process(t, ""), policy.Caller{Timeout: &long}); err == nil || !strings.Contains(err.Error(), "caller timeout 2h0m0s widens") {
		t.Fatalf("err = %v", err)
	}
}

func TestDenialsWinAndEveryProblemIsReported(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, process(t, "tools: {allow: [repository.read, process.execute]}\n"), policy.Caller{})
	if err != nil || strings.Contains(strings.Join(effective.Permissions, ","), "process.execute") {
		t.Fatalf("a denied permission became effective: %+v, %v", effective, err)
	}
	_, err = policy.Compose(service, process(t, "timeout: 2h\ntools: {allow: [teleport]}\n"), policy.Caller{})
	if err == nil || !strings.Contains(err.Error(), "timeout") || !strings.Contains(err.Error(), "tools.allow") {
		t.Fatalf("err = %v", err)
	}
}

func TestCostLimitOnlyLowers(t *testing.T) {
	t.Parallel()
	if effective, err := policy.Compose(service, process(t, ""), policy.Caller{}); err != nil || effective.MaxCostUSD != nil {
		t.Fatalf("nothing sets a cost limit: %+v, %v", effective.MaxCostUSD, err)
	}
	five := 5.0
	if effective, err := policy.Compose(service, process(t, "max_cost_usd: 1.5\n"), policy.Caller{}); err != nil || *effective.MaxCostUSD != 1.5 {
		t.Fatalf("the process sets it: %+v, %v", effective.MaxCostUSD, err)
	}
	if _, err := policy.Compose(service, process(t, "max_cost_usd: 2\n"), policy.Caller{MaxCostUSD: &five}); err == nil || !strings.Contains(err.Error(), "max_cost_usd: the caller sets 5, which widens 2") {
		t.Fatalf("err = %v", err)
	}
	two := 2.0
	capped := service
	capped.MaxCostUSD = &two
	if _, err := policy.Compose(capped, process(t, "max_cost_usd: 5\n"), policy.Caller{}); err == nil || !strings.Contains(err.Error(), "max_cost_usd: the process sets 5, which widens 2") {
		t.Fatalf("err = %v", err)
	}
	if effective, err := policy.Compose(capped, process(t, "max_cost_usd: 1.5\n"), policy.Caller{}); err != nil || *effective.MaxCostUSD != 1.5 {
		t.Fatalf("the process lowers the service's: %+v, %v", effective.MaxCostUSD, err)
	}
	if effective, err := policy.Compose(capped, process(t, ""), policy.Caller{}); err != nil || *effective.MaxCostUSD != 2 {
		t.Fatalf("the service limit applies when nothing lowers it: %+v, %v", effective.MaxCostUSD, err)
	}
}

// Read-only withholds whatever the vocabulary declares as writing, not a
// fixed set of names.
func TestReadOnlyWithholdsTheVocabularysWritingPermissions(t *testing.T) {
	t.Parallel()
	docs := definition.Service{MaxTimeout: time.Hour, MaxAttempts: 1, Permissions: []string{"docs.read", "docs.write"}, Writing: []string{"docs.write"}}
	compose := func(workspace string) []string {
		t.Helper()
		p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "edit"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: edit
type: process
prompt: review
timeout: 1m
tools: {allow: [docs.read, docs.write]}
input: {instruction: Edit.}
output: {format: text}
` + workspace)})
		if err != nil {
			t.Fatal(err)
		}
		effective, err := policy.Compose(docs, p, policy.Caller{})
		if err != nil {
			t.Fatal(err)
		}
		return effective.Permissions
	}
	if got := strings.Join(compose(""), ","); got != "docs.read" {
		t.Errorf("default read-only: permissions %s", got)
	}
	if got := strings.Join(compose("workspace: {access: read-write}"), ","); got != "docs.read,docs.write" {
		t.Errorf("read-write: permissions %s", got)
	}
}

// The scope follows workspace.revision; a declared scope must agree with it.
func TestScopeFollowsTheRevision(t *testing.T) {
	t.Parallel()
	compose := func(workspace string) (policy.Effective, error) {
		t.Helper()
		return policy.Compose(service, process(t, "workspace: {"+workspace+"}"), policy.Caller{})
	}
	if effective, err := compose("revision: candidate_revision"); err != nil || effective.Scope != "candidate" {
		t.Errorf("revision: scope %q, %v", effective.Scope, err)
	}
	if effective, err := compose(""); err != nil || effective.Scope != "repository" {
		t.Errorf("no revision: scope %q, %v", effective.Scope, err)
	}
	if _, err := compose("scope: repository, revision: candidate_revision"); err == nil || !strings.Contains(err.Error(), "scope repository conflicts with workspace.revision") {
		t.Errorf("repository with a revision: %v", err)
	}
	if _, err := compose("scope: candidate"); err == nil || !strings.Contains(err.Error(), "candidate requires workspace.revision") {
		t.Errorf("candidate without a revision: %v", err)
	}
}

// Staleness limits are the process's own: unset, they stay unset, and one
// above the timeout the process declares is invalid.
func TestStalenessLimitsAreTheProcesss(t *testing.T) {
	t.Parallel()
	if effective, err := policy.Compose(service, process(t, ""), policy.Caller{}); err != nil || effective.Stale != (policy.Stale{}) {
		t.Fatalf("without limits: %+v, %v", effective.Stale, err)
	}

	effective, err := policy.Compose(service, process(t, "stale: {no_event: 5m, no_output: 2m, tool_command: 10m, repeated_tool_calls: 4}"), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if got := effective.Stale; *got.NoEvent != 5*time.Minute || *got.NoOutput != 2*time.Minute || *got.ToolCommand != 10*time.Minute || *got.RepeatedToolCalls != 4 {
		t.Fatalf("stale = %+v", got)
	}

	// Parsing refuses a limit above the timeout of the same document; the
	// composition refuses it whatever gave the process its limits.
	above := 21 * time.Minute
	for field, set := range map[string]func(*definition.Stale){
		"stale.no_event":     func(s *definition.Stale) { s.NoEvent = &above },
		"stale.no_output":    func(s *definition.Stale) { s.NoOutput = &above },
		"stale.tool_command": func(s *definition.Stale) { s.ToolCommand = &above },
	} {
		p := process(t, "")
		set(&p.Limits.Stale)
		want := field + " 21m0s exceeds the timeout 20m0s"
		if _, err := policy.Compose(service, p, policy.Caller{}); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", field, err, want)
		}
	}

	// A caller's shorter timeout leaves a limit without effect, not invalid.
	short := time.Minute
	effective, err = policy.Compose(service, process(t, "stale: {no_event: 5m}"), policy.Caller{Timeout: &short})
	if err != nil || effective.Timeout != time.Minute || *effective.Stale.NoEvent != 5*time.Minute {
		t.Fatalf("caller timeout below the limits: %+v, %v", effective, err)
	}
}

// The recovery of a stale call is the process's own (ADR-024 rule 5, as
// ADR-030 rule 4 amends it): unset is 0, and a budget above 0 needs an
// instruction.
func TestStaleRecoveryIsTheProcesss(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		process string
		want    policy.Recover
		problem string
	}{
		{"unset is 0", "", policy.Recover{}, ""},
		{"a budget", "stale: {recover: {max_resumes: 2, instruction: Process.}}",
			policy.Recover{MaxResumes: 2, Instruction: "Process."}, ""},
		// Without a budget nothing is told, so nothing is carried.
		{"0", "stale: {recover: {max_resumes: 0, instruction: Process.}}", policy.Recover{}, ""},
		{"an instruction without a budget", "stale: {recover: {instruction: Process.}}", policy.Recover{}, ""},
		{"a budget without an instruction", "stale: {recover: {max_resumes: 1}}",
			policy.Recover{}, "stale.recover.max_resumes 1 needs stale.recover.instruction: the process gives none"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			effective, err := policy.Compose(service, process(t, c.process), policy.Caller{})
			if c.problem != "" {
				if err == nil || !strings.Contains(err.Error(), c.problem) {
					t.Fatalf("err = %v, want %q", err, c.problem)
				}
				return
			}
			if err != nil || effective.Stale.Recover != c.want {
				t.Fatalf("recover = %+v, %v, want %+v", effective.Stale.Recover, err, c.want)
			}
		})
	}
}

// editor is a process that allows a writing permission, with workspace as
// its workspace block.
func editor(t *testing.T, workspace string) definition.Process {
	t.Helper()
	p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "edit"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: edit
type: process
prompt: edit
timeout: 1m
tools: {allow: [repository.read, repository.write]}
input: {instruction: Edit.}
output: {format: text}
` + workspace)})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// A process holds its own workspace access: one that sets read-write
// composes read-write, and keeps the writing permissions it allows.
func TestAProcessMayBeReadWrite(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, editor(t, "workspace: {access: read-write}"), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(effective.Permissions, ","); effective.Access != "read-write" || got != "repository.read,repository.write" {
		t.Fatalf("access %q with permissions %s, want read-write with repository.read,repository.write", effective.Access, got)
	}
}

// A process that sets no access, or read-only, is read-only: the writing
// permissions it allows are withheld.
func TestAProcessIsReadOnlyUnlessItSaysSo(t *testing.T) {
	t.Parallel()
	for name, workspace := range map[string]string{"no access": "", "read-only": "workspace: {access: read-only}"} {
		effective, err := policy.Compose(service, editor(t, workspace), policy.Caller{})
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if got := strings.Join(effective.Permissions, ","); effective.Access != "read-only" || got != "repository.read" {
			t.Errorf("%s: access %q with permissions %s, want read-only with repository.read", name, effective.Access, got)
		}
	}
}
