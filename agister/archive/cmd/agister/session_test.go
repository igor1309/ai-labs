package main

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// A process's session (ADR-030 rule 3), on real settings directories:
// Agister's home and a repository's .agister. No agent holds one (rule 1).

// A process says whether its runs are continued, whatever the agent its
// workflow binds it to. Saying nothing it is fresh-only, and its run is
// not continued; resumable, the run is continued, in the session it
// reported. A layer sets the field alone: a repository's fresh-only
// replaces home's, and refuses the continuation on every agent.
func TestAProcessThatSetsSessionSaysWhetherItsRunsAreContinued(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	onReviewer := bound(t, home, "ask", "reviewer")
	runs := &newRuns{home: home}
	ask := func(workflow string, more ...string) result {
		return agister(t, home, repo, append([]string{"run", workflow, "--quiet", "--param", "question=q", "--timeout", "1m"}, more...)...)
	}
	// The example ask is resumable; here the process says nothing.
	path := filepath.Join(home, "processes", "ask.yaml")
	resumable := read(t, path)
	silent := strings.Replace(resumable, "session: resumable\n", "", 1)
	if silent == resumable {
		t.Fatalf("the example ask does not set session: resumable:\n%s", resumable)
	}
	write(t, path, silent)
	if r := ask(onReviewer); r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	first := runs.one(t)
	id := filepath.Base(first.dir)
	session := func(r run) any {
		result, _ := r.record["result"].(map[string]any)
		session, _ := result["session"].(map[string]any)
		return session["provider_session_id"]
	}
	if profile, _ := first.record["profile"].(map[string]any); profile["session"] != "fresh-only" {
		t.Fatalf("a process that sets no session ran as %v", first.record["profile"])
	}

	if r := ask(onReviewer, "--continue", id); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "process ask is fresh-only; it cannot continue run "+id) {
		t.Fatalf("continued a process that sets no session: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs.take(t)

	write(t, path, resumable)
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := ask(onReviewer, "--continue", id); r.code != cli.ExitCompleted {
		t.Fatalf("a resumable process was not continued: %d\n%s%s", r.code, r.stdout, r.stderr)
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
	for _, workflow := range []string{onReviewer, "ask_assistant"} {
		if r := ask(workflow, "--continue", id); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "process ask is fresh-only; it cannot continue run "+id) {
			t.Fatalf("a fresh-only process continued by %s: %d\n%s%s", workflow, r.code, r.stdout, r.stderr)
		}
	}
	// process show names the layer that gave the field.
	if r := agister(t, home, repo, "process", "show", "ask"); r.code != 0 || !regexp.MustCompile(`(?m)^ +session +repository$`).MatchString(r.stdout) {
		t.Fatalf("process show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A fresh-only process whose verification repairs is a problem of the
// process, which check reports and which refuses its call, whether the
// process sets fresh-only or says nothing; resumable, it has none on any
// agent. The cases of a fresh-only agent are gone with the agent's session
// (ADR-030 rule 1).
func TestCheckReportsAFreshOnlyProcessThatRepairs(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	bound(t, home, "implement", "reviewer")
	path := filepath.Join(home, "processes", "implement.yaml")
	resumable := read(t, path)
	silent := strings.Replace(resumable, "session: resumable\n", "", 1)
	if silent == resumable {
		t.Fatalf("the example implement does not set session: resumable:\n%s", resumable)
	}
	// Resumable, it repairs on either agent.
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check of the resumable process: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	// implement names verify:repo, which repairs.
	const problem = "process implement: verify.max_attempts 3 repairs in the call's session, but process implement is fresh-only"
	write(t, filepath.Join(repo, "brief.md"), "Do it.\n")
	for _, c := range []struct{ name, text string }{
		{"a process that sets fresh-only", silent + "session: fresh-only\n"},
		{"a process that sets no session", silent},
	} {
		write(t, path, c.text)
		r := agister(t, home, repo, "check")
		if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem+"\n") || strings.Contains(r.stderr, "stops every command") {
			t.Fatalf("check of %s: %d, want %q\n%s%s", c.name, r.code, problem, r.stdout, r.stderr)
		}
		for _, workflow := range []string{"implement_assistant", "implement_reviewer"} {
			r = agister(t, home, repo, "run", workflow, "--quiet", "--param", "brief=brief.md", "--timeout", "1m")
			if r.code != cli.ExitRefused || !strings.Contains(r.stderr, strings.TrimPrefix(problem, "process implement: ")) {
				t.Fatalf("run %s of %s: %d\n%s%s", workflow, c.name, r.code, r.stdout, r.stderr)
			}
		}
	}
}
