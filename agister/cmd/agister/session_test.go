package main

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// A process's session (ADR-030 rule 3), on real settings directories:
// Agister's home and a repository's .agister. Of the example agents,
// assistant is resumable and reviewer is fresh-only.

// A process that sets session says whether its runs are continued, where
// its agent did. Resumable, its run on a fresh-only agent is continued, in
// the session the run reported. A layer sets the field alone: a
// repository's fresh-only replaces home's, and refuses the continuation
// whatever the agent.
func TestAProcessThatSetsSessionSaysWhetherItsRunsAreContinued(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	runs := &newRuns{home: home}
	ask := func(agent string, more ...string) result {
		return agister(t, home, repo, append([]string{"run", "ask", "--agent", agent, "--quiet", "--param", "question=q", "--timeout", "1m"}, more...)...)
	}
	if r := ask("reviewer"); r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	first := runs.one(t)
	id := filepath.Base(first.dir)
	session := func(r run) any {
		result, _ := r.record["result"].(map[string]any)
		session, _ := result["session"].(map[string]any)
		return session["provider_session_id"]
	}

	// The process says nothing: its agent's session decides.
	if r := ask("reviewer", "--continue", id); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "agent reviewer is fresh-only; it cannot continue run "+id) {
		t.Fatalf("continued on a fresh-only agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs.take(t)

	path := filepath.Join(home, "processes", "ask.yaml")
	write(t, path, read(t, path)+"session: resumable\n")
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := ask("reviewer", "--continue", id); r.code != cli.ExitCompleted {
		t.Fatalf("a resumable process continued on a fresh-only agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	continued := runs.one(t)
	profile, _ := continued.record["profile"].(map[string]any)
	if session(first) == nil || session(continued) != session(first) || !strings.Contains(strings.Join(continued.argv(), " "), "--resume "+session(first).(string)) ||
		continued.record["agent"] != "reviewer" || profile["session"] != "resumable" {
		t.Fatalf("the continuation ran in session %v of %v, as %v, by %v", session(continued), session(first), continued.record["profile"], continued.argv())
	}

	// The repository's layer sets the field, and nothing else.
	layer := filepath.Join(repo, ".agister", "processes", "ask.yaml")
	write(t, layer, "session: fresh-only\n")
	for _, agent := range []string{"reviewer", "assistant"} {
		if r := ask(agent, "--continue", id); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "process ask is fresh-only; it cannot continue run "+id) {
			t.Fatalf("a fresh-only process continued on %s: %d\n%s%s", agent, r.code, r.stdout, r.stderr)
		}
	}
	// process show names the layer that gave the field.
	if r := agister(t, home, repo, "process", "show", "ask"); r.code != 0 || !regexp.MustCompile(`(?m)^ +session +repository$`).MatchString(r.stdout) {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A fresh-only process whose verification repairs is a problem of the
// process, which check reports and which refuses its call on a resumable
// agent; resumable, it has none on a fresh-only one.
func TestCheckReportsAFreshOnlyProcessThatRepairs(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	path := filepath.Join(home, "processes", "implement.yaml")
	whole := read(t, path)
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check before the field: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	// implement names verify:repo, which repairs, and the resumable
	// assistant.
	write(t, path, whole+"session: fresh-only\n")
	const problem = "process implement: verify.max_attempts 3 repairs in the call's session, but process implement is fresh-only"
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem+"\n") || strings.Contains(r.stderr, "stops every command") {
		t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}
	write(t, filepath.Join(repo, "brief.md"), "Do it.\n")
	r = agister(t, home, repo, "run", "implement", "--quiet", "--param", "brief=brief.md", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, strings.TrimPrefix(problem, "process implement: ")) {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	// On the fresh-only reviewer, the process that says nothing has the
	// problem with its agent, and the resumable one has none.
	onReviewer := strings.Replace(whole, "uses: agent:assistant\n", "uses: agent:reviewer\n", 1)
	write(t, path, onReviewer)
	const agents = "process implement: verify.max_attempts 3 repairs in the call's session, but agent reviewer is fresh-only"
	if r := agister(t, home, repo, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, agents+"\n") {
		t.Fatalf("check on a fresh-only agent: %d, want %q\n%s%s", r.code, agents, r.stdout, r.stderr)
	}
	write(t, path, onReviewer+"session: resumable\n")
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check of a resumable process on a fresh-only agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}
