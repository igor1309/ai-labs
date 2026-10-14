package policy_test

import (
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

var service = policy.Ceilings{
	MaxTimeout:  time.Hour,
	MaxAttempts: 1,
	Permissions: []string{"repository.read", "repository.search", "repository.diff", "repository.history.read", "repository.write", "repository.history.write", "process.execute", "network"},
	Writing:     []string{"repository.write", "repository.history.write"},
}

func ptr[T any](value T) *T { return &value }

// review is a static review's declared limits: read-only on the candidate
// it pins, three reading permissions, the rest denied.
func review() policy.Declared {
	return policy.Declared{
		Process:     "review",
		Timeout:     ptr(20 * time.Minute),
		MaxAttempts: ptr(1),
		Allow:       []string{"repository.read", "repository.diff", "repository.search"},
		Deny:        []string{"repository.write", "repository.history.write", "process.execute", "network"},
		Access:      "read-only",
		Scope:       "candidate",
		Pinned:      true,
	}
}

// with is the review with change made to its declared limits.
func with(change func(*policy.Declared)) policy.Declared {
	declared := review()
	change(&declared)
	return declared
}

func TestAReviewComposesItsOwnLimits(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, review(), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(effective.Permissions, ",") != "repository.read,repository.diff,repository.search" ||
		effective.Access != "read-only" || effective.Scope != "candidate" || effective.Timeout != 20*time.Minute || effective.MaxAttempts != 1 {
		t.Fatalf("effective = %+v", effective)
	}
}

// The service's ceilings bound the process's own limits directly (ADR-030
// rule 4): one above them is invalid, never clamped.
func TestTheServiceBoundsTheProcess(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		change func(*policy.Declared)
		want   string
	}{
		{"timeout", func(d *policy.Declared) { d.Timeout = ptr(2 * time.Hour) }, "timeout 2h0m0s exceeds the service limit 1h0m0s"},
		{"attempts", func(d *policy.Declared) { d.MaxAttempts = ptr(3) }, "retry.max_attempts 3 exceeds the service limit 1"},
		{"allow", func(d *policy.Declared) { d.Allow = []string{"teleport"} }, `tools.allow: unknown permission "teleport"`},
		{"deny", func(d *policy.Declared) { d.Deny = []string{"warp"} }, `isolation.deny: unknown permission "warp"`},
	}
	for _, c := range cases {
		if _, err := policy.Compose(service, with(c.change), policy.Caller{}); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want %q", c.name, err, c.want)
		}
	}
}

// A process that sets no timeout has none to run under: nothing else gives
// one.
func TestAProcessWithoutATimeoutIsInvalid(t *testing.T) {
	t.Parallel()
	declared := with(func(d *policy.Declared) { d.Timeout = nil })
	if _, err := policy.Compose(service, declared, policy.Caller{}); err == nil || !strings.Contains(err.Error(), "timeout: the process sets none") {
		t.Fatalf("err = %v", err)
	}
}

func TestAProcessHoldsItsOwnLimits(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, with(func(d *policy.Declared) {
		d.Timeout = ptr(45 * time.Minute)
		d.Allow = []string{"repository.read", "repository.search"}
		d.Deny = []string{"repository.search"}
	}), policy.Caller{})
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
	if effective, err := policy.Compose(service, review(), policy.Caller{Timeout: &short}); err != nil || effective.Timeout != short {
		t.Fatalf("effective = %+v, %v", effective, err)
	}
	if _, err := policy.Compose(service, review(), policy.Caller{Timeout: &long}); err == nil || !strings.Contains(err.Error(), "caller timeout 2h0m0s widens") {
		t.Fatalf("err = %v", err)
	}
}

func TestDenialsWinAndEveryProblemIsReported(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, with(func(d *policy.Declared) { d.Allow = []string{"repository.read", "process.execute"} }), policy.Caller{})
	if err != nil || strings.Contains(strings.Join(effective.Permissions, ","), "process.execute") {
		t.Fatalf("a denied permission became effective: %+v, %v", effective, err)
	}
	_, err = policy.Compose(service, with(func(d *policy.Declared) {
		d.Timeout = ptr(2 * time.Hour)
		d.Allow = []string{"teleport"}
	}), policy.Caller{})
	if err == nil || !strings.Contains(err.Error(), "timeout") || !strings.Contains(err.Error(), "tools.allow") {
		t.Fatalf("err = %v", err)
	}
}

