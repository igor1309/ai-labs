package settings_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// Rule 6, as far as check can know it without the runtime: a repair turn
// resumes the call's session, so more than one attempt needs a process
// whose calls' sessions may be resumed (ADR-030 rule 3).
func TestVerifyRepairsNeedAResumableProcess(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		resumable bool
		attempts  int
		problem   bool
	}{
		{"one attempt, fresh-only", false, 1, false},
		{"repairs, resumable", true, 3, false},
		{"repairs, fresh-only", false, 3, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := bundle()
			b.Service.Ceilings.MaxVerifyAttempts = 3
			p := b.Processes["p"]
			p.Resumable, p.Limits.Pinned = c.resumable, true
			p.Limits.Verify = &policy.Verify{Timeout: time.Minute, MaxAttempts: c.attempts}
			b.Processes["p"] = p

			var got []string
			for _, problem := range settings.Check(b, mechanisms) {
				got = append(got, problem.String())
			}
			want := "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
			if c.problem && (len(got) != 1 || got[0] != want) {
				t.Fatalf("problems = %q, want %q", got, want)
			}
			if !c.problem && len(got) != 0 {
				t.Fatalf("problems = %q", strings.Join(got, "\n"))
			}
		})
	}
}

// ADR-030 rule 3: the process says whether its calls' session may be
// resumed. A resumable one repairs and recovers; a fresh-only one that repairs or recovers has a
// problem of its own, whatever agent a node binds it to.
func TestAProcessSaysWhetherItsCallsResume(t *testing.T) {
	t.Parallel()
	const (
		repairs  = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
		recovers = "process p: stale.recover.max_resumes 2 recovers in the call's session, but process p is fresh-only"
	)
	cases := []struct {
		name      string
		resumable bool
		attempts  int
		resumes   int
		want      []string
	}{
		{"resumable, repairs and recovers", true, 3, 2, nil},
		{"fresh-only, repairs", false, 3, 0, []string{repairs}},
		{"fresh-only, recovers", false, 1, 2, []string{recovers}},
		{"fresh-only, repairs and recovers", false, 3, 2, []string{repairs, recovers}},
		{"fresh-only, neither", false, 1, 0, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := bundle()
			b.Service.Ceilings.MaxVerifyAttempts = 3
			p := b.Processes["p"]
			p.Resumable, p.Limits.Pinned = c.resumable, true
			p.Limits.Verify = &policy.Verify{Timeout: time.Minute, MaxAttempts: c.attempts}
			p.Limits.Stale.MaxResumes, p.Limits.Stale.Instruction = &c.resumes, "Go on."
			b.Processes["p"] = p

			var got []string
			for _, problem := range settings.Check(b, mechanisms) {
				got = append(got, problem.String())
				if problem.Agent != "" {
					t.Errorf("%q depends on agent %s: it is the process's own", problem, problem.Agent)
				}
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}
