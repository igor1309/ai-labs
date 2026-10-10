package main

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// The binding check (ADR-030 rules 7 and 8), on real settings directories:
// the example runtime mapping claude-code gives the example reviews none
// of its primitives, each of which grants more than a review allows, so
// every permission a review allows is withheld.

// check lists what each node of each workflow allows and does not require
// that its plan withholds, and workflow show shows it on each node; check
// --json lists a permission in tools.require a binding would withhold,
// which refuses the call and is no warning.
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
	bindingsAre(t, r, `[
  {"workflow": "asking", "node": "question", "process": "ask", "agent": "reviewer", "runtime": "claude-code", "version": "2.1",
   "withheld": ["repository.read", "repository.diff", "repository.search", "repository.history.read", "process.execute", "host.read"]},`+reviewPanelBindings+`]`)

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
	const refused = "process ask: cannot run on agent assistant's runtime claude-code: cannot enforce the effective permissions: required permissions would be withheld: repository.read"
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, refused) || strings.Contains(r.stderr, "warning workflow") {
		t.Fatalf("check lacks %q, or warns of a workflow: %d\n%s%s", refused, r.code, r.stdout, r.stderr)
	}
	bindingsAre(t, agister(t, home, repo, "check", "--json"), `[
  {"workflow": "asking", "node": "question", "process": "ask", "agent": "reviewer", "runtime": "claude-code", "version": "2.1",
   "withheld": ["repository.diff", "repository.search", "repository.history.read", "process.execute", "host.read"],
   "required": ["repository.read"]},`+reviewPanelBindings+`]`)
}

// A binding refused for a permission in tools.require still shows what
// else its plan withholds: check lists the others beside the problem, and
// workflow show beside the refusal.
func TestABindingRefusedForARequiredPermissionShowsWhatElseItWithholds(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "workflows", "asking.yaml"), askingDoc)
	process := filepath.Join(home, "processes", "ask.yaml")
	write(t, process, strings.Replace(read(t, process), "tools:\n  allow:\n", "tools:\n  require: [repository.read]\n  allow:\n", 1))
	const others = "repository.diff, repository.search, repository.history.read, process.execute, host.read"

	r := agister(t, home, repo, "check")
	const refused = "process ask: cannot run on agent assistant's runtime claude-code: cannot enforce the effective permissions: required permissions would be withheld: repository.read"
	const withheld = "withheld workflow asking node question: process ask, agent reviewer (runtime claude-code version 2.1): " + others + "\n"
	if !strings.Contains(r.stderr, refused) || !strings.Contains(r.stdout, withheld) {
		t.Fatalf("check lacks %q or %q: %d\n%s%s", refused, withheld, r.code, r.stdout, r.stderr)
	}

	r = agister(t, home, repo, "workflow", "show", "asking")
	const call = "/processes/ask.yaml): runtime claude-code: cannot enforce the effective permissions: required permissions would be withheld: repository.read (not verified for version 2.1.283: NotebookEdit, WebFetch, WebSearch)\n" +
		"  withheld   " + others + "\n"
	if !strings.Contains(r.stdout, "  plan       REFUSED: process ask (") || !strings.Contains(r.stdout, call) {
		t.Fatalf("workflow show lacks %q: %d\n%s%s", call, r.code, r.stdout, r.stderr)
	}
}

// A node on its process's own agent whose binding the settings already
// refuse, for a permission in tools.require, still shows what else its
// plan withholds, found before its runtime is asked.
func TestABindingTheSettingsRefuseShowsWhatElseItWithholds(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	process := filepath.Join(home, "processes", "adversarial_review.yaml")
	write(t, process, strings.Replace(read(t, process), "tools:\n  allow:\n", "tools:\n  require: [repository.read]\n  allow:\n", 1))

	r := agister(t, home, repo, "workflow", "show", "review_panel")
	const node = "fan-out      adversarial: process adversarial_review, agent reviewer (runtime claude-code)\n" +
		"  receives   params base, candidate\n" +
		"  plan       REFUSED: process adversarial_review ("
	const refused = "/processes/adversarial_review.yaml): cannot run on agent reviewer's runtime claude-code: cannot enforce the effective permissions: required permissions would be withheld: repository.read (not verified for version 2.1: NotebookEdit, WebFetch, WebSearch)\n" +
		"  withheld   repository.diff, repository.search\n" +
		"             architecture: process architecture_review"
	if !strings.Contains(r.stdout, node) || !strings.Contains(r.stdout, refused) {
		t.Fatalf("workflow show lacks %q or %q: %d\n%s%s", node, refused, r.code, r.stdout, r.stderr)
	}
	bindingsAre(t, agister(t, home, repo, "check", "--json"), `[
  {"workflow": "review_panel", "node": "adversarial", "process": "adversarial_review", "agent": "reviewer", "runtime": "claude-code", "version": "2.1",
   "withheld": ["repository.diff", "repository.search"], "required": ["repository.read"]},`+reviewPanelOthers+`]`)
}

