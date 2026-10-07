package policy_test

import (
	"os"
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

func researchPolicy(t *testing.T) definition.Policy {
	data, err := os.ReadFile("../../../../research/agister/research/verger/policies/static-review.yaml")
	if err != nil {
		t.Fatal(err)
	}
	// Without the fields Agister refuses.
	data = withoutTopLevel(data, "constraints", "resources", "artifacts")
	pol, err := definition.ParsePolicy(definition.Document{Source: definition.Source{Name: "static-review"}, Bytes: data})
	if err != nil {
		t.Fatal(err)
	}
	return pol
}

func process(t *testing.T, extra string) definition.Process {
	p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "review"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: review
type: process
uses: agent:reviewer
policy: process-policy:static-review
input:
  instruction: Review.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
workspace:
  checkout: candidate_revision
  clean: true
output:
  format: text
` + extra)})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestResearchStaticReviewComposes(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(effective.Permissions, ",") != "repository.read,repository.diff,repository.search" ||
		effective.Access != "read-only" || effective.Scope != "candidate" || effective.Timeout != 20*time.Minute {
		t.Fatalf("effective = %+v", effective)
	}
}

func TestNarrowingIsEnforcedFieldByField(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	cases := map[string]string{
		"timeout: 30m": "timeout: 30m0s widens the policy's 20m0s",
		"tools: {allow: [repository.read, network]}":                    "tools.allow: adds network, which policy static-review does not allow",
		"workspace: {access: read-write, checkout: candidate_revision}": "workspace.access: read-write widens",
		"workspace: {scope: repository, checkout: candidate_revision}":  "scope cannot be overridden",
		"retry: {max_attempts: 3}":                                      "retry.max_attempts: 3 widens",
		"tools: {allow: [teleport]}":                                    `unknown permission "teleport"`,
	}
	for extra, want := range cases {
		var p definition.Process
		if strings.HasPrefix(extra, "workspace:") {
			p = mustProcessWithWorkspace(t, extra)
		} else {
			p = process(t, extra)
		}
		_, err := policy.Compose(service, &pol, p, policy.Caller{})
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", extra, err, want)
		}
	}
}

// mustProcessWithWorkspace replaces the base workspace block.
func mustProcessWithWorkspace(t *testing.T, workspace string) definition.Process {
	p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "review"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: review
type: process
uses: agent:reviewer
policy: process-policy:static-review
input:
  instruction: Review.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
output:
  format: text
` + workspace)})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestNarrowingInThePermittedDirection(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	effective, err := policy.Compose(service, &pol, process(t, `
timeout: 5m
tools: {allow: [repository.read]}
isolation: {deny: [repository.search]}
`), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if effective.Timeout != 5*time.Minute || strings.Join(effective.Permissions, ",") != "repository.read" {
		t.Fatalf("effective = %+v", effective)
	}
}

func TestCallerMayOnlyShorten(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	short, long := 5*time.Minute, 2*time.Hour
	if effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{Timeout: &short}); err != nil || effective.Timeout != short {
		t.Fatalf("effective = %+v, %v", effective, err)
	}
	if _, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{Timeout: &long}); err == nil || !strings.Contains(err.Error(), "caller timeout 2h0m0s widens") {
		t.Fatalf("err = %v", err)
	}
}

func TestPolicyOutsideTheServiceIsInvalidNotClamped(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	long := 2 * time.Hour
	pol.Limits.Timeout = &long
	if _, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{}); err == nil || !strings.Contains(err.Error(), "policy static-review: timeout 2h0m0s exceeds the service limit 1h0m0s") {
		t.Fatalf("err = %v", err)
	}
}

func TestDenialsWinAndEveryProblemIsReported(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	pol.Limits.Allow = append(pol.Limits.Allow, "process.execute")
	effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{})
	if err != nil || strings.Contains(strings.Join(effective.Permissions, ","), "process.execute") {
		t.Fatalf("a denied permission became effective: %+v, %v", effective, err)
	}
	_, err = policy.Compose(service, &pol, process(t, "timeout: 2h\ntools: {allow: [network]}\n"), policy.Caller{})
	if err == nil || !strings.Contains(err.Error(), "timeout") || !strings.Contains(err.Error(), "tools.allow") {
		t.Fatalf("err = %v", err)
	}
}

