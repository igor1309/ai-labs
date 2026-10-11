package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A node's agent (ADR-030 rule 5), on real settings directories: Agister's
// home and a repository's .agister. The example workflow review_panel has
// the nodes adversarial, architecture and summary, whose processes each
// name the agent reviewer.

// nodeAgents runs review_panel and returns the agent each node's run ran
// on, by node.
func nodeAgents(t *testing.T, home, repo string) map[string]string {
	t.Helper()
	runs := &newRuns{home: home}
	runs.take(t)
	r := agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitCompleted {
		t.Fatalf("run review_panel: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	agents := map[string]string{}
	for _, recorded := range runs.take(t) {
		var record domain.Record
		readJSON(t, filepath.Join(recorded.dir, "record.json"), &record)
		if record.Parent != nil {
			agents[record.Parent.Node] = record.Agent
		}
	}
	return agents
}

// A node runs its process's call on the agent it names: the same example
// processes run on the agents their nodes bind them to. A process names no
// agent and is refused on its own, whatever agent the caller names; a node
// that names none is a problem of the workflow, which refuses it (ADR-030
// rule 5).
func TestANodeBindsItsProcessToAnAgent(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	workflow := filepath.Join(home, "workflows", "review_panel.yaml")
	write(t, workflow, strings.Replace(read(t, workflow),
		"{node: adversarial, uses: process:adversarial_review, agent: reviewer}", "{node: adversarial, uses: process:adversarial_review, agent: assistant}", 1))
	process := filepath.Join(home, "processes", "adversarial_review.yaml")

	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r := agister(t, home, repo, "workflow", "show", "review_panel")
	for _, line := range []string{
		"adversarial: process adversarial_review, agent assistant (runtime claude-code)",
		"architecture: process architecture_review, agent reviewer (runtime claude-code)",
		"summary: process review_summary, agent reviewer (runtime claude-code)",
	} {
		if r.code != 0 || !strings.Contains(r.stdout, line) || strings.Contains(r.stdout, "REFUSED") {
			t.Fatalf("workflow show lacks %q: %d\n%s%s", line, r.code, r.stdout, r.stderr)
		}
	}
	agents := nodeAgents(t, home, repo)
	if agents["adversarial"] != "assistant" || agents["architecture"] != "reviewer" || agents["summary"] != "reviewer" || len(agents) != 3 {
		t.Fatalf("the nodes ran on %v", agents)
	}

	// On its own it has no agent, and the caller gives it none.
	refusal := "process adversarial_review (" + process + "): names no agent: only a workflow's node binds it to one (ADR-030 rule 5)"
	for _, more := range [][]string{nil, {"--agent", "assistant"}} {
		args := append([]string{"run", "adversarial_review", "--quiet", "--param", "base=main"}, more...)
		if r := agister(t, home, repo, args...); r.code != cli.ExitRefused || !strings.Contains(r.stderr, refusal) {
			t.Fatalf("%v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
		}
	}
	// process list names no agent of a process: it has none.
	if r := agister(t, home, repo, "process", "list"); r.code != 0 || !strings.Contains(r.stdout, "adversarial_review\tjson:review-result\n") || strings.Contains(r.stdout, "agent:") {
		t.Fatalf("process list: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	// The node that names none binds its process to no agent: a problem
	// of the workflow, which refuses it.
	write(t, workflow, strings.Replace(read(t, workflow), ", agent: assistant}", "}", 1))
	const problem = "fan_out[0].agent: is required"
	if r := agister(t, home, repo, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, "workflow review_panel: "+problem) {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "workflow review_panel ("+workflow+"): "+problem) {
		t.Fatalf("run review_panel: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A layer sets a node's agent alone (ADR-030 rule 10): a repository's
// join.agent replaces the agent home's join runs on, and nothing else of
// the workflow. An agent no layer has is a problem of the workflow.
func TestALayerSetsTheJoinsAgentAlone(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	layer := filepath.Join(repo, ".agister", "workflows", "review_panel.yaml")
	write(t, layer, "join: {agent: assistant}\n")
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	agents := nodeAgents(t, home, repo)
	if agents["adversarial"] != "reviewer" || agents["architecture"] != "reviewer" || agents["summary"] != "assistant" || len(agents) != 3 {
		t.Fatalf("the nodes ran on %v", agents)
	}

	write(t, layer, "join: {agent: nobody}\n")
	const problem = `join node summary: agent "nobody" does not exist`
	if r := agister(t, home, repo, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, "workflow review_panel: "+problem) {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r := agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, problem) {
		t.Fatalf("run review_panel: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}
