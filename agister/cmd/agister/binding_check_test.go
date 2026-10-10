package main

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// The binding check (ADR-030 rules 7 and 8), on real settings directories:
// the example runtime mapping claude-code gives the example reviews none
// of its primitives, each of which grants more than a review allows, so
// every permission a review allows is withheld.

// check lists what each node of each workflow allows and does not require
// that its plan withholds, and workflow show shows it on each node; a
// permission in tools.require a binding would withhold is a warning that
// names the workflow and the node.
func TestCheckAndWorkflowShowListWhatEachBindingWithholds(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "workflows", "asking.yaml"), askingDoc)

	r := agister(t, home, repo, "check")
	for _, line := range []string{
		"withheld workflow review_panel node adversarial: process adversarial_review, agent reviewer (runtime claude-code version 2.1): repository.read, repository.diff, repository.search\n",
		"withheld workflow review_panel node summary: process review_summary, agent reviewer (runtime claude-code version 2.1): repository.read, repository.diff, repository.search, repository.history.read, process.execute, host.read\n",
	} {
		if r.code != 0 || !strings.Contains(r.stdout, line) || strings.Contains(r.stderr, "warning workflow") {
			t.Fatalf("check lacks %q: %d\n%s%s", line, r.code, r.stdout, r.stderr)
		}
	}
	var report contract.CheckReport
	r = agister(t, home, repo, "check", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || len(report.Bindings) != 4 {
		t.Fatalf("check --json: %v, bindings %+v\n%s%s", err, report.Bindings, r.stdout, r.stderr)
	}
	if call := report.Bindings[0]; call.Workflow != "asking" || call.Node != "question" || call.Process != "ask" || call.Agent != "reviewer" || call.Runtime != "claude-code" {
		t.Fatalf("the first binding is %+v, want asking's call", call)
	}

	r = agister(t, home, repo, "workflow", "show", "review_panel")
	for _, line := range []string{
		"fan-out      adversarial: process adversarial_review, agent reviewer (runtime claude-code)\n" +
			"  receives   params base, candidate\n" +
			"  plan       (none)\n" +
			"  withheld   repository.read, repository.diff, repository.search\n",
	} {
		if r.code != 0 || !strings.Contains(r.stdout, line) {
			t.Fatalf("workflow show lacks %q: %d\n%s%s", line, r.code, r.stdout, r.stderr)
		}
	}

	// The call requires what the reviewer's runtime withholds.
	process := filepath.Join(home, "processes", "ask.yaml")
	write(t, process, strings.Replace(read(t, process), "tools:\n  allow:\n", "tools:\n  require: [repository.read]\n  allow:\n", 1))
	r = agister(t, home, repo, "check")
	const warning = "warning workflow asking: call node question: process ask: tools.require would withhold repository.read on agent reviewer's runtime claude-code\n"
	if !strings.Contains(r.stderr, warning) {
		t.Fatalf("check lacks %q: %d\n%s%s", warning, r.code, r.stdout, r.stderr)
	}
}