func TestCostLimitOnlyLowers(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	if effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{}); err != nil || effective.MaxCostUSD != nil {
		t.Fatalf("no layer sets a cost limit: %+v, %v", effective.MaxCostUSD, err)
	}
	two, five := 2.0, 5.0
	pol.Limits.MaxCostUSD = &two
	if effective, err := policy.Compose(service, &pol, process(t, "max_cost_usd: 1.5\n"), policy.Caller{}); err != nil || *effective.MaxCostUSD != 1.5 {
		t.Fatalf("process lowers: %+v, %v", effective.MaxCostUSD, err)
	}
	if _, err := policy.Compose(service, &pol, process(t, "max_cost_usd: 3\n"), policy.Caller{}); err == nil || !strings.Contains(err.Error(), "max_cost_usd: the process sets 3, which widens 2") {
		t.Fatalf("err = %v", err)
	}
	if _, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{MaxCostUSD: &five}); err == nil || !strings.Contains(err.Error(), "the caller sets 5") {
		t.Fatalf("err = %v", err)
	}
	capped := service
	capped.MaxCostUSD = &two
	pol.Limits.MaxCostUSD = &five
	if _, err := policy.Compose(capped, &pol, process(t, ""), policy.Caller{}); err == nil || !strings.Contains(err.Error(), "policy static-review sets 5, which widens 2") {
		t.Fatalf("err = %v", err)
	}
	pol.Limits.MaxCostUSD = nil
	if effective, err := policy.Compose(capped, &pol, process(t, ""), policy.Caller{}); err != nil || *effective.MaxCostUSD != 2 {
		t.Fatalf("the service limit applies when nothing lowers it: %+v, %v", effective.MaxCostUSD, err)
	}
}

