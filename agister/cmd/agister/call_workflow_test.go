package main

import (
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// A workflow of one call (ADR-030 rule 6), on real settings directories:
// workflow asking is one call, node question, which binds the example
// process ask, on its own the resumable assistant's, to the fresh-only
// reviewer.
const askingDoc = `schema: agister.workflow/v1alpha1
name: asking
type: workflow
call: {node: question, uses: process:ask, agent: reviewer}
`

// The workflow takes its process's params, is one run, which names the
// workflow, the process and the agent, and no node record, and takes a
// timeout. It continues one of its own runs where its process is
// resumable, and no run of the process on its own; a fan-out workflow
// still continues none.
func TestAWorkflowOfOneCallIsOneRunOfItsProcess(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "workflows", "asking.yaml"), askingDoc)
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "workflow", "list"); r.code != 0 || !strings.Contains(r.stdout, "asking\tcall question:ask\n") {
		t.Fatalf("workflow list: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r := agister(t, home, repo, "workflow", "show", "asking")
	for _, line := range []string{
		"params       question (required)\n",
		"inputs       question <- param\n",
		"call         question: process ask, agent reviewer (runtime claude-code)\n",
		"  receives   params question: the workflow's, its process's own\n",
	} {
		if r.code != 0 || !strings.Contains(r.stdout, line) || strings.Contains(r.stdout, "REFUSED") {
			t.Fatalf("workflow show lacks %q: %d\n%s%s", line, r.code, r.stdout, r.stderr)
		}
	}

	runs := &newRuns{home: home}
	runs.take(t)
	asking := func(more ...string) result {
		return agister(t, home, repo, append([]string{"run", "asking", "--quiet", "--timeout", "1m"}, more...)...)
	}
	// Its params are its process's.
	if r := asking(); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "workflow asking is missing params: question") {
		t.Fatalf("run without question: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs.one(t)
	if r := asking("--param", "question=q"); r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	first := runs.one(t)
	request, _ := first.record["request"].(map[string]any)
	if first.record["process"] != "asking" || first.record["agent"] != "reviewer" || request["timeout"] != "1m" ||
		!reflect.DeepEqual(first.record["call"], map[string]any{"node": "question", "process": "ask", "agent": "reviewer"}) {
		t.Fatalf("record of %v on %v, request %v, call %v", first.record["process"], first.record["agent"], request, first.record["call"])
	}
	if _, ok := first.record["parent"]; ok {
		t.Fatalf("the run is a node's: %v", first.record["parent"])
	}
	if _, ok := first.record["workflow"]; ok {
		t.Fatalf("the run is a fan-out workflow's: %v", first.record["workflow"])
	}
	id := filepath.Base(first.dir)

	// Neither its process nor its agent is resumable.
	if r := asking("--param", "question=again", "--continue", id); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "agent reviewer is fresh-only; it cannot continue run "+id) {
		t.Fatalf("continued a fresh-only call: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs.take(t)
	process := filepath.Join(home, "processes", "ask.yaml")
	write(t, process, read(t, process)+"session: resumable\n")
	if r := asking("--param", "question=again", "--continue", id); r.code != cli.ExitCompleted {
		t.Fatalf("continue: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	continued := runs.one(t)
	session := func(r run) any {
		result, _ := r.record["result"].(map[string]any)
		session, _ := result["session"].(map[string]any)
		return session["provider_session_id"]
	}
	if session(first) == nil || session(continued) != session(first) || !strings.Contains(strings.Join(continued.argv(), " "), "--resume "+session(first).(string)) {
		t.Fatalf("the continuation ran in session %v of %v, as %v", session(continued), session(first), continued.argv())
	}

	// A run of the process on its own is not the workflow's to continue.
	if r := agister(t, home, repo, "run", "ask", "--agent", "reviewer", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run ask: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	alone := filepath.Base(runs.one(t).dir)
	if r := asking("--param", "question=again", "--continue", alone); r.code != cli.ExitRefused ||
		!strings.Contains(r.stderr, "run "+alone+" is not a run of a workflow's call of process ask") {
		t.Fatalf("continued a run of the process on its own: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs.take(t)
	// A fan-out workflow still cannot be continued.
	r = agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt", "--continue", id)
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "workflow review_panel takes params only, not a run to continue") {
		t.Fatalf("continued a fan-out workflow: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// ADR-030 rule 10: a layer sets call.agent alone, and the call runs on it.
func TestALayerSetsTheCallsAgentAlone(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "workflows", "asking.yaml"), askingDoc)
	write(t, filepath.Join(repo, ".agister", "workflows", "asking.yaml"), "call: {agent: assistant}\n")
	if r := agister(t, home, repo, "check"); r.code != 0 {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs := &newRuns{home: home}
	runs.take(t)
	if r := agister(t, home, repo, "run", "asking", "--quiet", "--param", "question=q"); r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	ran := runs.one(t)
	if ran.record["agent"] != "assistant" || !reflect.DeepEqual(ran.record["call"], map[string]any{"node": "question", "process": "ask", "agent": "assistant"}) {
		t.Fatalf("ran on %v, call %v", ran.record["agent"], ran.record["call"])
	}
}