func TestCostLimitOnlyLowers(t *testing.T) {
	t.Parallel()
	cost := func(usd float64) policy.Declared {
		return with(func(d *policy.Declared) { d.MaxCostUSD = ptr(usd) })
	}
	if effective, err := policy.Compose(service, review(), policy.Caller{}); err != nil || effective.MaxCostUSD != nil {
		t.Fatalf("nothing sets a cost limit: %+v, %v", effective.MaxCostUSD, err)
	}
	five := 5.0
	if effective, err := policy.Compose(service, cost(1.5), policy.Caller{}); err != nil || *effective.MaxCostUSD != 1.5 {
		t.Fatalf("the process sets it: %+v, %v", effective.MaxCostUSD, err)
	}
	if _, err := policy.Compose(service, cost(2), policy.Caller{MaxCostUSD: &five}); err == nil || !strings.Contains(err.Error(), "max_cost_usd: the caller sets 5, which widens 2") {
		t.Fatalf("err = %v", err)
	}
	two := 2.0
	capped := service
	capped.MaxCostUSD = &two
	if _, err := policy.Compose(capped, cost(5), policy.Caller{}); err == nil || !strings.Contains(err.Error(), "max_cost_usd: the process sets 5, which widens 2") {
		t.Fatalf("err = %v", err)
	}
	if effective, err := policy.Compose(capped, cost(1.5), policy.Caller{}); err != nil || *effective.MaxCostUSD != 1.5 {
		t.Fatalf("the process lowers the service's: %+v, %v", effective.MaxCostUSD, err)
	}
	if effective, err := policy.Compose(capped, review(), policy.Caller{}); err != nil || *effective.MaxCostUSD != 2 {
		t.Fatalf("the service limit applies when nothing lowers it: %+v, %v", effective.MaxCostUSD, err)
	}
}

// Read-only withholds whatever the vocabulary declares as writing, not a
// fixed set of names.
func TestReadOnlyWithholdsTheVocabularysWritingPermissions(t *testing.T) {
	t.Parallel()
	docs := policy.Ceilings{MaxTimeout: time.Hour, MaxAttempts: 1, Permissions: []string{"docs.read", "docs.write"}, Writing: []string{"docs.write"}}
	compose := func(access string) []string {
		t.Helper()
		effective, err := policy.Compose(docs, policy.Declared{
			Process: "edit",
			Timeout: ptr(time.Minute),
			Allow:   []string{"docs.read", "docs.write"},
			Access:  access,
		}, policy.Caller{})
		if err != nil {
			t.Fatal(err)
		}
		return effective.Permissions
	}
	if got := strings.Join(compose(""), ","); got != "docs.read" {
		t.Errorf("default read-only: permissions %s", got)
	}
	if got := strings.Join(compose("read-write"), ","); got != "docs.read,docs.write" {
		t.Errorf("read-write: permissions %s", got)
	}
}

// The scope follows the pinned revision; a declared scope must agree with
// it.
func TestScopeFollowsTheRevision(t *testing.T) {
	t.Parallel()
	compose := func(scope string, pinned bool) (policy.Effective, error) {
		t.Helper()
		return policy.Compose(service, with(func(d *policy.Declared) {
			d.Access, d.Scope, d.Pinned = "", scope, pinned
		}), policy.Caller{})
	}
	if effective, err := compose("", true); err != nil || effective.Scope != "candidate" {
		t.Errorf("revision: scope %q, %v", effective.Scope, err)
	}
	if effective, err := compose("", false); err != nil || effective.Scope != "repository" {
		t.Errorf("no revision: scope %q, %v", effective.Scope, err)
	}
	if _, err := compose("repository", true); err == nil || !strings.Contains(err.Error(), "scope repository conflicts with workspace.revision") {
		t.Errorf("repository with a revision: %v", err)
	}
	if _, err := compose("candidate", false); err == nil || !strings.Contains(err.Error(), "candidate requires workspace.revision") {
		t.Errorf("candidate without a revision: %v", err)
	}
}

