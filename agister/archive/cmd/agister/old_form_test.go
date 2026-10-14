package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// The form before ADR-030 is refused, on real settings directories:
// Agister's home, as `agister init` writes it, with one document put back
// into the old form.

// A process that names an agent, an agent that holds a session and a node
// that names no agent are each a problem of the document, which check
// reports, naming the field and what to do, and which refuses the run that
// depends on it before its runtime starts (ADR-030 rules 1, 2 and 5).
func TestCheckReportsTheFormBeforeAWorkflowBoundAProcessToAnAgent(t *testing.T) {
	t.Parallel()
	ask := []string{"ask_assistant", "--param", "question=q", "--timeout", "1m"}
	panel := []string{"review_panel", "--param", "base=main", "--param", "architecture=a.txt"}
	for _, c := range []struct {
		name string
		// file is the document, relative to home, and from and to the
		// text of it that is put back into the old form.
		file, from, to string
		problem        string
		run            []string
	}{
		{"uses on a process", filepath.Join("processes", "ask.yaml"), "type: process\n", "type: process\nuses: agent:assistant\n",
			"process ask: uses: a process names no agent (ADR-030 rule 2): name the agent on each workflow node that binds the process, and remove uses", ask},
		{"session on an agent", filepath.Join("agents", "assistant.toml"), `runtime = "claude-code"` + "\n", `runtime = "claude-code"` + "\n" + `session = "resumable"` + "\n",
			"agent assistant: session: an agent holds no session (ADR-030 rule 1): set session on each process whose calls resume theirs, and remove it here", ask},
		{"a fan-out node without agent", filepath.Join("workflows", "review_panel.yaml"), "{node: adversarial, uses: process:adversarial_review, agent: reviewer}", "{node: adversarial, uses: process:adversarial_review}",
			"workflow review_panel: fan_out[0].agent: is required", panel},
		{"a join without agent", filepath.Join("workflows", "review_panel.yaml"), "{node: summary, uses: process:review_summary, agent: reviewer}", "{node: summary, uses: process:review_summary}",
			"workflow review_panel: join.agent: is required", panel},
		{"a call without agent", filepath.Join("workflows", "ask_assistant.yaml"), "{node: ask, uses: process:ask, agent: assistant}", "{node: ask, uses: process:ask}",
			"workflow ask_assistant: call.agent: is required", ask},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, "approve")
			if r := agister(t, home, repo, "check"); r.code != 0 {
				t.Fatalf("check of the settings as written: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			path := filepath.Join(home, c.file)
			text := read(t, path)
			if !strings.Contains(text, c.from) {
				t.Fatalf("%s has no %q:\n%s", path, c.from, text)
			}
			write(t, path, strings.Replace(text, c.from, c.to, 1))

			r := agister(t, home, repo, "check")
			if r.code != cli.ExitUsage || !strings.Contains(r.stderr, c.problem+"\n") || strings.Contains(r.stderr, "stops every command") {
				t.Fatalf("check: %d, want %q\n%s%s", r.code, c.problem, r.stdout, r.stderr)
			}
			runs := &newRuns{home: home}
			runs.take(t)
			_, message, _ := strings.Cut(c.problem, ": ")
			r = agister(t, home, repo, append(append([]string{"run"}, c.run...), "--quiet")...)
			if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "("+path+"): "+message) {
				t.Fatalf("run %v: %d, want %q of %s\n%s%s", c.run, r.code, message, path, r.stdout, r.stderr)
			}
			if refused := runs.one(t); refused.first != nil {
				t.Fatalf("run %v: the refused run reached the runtime: %v", c.run, refused.first)
			}
		})
	}
}
