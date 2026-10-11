package settings_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// Rule 6, as far as check can know it without the runtime: a repair turn
// resumes the call's session, so more than one attempt needs a process
// whose calls' sessions may be resumed (ADR-030 rule 3).
func TestVerifyRepairsNeedAResumableProcess(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		session  string
		attempts int
		problem  bool
	}{
		{"one attempt, fresh-only", definition.SessionFresh, 1, false},
		{"one attempt, no session set", "", 1, false},
		{"repairs, resumable", definition.SessionResumable, 3, false},
		{"repairs, fresh-only", definition.SessionFresh, 3, true},
		{"repairs, no session set", "", 3, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := bundle()
			b.Service.MaxVerifyAttempts = 3
			p := b.Processes["p"]
			p.Session, p.Revision = c.session, "v"
			p.Verify = &definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: c.attempts, Instruction: "Fix it."}
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
// resumed, and it may not where the process says nothing. A resumable one
// repairs and recovers; a fresh-only one that repairs or recovers has a
// problem of its own, whatever agent a node binds it to.
func TestAProcessSaysWhetherItsCallsResume(t *testing.T) {
	t.Parallel()
	const (
		repairs  = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
		recovers = "process p: stale.recover.max_resumes 2 recovers in the call's session, but process p is fresh-only"
	)
	cases := []struct {
		name     string
		process  string
		attempts int
		resumes  int
		want     []string
	}{
		{"resumable, repairs and recovers", definition.SessionResumable, 3, 2, nil},
		{"fresh-only, repairs", definition.SessionFresh, 3, 0, []string{repairs}},
		{"fresh-only, recovers", definition.SessionFresh, 1, 2, []string{recovers}},
		{"fresh-only, repairs and recovers", definition.SessionFresh, 3, 2, []string{repairs, recovers}},
		{"no session set, repairs and recovers", "", 3, 2, []string{repairs, recovers}},
		{"fresh-only, neither", definition.SessionFresh, 1, 0, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := bundle()
			b.Service.MaxVerifyAttempts = 3
			p := b.Processes["p"]
			p.Session = c.process
			p.Revision = "v"
			p.Verify = &definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: c.attempts, Instruction: "Fix it."}
			p.Limits.Stale.Recover = definition.Recover{MaxResumes: &c.resumes, Instruction: "Go on."}
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

// naming is the bundle with max_verify_attempts 3, process p naming
// verify:repo and that verification as given.
func naming(verify definition.Verify) settings.Bundle {
	b := bundle()
	b.Service.MaxVerifyAttempts = 3
	p := b.Processes["p"]
	p.Session, p.Revision = definition.SessionResumable, "v"
	p.VerifyName = "repo"
	b.Processes["p"] = p
	b.Verifies = map[string]definition.Verification{"repo": {Name: "repo", Verify: verify}}
	return b
}

// ADR-010 rule 3: the checks that depend on a verification's values are
// made on the named one's, as on an inline block's.
func TestANamedVerificationIsCheckedWithTheProcessThatNamesIt(t *testing.T) {
	t.Parallel()
	fine := definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: 3, Instruction: "Fix it."}
	cases := []struct {
		name   string
		change func(*settings.Bundle)
		want   string // the one problem; empty for none
	}{
		{"within the limits", func(*settings.Bundle) {}, ""},
		{"timeout above the process's", func(b *settings.Bundle) {
			v := b.Verifies["repo"]
			v.Verify.Timeout = 2 * time.Minute
			b.Verifies["repo"] = v
		}, "process p: verify.timeout 2m0s exceeds the effective timeout 1m0s"},
		{"attempts above the service ceiling", func(b *settings.Bundle) {
			v := b.Verifies["repo"]
			v.Verify.MaxAttempts = 4
			b.Verifies["repo"] = v
		}, "process p: verify.max_attempts 4 exceeds the service limit max_verify_attempts 3"},
		{"repairs in a fresh-only process", func(b *settings.Bundle) {
			p := b.Processes["p"]
			p.Session = definition.SessionFresh
			b.Processes["p"] = p
		}, "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"},
		// Rule 4: the other checks of the process run, without verify values.
		{"no such verification", func(b *settings.Bundle) {
			b.Verifies = nil
			p := b.Processes["p"]
			p.Session = definition.SessionFresh
			b.Processes["p"] = p
		}, ""},
		{"no such verification, another problem", func(b *settings.Bundle) {
			b.Verifies = nil
			delete(b.Schemas, "s")
		}, `process p: output schema "s" does not exist`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := naming(fine)
			c.change(&b)
			var got []string
			for _, problem := range settings.Check(b, mechanisms) {
				got = append(got, problem.String())
			}
			if c.want == "" && len(got) != 0 || c.want != "" && (len(got) != 1 || got[0] != c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}

func TestResolvedLeavesAnInlineVerifyAndTheBundleAsTheyAre(t *testing.T) {
	t.Parallel()
	b := naming(definition.Verify{Command: "true", Timeout: time.Minute, MaxAttempts: 1, Instruction: "Fix it."})
	if got := b.Resolved("p").Verify; got == nil || got.Command != "true" || b.Processes["p"].Verify != nil {
		t.Fatalf("resolved verify %+v, the bundle's %+v", got, b.Processes["p"].Verify)
	}
	inline := &definition.Verify{Command: "inline"}
	b.Processes["q"] = definition.Process{Name: "q", Verify: inline}
	if got := b.Resolved("q").Verify; got != inline {
		t.Fatalf("inline verify = %+v", got)
	}
}
