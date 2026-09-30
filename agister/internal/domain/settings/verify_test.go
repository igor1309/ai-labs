package settings_test

import (
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
			b := bundle()
			b.Service.MaxVerifyAttempts = 3
			agent := b.Agents["a"]
			agent.Session = c.session
			b.Agents["a"] = agent
			p := b.Processes["p"]
			p.Checkout = "v"
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