// Staleness limits are the process's own: unset, they stay unset, and one
// above the timeout the process declares is invalid.
func TestStalenessLimitsAreTheProcesss(t *testing.T) {
	t.Parallel()
	if effective, err := policy.Compose(service, review(), policy.Caller{}); err != nil || effective.Stale != (policy.Stale{}) {
		t.Fatalf("without limits: %+v, %v", effective.Stale, err)
	}

	effective, err := policy.Compose(service, with(func(d *policy.Declared) {
		d.Stale = policy.DeclaredStale{NoEvent: ptr(5 * time.Minute), NoOutput: ptr(2 * time.Minute), ToolCommand: ptr(10 * time.Minute), RepeatedToolCalls: ptr(4)}
	}), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if got := effective.Stale; *got.NoEvent != 5*time.Minute || *got.NoOutput != 2*time.Minute || *got.ToolCommand != 10*time.Minute || *got.RepeatedToolCalls != 4 {
		t.Fatalf("stale = %+v", got)
	}

	// The composition refuses a limit above the timeout, whatever gave the
	// process its limits.
	above := 21 * time.Minute
	for field, set := range map[string]func(*policy.DeclaredStale){
		"stale.no_event":     func(s *policy.DeclaredStale) { s.NoEvent = &above },
		"stale.no_output":    func(s *policy.DeclaredStale) { s.NoOutput = &above },
		"stale.tool_command": func(s *policy.DeclaredStale) { s.ToolCommand = &above },
	} {
		declared := with(func(d *policy.Declared) { set(&d.Stale) })
		want := field + " 21m0s exceeds the timeout 20m0s"
		if _, err := policy.Compose(service, declared, policy.Caller{}); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", field, err, want)
		}
	}

	// A caller's shorter timeout leaves a limit without effect, not invalid.
	short := time.Minute
	effective, err = policy.Compose(service, with(func(d *policy.Declared) { d.Stale.NoEvent = ptr(5 * time.Minute) }), policy.Caller{Timeout: &short})
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
		stale   policy.DeclaredStale
		want    policy.Recover
		problem string
	}{
		{"unset is 0", policy.DeclaredStale{}, policy.Recover{}, ""},
		{"a budget", policy.DeclaredStale{MaxResumes: ptr(2), Instruction: "Process."},
			policy.Recover{MaxResumes: 2, Instruction: "Process."}, ""},
		// Without a budget nothing is told, so nothing is carried.
		{"0", policy.DeclaredStale{MaxResumes: ptr(0), Instruction: "Process."}, policy.Recover{}, ""},
		{"an instruction without a budget", policy.DeclaredStale{Instruction: "Process."}, policy.Recover{}, ""},
		{"a budget without an instruction", policy.DeclaredStale{MaxResumes: ptr(1)},
			policy.Recover{}, "stale.recover.max_resumes 1 needs stale.recover.instruction: the process gives none"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			effective, err := policy.Compose(service, with(func(d *policy.Declared) { d.Stale = c.stale }), policy.Caller{})
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

// editor is a process that allows a writing permission, with access as its
// workspace access.
func editor(access string) policy.Declared {
	return policy.Declared{
		Process: "edit",
		Timeout: ptr(time.Minute),
		Allow:   []string{"repository.read", "repository.write"},
		Access:  access,
	}
}

// A process holds its own workspace access: one that sets read-write
// composes read-write, and keeps the writing permissions it allows.
func TestAProcessMayBeReadWrite(t *testing.T) {
	t.Parallel()
	effective, err := policy.Compose(service, editor("read-write"), policy.Caller{})
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
	for name, access := range map[string]string{"no access": "", "read-only": "read-only"} {
		effective, err := policy.Compose(service, editor(access), policy.Caller{})
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if got := strings.Join(effective.Permissions, ","); effective.Access != "read-only" || got != "repository.read" {
			t.Errorf("%s: access %q with permissions %s, want read-only with repository.read", name, effective.Access, got)
		}
	}
}
