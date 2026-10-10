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
// resumes the call's session, so more than one attempt needs an agent whose
// sessions may be continued.
func TestVerifyRepairsNeedAResumableAgent(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		session  string
		attempts int
		problem  bool
	}{
		{"one attempt, fresh-only", definition.SessionFresh, 1, false},
		{"repairs, resumable", definition.SessionResumable, 3, false},
		{"repairs, fresh-only", definition.SessionFresh, 3, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := bundle()
			b.Service.MaxVerifyAttempts = 3
			agent := b.Agents["a"]
			agent.Session = c.session
			b.Agents["a"] = agent
			p := b.Processes["p"]
			p.Revision = "v"
			p.Verify = &definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: c.attempts, Instruction: "Fix it."}
			b.Processes["p"] = p

			var got []string
			for _, problem := range settings.Check(b, mechanisms) {
				got = append(got, problem.String())
			}
			want := "process p: verify.max_attempts 3 repairs in the call's session, but agent a is fresh-only"
			if c.problem && (len(got) != 1 || got[0] != want) {
				t.Fatalf("problems = %q, want %q", got, want)
			}
			if !c.problem && len(got) != 0 {
				t.Fatalf("problems = %q", strings.Join(got, "\n"))
			}
		})
	}
}

// ADR-030 rule 3: a process that sets session says whether its calls'
// session may be resumed, where its agent did. A resumable one repairs and
// recovers on a fresh-only agent; a fresh-only one that repairs or
// recovers has a problem of its own, on a resumable agent too, which no
// other agent lifts.
func TestAProcessThatSetsSessionSaysWhetherItsCallsResume(t *testing.T) {
	t.Parallel()
	const (
		repairs  = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
		recovers = "process p: stale.recover.max_resumes 2 recovers in the call's session, but process p is fresh-only"
	)
	cases := []struct {
		name     string
		process  string
		agent    string
		attempts int
		resumes  int
		want     []string
	}{
		{"resumable, repairs and recovers on a fresh-only agent", definition.SessionResumable, definition.SessionFresh, 3, 2, nil},
		{"fresh-only, repairs on a resumable agent", definition.SessionFresh, definition.SessionResumable, 3, 0, []string{repairs}},
		{"fresh-only, recovers on a resumable agent", definition.SessionFresh, definition.SessionResumable, 1, 2, []string{recovers}},
		{"fresh-only, repairs and recovers", definition.SessionFresh, definition.SessionFresh, 3, 2, []string{repairs, recovers}},
		{"fresh-only, neither", definition.SessionFresh, definition.SessionFresh, 1, 0, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			b := bundle()
			b.Service.MaxVerifyAttempts = 3
			agent := b.Agents["a"]
			agent.Session = c.agent
			b.Agents["a"] = agent
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
	agent := b.Agents["a"]
	agent.Session = definition.SessionResumable
	b.Agents["a"] = agent
	p := b.Processes["p"]
	p.Revision = "v"
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
		{"repairs on a fresh-only agent", func(b *settings.Bundle) {
			agent := b.Agents["a"]
			agent.Session = definition.SessionFresh
			b.Agents["a"] = agent
		}, "process p: verify.max_attempts 3 repairs in the call's session, but agent a is fresh-only"},
		// Rule 4: the other checks of the process run, without verify values.
		{"no such verification", func(b *settings.Bundle) {
			b.Verifies = nil
			agent := b.Agents["a"]
			agent.Session = definition.SessionFresh
			b.Agents["a"] = agent
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