// Read-only withholds whatever the vocabulary declares as writing, not a
// fixed set of names.
func TestReadOnlyWithholdsTheVocabularysWritingPermissions(t *testing.T) {
	t.Parallel()
	docs := definition.Service{MaxTimeout: time.Hour, MaxAttempts: 1, Permissions: []string{"docs.read", "docs.write"}, Writing: []string{"docs.write"}}
	compose := func(pol *definition.Policy) []string {
		t.Helper()
		p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "edit"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: edit
type: process
uses: agent:writer
timeout: 1m
tools: {allow: [docs.read, docs.write]}
input: {instruction: Edit.}
output: {format: text}
`)})
		if err != nil {
			t.Fatal(err)
		}
		effective, err := policy.Compose(docs, pol, p, policy.Caller{})
		if err != nil {
			t.Fatal(err)
		}
		return effective.Permissions
	}
	if got := strings.Join(compose(nil), ","); got != "docs.read" {
		t.Errorf("default read-only: permissions %s", got)
	}
	writable := &definition.Policy{Name: "writable", Limits: definition.Limits{Access: "read-write"}}
	if got := strings.Join(compose(writable), ","); got != "docs.read,docs.write" {
		t.Errorf("read-write: permissions %s", got)
	}
}

// The scope follows workspace.checkout; a declared scope must agree with it.
func TestScopeFollowsTheCheckout(t *testing.T) {
	t.Parallel()
	compose := func(workspace string) (policy.Effective, error) {
		t.Helper()
		return policy.Compose(service, nil, mustProcessWithWorkspace(t, "timeout: 1m\n"+workspace), policy.Caller{})
	}
	if effective, err := compose("workspace: {checkout: candidate_revision}"); err != nil || effective.Scope != "candidate" {
		t.Errorf("checkout: scope %q, %v", effective.Scope, err)
	}
	if effective, err := compose(""); err != nil || effective.Scope != "repository" {
		t.Errorf("no checkout: scope %q, %v", effective.Scope, err)
	}
	if _, err := compose("workspace: {scope: repository, checkout: candidate_revision}"); err == nil || !strings.Contains(err.Error(), "scope repository conflicts with workspace.checkout") {
		t.Errorf("repository with checkout: %v", err)
	}
	if _, err := compose("workspace: {scope: candidate}"); err == nil || !strings.Contains(err.Error(), "candidate requires workspace.checkout") {
		t.Errorf("candidate without checkout: %v", err)
	}
}

// withoutTopLevel drops the named top-level YAML fields and their blocks.
func withoutTopLevel(data []byte, keys ...string) []byte {
	var out []string
	skipping := false
	for _, line := range strings.Split(string(data), "\n") {
		if line != "" && line[0] != ' ' && line[0] != '#' {
			skipping = false
			for _, key := range keys {
				if strings.HasPrefix(line, key+":") {
					skipping = true
				}
			}
		}
		if !skipping {
			out = append(out, line)
		}
	}
	return []byte(strings.Join(out, "\n"))
}

// Staleness limits come from the policy; a process may only lower them,
// and one above the timeout the settings declare is invalid. Unset, they
// stay unset.
func TestStalenessLimitsOnlyNarrow(t *testing.T) {
	t.Parallel()
	pol := researchPolicy(t)
	if effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{}); err != nil || effective.Stale != (policy.Stale{}) {
		t.Fatalf("without limits: %+v, %v", effective.Stale, err)
	}

	minutes := func(n int) *time.Duration { d := time.Duration(n) * time.Minute; return &d }
	calls := 5
	pol.Limits.Stale = definition.Stale{NoEvent: minutes(5), NoOutput: minutes(2), ToolCommand: minutes(10), RepeatedToolCalls: &calls}
	effective, err := policy.Compose(service, &pol, process(t, "stale: {no_event: 3m, repeated_tool_calls: 4}"), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if got := effective.Stale; *got.NoEvent != 3*time.Minute || *got.NoOutput != 2*time.Minute || *got.ToolCommand != 10*time.Minute || *got.RepeatedToolCalls != 4 {
		t.Fatalf("stale = %+v", got)
	}

	for extra, want := range map[string]string{
		"stale: {no_event: 6m}":           "stale.no_event: 6m0s widens the policy's 5m0s",
		"stale: {no_output: 3m}":          "stale.no_output: 3m0s widens the policy's 2m0s",
		"stale: {tool_command: 11m}":      "stale.tool_command: 11m0s widens the policy's 10m0s",
		"stale: {repeated_tool_calls: 6}": "stale.repeated_tool_calls: 6 widens the policy's 5",
		// The process narrows the timeout below a limit its policy sets.
		"timeout: 4m": "stale.no_event 5m0s exceeds the timeout 4m0s",
	} {
		if _, err := policy.Compose(service, &pol, process(t, extra), policy.Caller{}); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", extra, err, want)
		}
	}

	// A caller's shorter timeout leaves a limit without effect, not invalid.
	short := time.Minute
	effective, err = policy.Compose(service, &pol, process(t, ""), policy.Caller{Timeout: &short})
	if err != nil || effective.Timeout != time.Minute || *effective.Stale.NoEvent != 5*time.Minute {
		t.Fatalf("caller timeout below the limits: %+v, %v", effective, err)
	}
}

// The recovery of a stale call (ADR-024 rule 5): the policy sets the
// budget's ceiling and a process may only lower it, down to 0; unset is 0.
// The instruction is text: the process's replaces the policy's. A budget
// above 0 needs one.
func TestStaleRecoveryBudgetOnlyNarrows(t *testing.T) {
	t.Parallel()
	resumes := func(n int) *int { return &n }
	cases := []struct {
		name    string
		policy  definition.Recover
		process string
		want    policy.Recover
		problem string
	}{
		{"unset is 0", definition.Recover{}, "", policy.Recover{}, ""},
		{"the policy's ceiling", definition.Recover{MaxResumes: resumes(2), Instruction: "Policy."}, "",
			policy.Recover{MaxResumes: 2, Instruction: "Policy."}, ""},
		{"a process lowers it", definition.Recover{MaxResumes: resumes(2), Instruction: "Policy."}, "stale: {recover: {max_resumes: 1}}",
			policy.Recover{MaxResumes: 1, Instruction: "Policy."}, ""},
		{"a process sets its policy's", definition.Recover{MaxResumes: resumes(2), Instruction: "Policy."}, "stale: {recover: {max_resumes: 2}}",
			policy.Recover{MaxResumes: 2, Instruction: "Policy."}, ""},
		// Without a budget nothing is told, so nothing is carried.
		{"a process lowers it to 0", definition.Recover{MaxResumes: resumes(2), Instruction: "Policy."}, "stale: {recover: {max_resumes: 0}}",
			policy.Recover{}, ""},
		{"a process sets 0 where the policy sets none", definition.Recover{}, "stale: {recover: {max_resumes: 0, instruction: Process.}}",
			policy.Recover{}, ""},
		{"an instruction without a budget", definition.Recover{Instruction: "Policy."}, "",
			policy.Recover{}, ""},
		{"a process widens it", definition.Recover{MaxResumes: resumes(1), Instruction: "Policy."}, "stale: {recover: {max_resumes: 2}}",
			policy.Recover{}, "stale.recover.max_resumes: 2 widens the policy's 1"},
		{"a process widens the policy's 0", definition.Recover{MaxResumes: resumes(0), Instruction: "Policy."}, "stale: {recover: {max_resumes: 1}}",
			policy.Recover{}, "stale.recover.max_resumes: 1 widens the policy's 0"},
		{"a process sets it where the policy sets none", definition.Recover{}, "stale: {recover: {max_resumes: 1, instruction: Process.}}",
			policy.Recover{}, "stale.recover.max_resumes: 1 where the policy sets none; a process may only lower its policy's"},
		{"the process's instruction replaces the policy's", definition.Recover{MaxResumes: resumes(1), Instruction: "Policy."}, "stale: {recover: {instruction: Process.}}",
			policy.Recover{MaxResumes: 1, Instruction: "Process."}, ""},
		{"the process gives the instruction", definition.Recover{MaxResumes: resumes(1)}, "stale: {recover: {instruction: Process.}}",
			policy.Recover{MaxResumes: 1, Instruction: "Process."}, ""},
		{"a budget without an instruction", definition.Recover{MaxResumes: resumes(1)}, "",
			policy.Recover{}, "stale.recover.max_resumes 1 needs stale.recover.instruction: neither the process nor its policy gives one"},
		{"a lowered budget without an instruction", definition.Recover{MaxResumes: resumes(2)}, "stale: {recover: {max_resumes: 1}}",
			policy.Recover{}, "stale.recover.max_resumes 1 needs stale.recover.instruction: neither the process nor its policy gives one"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			pol := researchPolicy(t)
			pol.Limits.Stale.Recover = c.policy
			effective, err := policy.Compose(service, &pol, process(t, c.process), policy.Caller{})
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

// A process without a policy has no budget to lower.
func TestStaleRecoveryNeedsAPolicysBudget(t *testing.T) {
	t.Parallel()
	alone := func(extra string) definition.Process {
		p := process(t, "timeout: 10m\n"+extra)
		p.Policy = ""
		return p
	}
	want := "stale.recover.max_resumes: 1 where the policy sets none; a process may only lower its policy's"
	if _, err := policy.Compose(service, nil, alone("stale: {recover: {max_resumes: 1, instruction: Process.}}"), policy.Caller{}); err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("err = %v, want %q", err, want)
	}
	effective, err := policy.Compose(service, nil, alone("stale: {recover: {max_resumes: 0}}"), policy.Caller{})
	if err != nil || effective.Stale.Recover != (policy.Recover{}) {
		t.Fatalf("lowered to 0: %+v, %v", effective.Stale.Recover, err)
	}
}