// A node that binds a process under a cost limit to an agent whose runtime
// cannot enforce one cannot run, as its call is refused: OpenCode cannot
// limit cost. Only the runtime says so, so check finds it where it asks
// the runtimes, a problem of the workflow that names the node, and the
// process on its own agent still passes.
func TestCheckRefusesABindingWhoseRuntimeCannotEnforceItsCostLimit(t *testing.T) {
	t.Parallel()
	home, repo := exampleOpenCodeSettings(t)
	verifyOpenCodeTools(t, home, "read", "grep", "glob", "skill")
	write(t, filepath.Join(home, "workflows", "asking.yaml"), strings.Replace(askingDoc, "agent: reviewer", "agent: opencode-minimax", 1))
	process := filepath.Join(home, "processes", "ask.yaml")
	write(t, process, read(t, process)+"\nmax_cost_usd: 1\n")

	if r := agister(t, home, repo, "check"); r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") {
		t.Fatalf("check before the runtimes are asked: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r := agister(t, home, repo, "check", "--probe")
	const problem = "workflow asking: call node question: process ask: runtime opencode cannot enforce the cost limit 1\n  refuses workflow asking\n"
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) || !strings.Contains(r.stderr, "1 problem(s)") {
		t.Fatalf("check --probe lacks %q: %d\n%s%s", problem, r.code, r.stdout, r.stderr)
	}
}

// A node that binds a process to an agent whose runtime would withhold a
// permission in the process's tools.require refuses its workflow, and no
// other (ADR-030 rule 8): check reports it as a problem of that workflow,
// not a warning, workflow list shows that workflow alone refused, and its
// run is refused. Workflow asking_reader binds the same process to agent
// reader, whose runtime gives the permission, and process ask names that
// agent: neither is refused.
func TestABindingWithholdingARequiredPermissionRefusesItsWorkflowAlone(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	// Runtime reads gives Read, which grants repository.read alone.
	write(t, filepath.Join(home, "runtimes", "reads.yaml"), `schema: agister.runtime/v1alpha1
name: reads
adapter: claude-code
contract: claude-code/3
efforts: [high]
primitives:
  select: any
  items:
    Read: {grants: [repository.read], verified: ["2.1."]}
`)
	write(t, filepath.Join(home, "agents", "reader.toml"),
		strings.NewReplacer(`name = "reviewer"`, `name = "reader"`, `runtime = "claude-code"`, `runtime = "reads"`).Replace(read(t, filepath.Join(home, "agents", "reviewer.toml"))))
	write(t, filepath.Join(home, "workflows", "asking.yaml"), askingDoc)
	write(t, filepath.Join(home, "workflows", "asking_reader.yaml"),
		strings.NewReplacer("name: asking", "name: asking_reader", "agent: reviewer", "agent: reader").Replace(askingDoc))
	process := filepath.Join(home, "processes", "ask.yaml")
	write(t, process, strings.NewReplacer("uses: agent:assistant", "uses: agent:reader", "tools:\n  allow:\n", "tools:\n  require: [repository.read]\n  allow:\n").Replace(read(t, process)))

	r := agister(t, home, repo, "check")
	const problem = "workflow asking: call node question: process ask: cannot run on agent reviewer's runtime claude-code: cannot enforce the effective permissions: required permissions would be withheld: repository.read (not verified for version 2.1: NotebookEdit, WebFetch, WebSearch)\n  refuses workflow asking\n"
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) || !strings.Contains(r.stderr, "1 problem(s)") || strings.Contains(r.stderr, "warning workflow") {
		t.Fatalf("check lacks %q alone: %d\n%s%s", problem, r.code, r.stdout, r.stderr)
	}

	r = agister(t, home, repo, "workflow", "list")
	if r.code != 0 || !regexp.MustCompile(`(?m)^asking\b.*\tREFUSED: .*required permissions would be withheld: repository\.read`).MatchString(r.stdout) ||
		regexp.MustCompile(`(?m)^(asking_reader|review_panel)\b.*REFUSED`).MatchString(r.stdout) {
		t.Fatalf("workflow list: want asking alone refused: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "asking", "--param", "question=What does this repository do?")
	const refused = "call node question: process ask: cannot run on agent reviewer's runtime claude-code: cannot enforce the effective permissions: required permissions would be withheld: repository.read"
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, refused) {
		t.Fatalf("run asking: exit %d, want %q\n%s%s", r.code, refused, r.stdout, r.stderr)
	}
}

// reviewPanelBindings are the bindings check reports of the example
// review_panel, each of whose nodes runs on its process's own agent;
// reviewPanelOthers, those of its nodes but adversarial.
const (
	reviewPanelBindings = `
  {"workflow": "review_panel", "node": "adversarial", "process": "adversarial_review", "agent": "reviewer", "runtime": "claude-code", "version": "2.1",
   "withheld": ["repository.read", "repository.diff", "repository.search"]},` + reviewPanelOthers
	reviewPanelOthers = `
  {"workflow": "review_panel", "node": "architecture", "process": "architecture_review", "agent": "reviewer", "runtime": "claude-code", "version": "2.1",
   "withheld": ["repository.read", "repository.diff", "repository.search"]},
  {"workflow": "review_panel", "node": "summary", "process": "review_summary", "agent": "reviewer", "runtime": "claude-code", "version": "2.1",
   "withheld": ["repository.read", "repository.diff", "repository.search", "repository.history.read", "process.execute", "host.read"]}`
)

// bindingsAre fails the test unless the bindings of the report check
// --json printed are, key by key, those of want, a JSON array.
func bindingsAre(t *testing.T, r result, want string) {
	t.Helper()
	var report struct {
		Bindings any `json:"bindings"`
	}
	var expected any
	if err := json.Unmarshal([]byte(want), &expected); err != nil {
		t.Fatalf("expected bindings: %v", err)
	}
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || !reflect.DeepEqual(report.Bindings, expected) {
		t.Fatalf("check --json: %v, bindings\n%v\nwant\n%v\n%s%s", err, report.Bindings, expected, r.stdout, r.stderr)
	}
}
