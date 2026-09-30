package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// End-to-end wiring checks: the real composition root, real files and git,
// fake runtime binaries. Rules are tested below this level; these tests
// prove the pieces are connected.

type result struct {
	code           int
	stdout, stderr string
}

func agister(t *testing.T, home, cwd string, args ...string) result {
	t.Helper()
	return agisterInput(t, "", home, cwd, args...)
}

// agisterInput runs agister with input as what the user types.
func agisterInput(t *testing.T, input, home, cwd string, args ...string) result {
	t.Helper()
	return agisterReading(t, strings.NewReader(input), home, cwd, args...)
}

func agisterReading(t *testing.T, stdin io.Reader, home, cwd string, args ...string) result {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := cli.Run(context.Background(), append([]string{"--home", home}, args...), cli.IO{
		Stdin: stdin, Stdout: &stdout, Stderr: &stderr, Cwd: cwd,
		Getenv: func(string) string { return "" },
	}, compose)
	return result{code, stdout.String(), stderr.String()}
}

func gitCmd(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	out, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// repository has a base commit on main and a candidate on a branch whose
// content carries the fake runtime's scenario marker.
func repository(t *testing.T, scenario string) string {
	// Git reports the repository's real path (on macOS the temp dir sits
	// behind the /var -> /private/var symlink); expectations use the same.
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	gitCmd(t, dir, "init", "--quiet", "--initial-branch=main")
	gitCmd(t, dir, "config", "user.email", "test@example.com")
	gitCmd(t, dir, "config", "user.name", "Test")
	// No detached maintenance (git >= 2.47) may race the directory's cleanup.
	gitCmd(t, dir, "config", "maintenance.auto", "false")
	write(t, filepath.Join(dir, "a.txt"), "one\n")
	gitCmd(t, dir, "add", ".")
	gitCmd(t, dir, "commit", "--quiet", "-m", "base")
	gitCmd(t, dir, "checkout", "--quiet", "-b", "feature")
	write(t, filepath.Join(dir, "a.txt"), "one\ntwo SCENARIO:"+scenario+"\n")
	gitCmd(t, dir, "commit", "--quiet", "-am", "candidate")
	return dir
}

// setup: example settings with agents pointed at the fakes.
func setup(t *testing.T, scenario string) (home, repo string) {
	home, repo = t.TempDir(), repository(t, scenario)
	claude := runtimetest.Binary(t, "fakeclaude")
	if r := agisterInput(t, "yes\n", home, repo, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	for _, args := range [][]string{
		{"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model", "sonnet", "--model-family", "anthropic", "--effort", "high", "--command", claude},
		{"agent", "create", "assistant", "--force", "--runtime", "claude-code", "--model-family", "anthropic", "--session", "resumable", "--command", claude},
	} {
		// Both replace a shipped agent, so each asks.
		if r := agisterInput(t, "yes\n", home, repo, args...); r.code != 0 {
			t.Fatalf("%v: %d %s", args, r.code, r.stderr)
		}
	}
	return home, repo
}

type run struct {
	dir    string
	record map[string]any
	events []map[string]any
	first  map[string]any // the fake's echo: argv, cwd, prompt
}

func lastRun(t *testing.T, home string) run {
	t.Helper()
	entries, _ := os.ReadDir(filepath.Join(home, "runs"))
	if len(entries) == 0 {
		t.Fatal("no runs")
	}
	dir := filepath.Join(home, "runs", entries[len(entries)-1].Name())
	var r run
	r.dir = dir
	readJSON(t, filepath.Join(dir, "record.json"), &r.record)
	data, _ := os.ReadFile(filepath.Join(dir, "events.jsonl"))
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		var event map[string]any
		_ = json.Unmarshal([]byte(line), &event)
		r.events = append(r.events, event)
	}
	if data, err := os.ReadFile(filepath.Join(dir, "provider.jsonl")); err == nil {
		_ = json.Unmarshal([]byte(strings.SplitN(string(data), "\n", 2)[0]), &r.first)
	}
	return r
}

func (r run) kinds() []string {
	var kinds []string
	for _, event := range r.events {
		kinds = append(kinds, event["kind"].(string))
	}
	return kinds
}

func (r run) argv() []string {
	var args []string
	for _, arg := range r.first["argv"].([]any) {
		args = append(args, arg.(string))
	}
	return args
}

func TestAgentCallEndToEnd(t *testing.T) {
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	var output map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &output); err != nil || output["verdict"] != "approve" {
		t.Fatalf("stdout = %s", r.stdout)
	}

	last := lastRun(t, home)
	record := last.record
	result := record["result"].(map[string]any)
	if result["status"] != "completed" || record["agent"] != "reviewer" || result["output"].(map[string]any)["verdict"] != "approve" {
		t.Fatalf("record = %v", record)
	}
	// The node result: usage and cost as the runtime reports them, timing as Agister measures it.
	usage, cost, timing := result["usage"].(map[string]any), result["cost"].(map[string]any), result["timing"].(map[string]any)
	if usage["input_tokens"] != 100.0 || usage["cache_write_tokens"] != 5.0 || cost["source"] != "runtime" || cost["usd"] != 0.0123 ||
		timing["runtime_ms"] != 3400.0 || timing["turn_ms"] == nil || result["session"].(map[string]any)["provider_session_id"] != "00000000-0000-4000-8000-000000000000" || record["requested_session_id"] != nil {
		t.Fatalf("result = %v", result)
	}
	// Every definition used is attributed with its digest.
	var kinds []string
	for _, source := range record["definitions"].([]any) {
		source := source.(map[string]any)
		if len(source["sha256"].(string)) != 64 {
			t.Fatalf("source without digest: %v", source)
		}
		kinds = append(kinds, source["kind"].(string))
	}
	if strings.Join(kinds, ",") != "service,processes,policies,agents,runtimes,schemas" {
		t.Fatalf("definitions = %v", kinds)
	}
	// Inputs are immutable.
	candidate := gitCmd(t, repo, "rev-parse", "HEAD")
	for _, input := range record["inputs"].([]any) {
		input := input.(map[string]any)
		if input["name"] == "candidate_revision" && (input["identity"] != candidate || input["revision"] != true) {
			t.Fatalf("candidate input = %v", input)
		}
		if input["name"] == "diff" && !strings.HasPrefix(input["identity"].(string), "sha256:") {
			t.Fatalf("diff input = %v", input)
		}
	}
	// Primitives, not permissions, reach the runtime.
	args := strings.Join(last.argv(), " ")
	if !strings.Contains(args, "--tools=Read,Glob,Grep --allowedTools=Read,Glob,Grep") || strings.Contains(args, "Bash") || !strings.Contains(args, "--max-budget-usd 3") {
		t.Fatalf("argv = %s", args)
	}
	prompt := last.first["prompt"].(string)
	if !strings.HasPrefix(prompt, "## base_revision\n\n") || !strings.Contains(prompt, "## changed_files\n\n- a.txt") {
		t.Fatalf("prompt = %q", prompt)
	}
	// The agent worked in a checkout of the candidate, since released.
	workspace := record["workspace"].(string)
	if last.first["cwd"] != workspace || workspace == repo {
		t.Fatalf("workspace %s, agent cwd %v", workspace, last.first["cwd"])
	}
	if _, err := os.Stat(workspace); !os.IsNotExist(err) {
		t.Fatalf("workspace not released: %v", err)
	}
	if lines := strings.Split(gitCmd(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktrees = %v", lines)
	}
	// Diagnostics are correlated with the run.
	var logged bool
	for _, line := range strings.Split(read(t, filepath.Join(home, "logs", "agister.jsonl")), "\n") {
		logged = logged || strings.Contains(line, `"msg":"turn.finished"`) && strings.Contains(line, `"run_id":"`+record["id"].(string)+`"`)
	}
	if !logged {
		t.Fatal("turn not logged under its run ID")
	}
	// The plan comes before any runtime process.
	order := strings.Join(last.kinds(), " ")
	if planned := strings.Index(order, "PLANNED"); planned < 0 || planned > strings.Index(order, "PROCESS_STARTED") || !strings.Contains(order, "PERMISSIONS_WITHHELD") {
		t.Fatalf("events = %s", order)
	}
}

func TestShippedExamplesPassCheck(t *testing.T) {
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "check", "--probe")
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") ||
		!strings.Contains(r.stderr, "warning process implement: verify runs its command with the operator's authority") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// A broken setting is found before any call, with every problem listed.
	write(t, filepath.Join(home, "agents", "broken.toml"), "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\nruntime = \"nowhere\"\n")
	write(t, filepath.Join(home, "schemas", "bad.json"), "{")
	r = agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, `agent broken: runtime mapping "nowhere" does not exist`) || !strings.Contains(r.stderr, "schema bad: schema is not JSON") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
}

// init writes the shipped service settings, and a binary file in their
// place (a Finder .DS_Store once landed there) is reported as one problem.
func TestUnreadableServiceSettingsFailCheck(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	if r := agisterInput(t, "yes\n", home, repo, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	shipped, err := fs.ReadFile(examples.Settings(), "service.toml")
	if err != nil {
		t.Fatal(err)
	}
	if got := read(t, filepath.Join(home, "service.toml")); got != string(shipped) {
		t.Fatalf("init wrote a service.toml unlike the shipped one: %.40q...", got)
	}
	write(t, filepath.Join(home, "service.toml"), "\x00\x00\x00\x01Bud1\x00\x00")
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "\nservice service: not a UTF-8 text file\n1 problem(s)") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
}

func TestRefusedCallIsRecorded(t *testing.T) {
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "no_such_process", "--quiet", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, `process "no_such_process": not found`) {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if last := lastRun(t, home); last.record["result"].(map[string]any)["error"].(map[string]any)["class"] != "refused" {
		t.Fatalf("record = %v", last.record)
	}
}

// New kinds of work, contracts and permissions need no code: this call uses
// a vocabulary, runtime mapping, schema and process that exist only here.
func TestSettingsOnlyExtension(t *testing.T) {
	home, repo := t.TempDir(), repository(t, "approve")
	write(t, filepath.Join(home, "service.toml"), `schema = "agister.service/v1alpha1"
max_timeout = "5m"
permissions = ["docs.read", "docs.write"]
writing = ["docs.write"]
`)
	write(t, filepath.Join(home, "runtimes", "docs-runtime.yaml"), `schema: agister.runtime/v1alpha1
name: docs-runtime
adapter: claude-code
contract: claude-code/2
primitives:
  select: any
  items:
    Read: {grants: [docs.read], verified: ["2.1."]}
    Write: {grants: [docs.write], verified: ["2.1."]}
`)
	write(t, filepath.Join(home, "agents", "writer.toml"), `schema = "agister.agent/v1alpha1"
name = "writer"
runtime = "docs-runtime"
command = "`+runtimetest.Binary(t, "fakeclaude")+`"
`)
	write(t, filepath.Join(home, "schemas", "verdict.json"), `{"type":"object","required":["verdict"],"properties":{"verdict":{"enum":["approve","request_changes"]}}}`)
	write(t, filepath.Join(home, "processes", "check_docs.yaml"), `schema: agister.process/v1alpha1
name: check_docs
type: process
uses: agent:writer
tools: {allow: [docs.read]}
timeout: 1m
input:
  instruction: Check the documentation.
  params:
    topic: {default: intro}
  values:
    topic: {source: param, name: topic}
output:
  format: json
  schema: verdict
  require_valid: true
`)
	r := agister(t, home, repo, "run", "check_docs", "--quiet", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if args := strings.Join(lastRun(t, home).argv(), " "); !strings.Contains(args, "--tools=Read --allowedTools=Read") {
		t.Fatalf("argv = %s", args)
	}
}

// A repository's own .agister adds settings wherever in the repository
// Agister runs; outside it, only global ones apply.
func TestProjectSettingsAddToGlobal(t *testing.T) {
	home, repo := setup(t, "approve")
	ask := strings.Replace(read(t, filepath.Join(home, "processes", "ask.yaml")), "Answer the question", "PROJECT: answer the question", 1)
	write(t, filepath.Join(repo, ".agister", "processes", "ask_here.yaml"), strings.Replace(ask, "name: ask", "name: ask_here", 1))
	sub := filepath.Join(repo, "sub")
	write(t, filepath.Join(sub, "keep"), "")

	if r := agister(t, home, sub, "process", "list"); r.code != 0 || !strings.Contains(r.stdout, "ask_here") {
		t.Fatalf("list in project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	project := filepath.Join(repo, ".agister", "processes", "ask_here.yaml")
	r := agister(t, home, sub, "process", "show", "ask_here")
	if r.code != 0 || !strings.Contains(r.stdout, "process ask_here: project "+project) || !strings.Contains(r.stdout, "policy read-only: global "+filepath.Join(home, "policies", "read-only.yaml")) {
		t.Fatalf("show in project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, sub, "run", "ask_here", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run in project: %d\n%s", r.code, r.stderr)
	}
	last := lastRun(t, home)
	var process map[string]any
	for _, source := range last.record["definitions"].([]any) {
		if source := source.(map[string]any); source["kind"] == "processes" {
			process = source
		}
	}
	if !strings.Contains(strings.Join(last.argv(), " "), "PROJECT: answer") || process["path"] != project || process["project"] != true {
		t.Fatalf("project process not used or not attributed: %v, argv %v", process, last.argv())
	}

	outside := t.TempDir()
	if r := agister(t, home, outside, "process", "list"); r.code != 0 || strings.Contains(r.stdout, "ask_here") {
		t.Fatalf("list outside project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Why no project settings apply is in the diagnostics.
	if r := agister(t, home, outside, "--debug", "process", "list"); r.code != 0 || !strings.Contains(r.stderr, "no project settings: not in a usable git repository") {
		t.Fatalf("diagnostics outside project: %d\n%s", r.code, r.stderr)
	}
}

// A branch can swap the reviewer's family: the project agent takes priority
// over the global one, and check, process show and the run record say so.
func TestProjectOverridesAreNoted(t *testing.T) {
	home, repo := setup(t, "approve")
	global := filepath.Join(home, "agents", "reviewer.toml")
	project := filepath.Join(repo, ".agister", "agents", "reviewer.toml")
	write(t, project, strings.Replace(read(t, global), `model_family = "anthropic"`, `model_family = "experiment"`, 1))

	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.Contains(r.stdout, "override agent reviewer: "+project+" overrides "+global) || !strings.Contains(r.stdout, "settings OK") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "check", "--tree")
	if r.code != 0 || !regexp.MustCompile(`├─ agent reviewer +project `+regexp.QuoteMeta(project+" (overrides "+global+")")).MatchString(r.stdout) {
		t.Fatalf("check --tree: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	var report contract.CheckReport
	r = agister(t, home, repo, "check", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 {
		t.Fatalf("check --json: %d %v\n%s", r.code, err, r.stdout)
	}
	for _, d := range report.Definitions {
		if d.Kind == "agents" && d.Name == "reviewer" && (d.Layer != "project" || d.Path != project || d.Overrides != global || len(d.UsedBy) == 0) {
			t.Fatalf("reviewer = %+v", d)
		}
	}
	r = agister(t, home, repo, "process", "show", "adversarial_review")
	if r.code != 0 || !strings.Contains(r.stdout, "agent reviewer: project "+project+" (overrides "+global+")") {
		t.Fatalf("show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s", r.code, r.stderr)
	}
	for _, source := range lastRun(t, home).record["definitions"].([]any) {
		if source := source.(map[string]any); source["kind"] == "agents" && (source["path"] != project || source["project"] != true || source["overrides"] != global) {
			t.Fatalf("agent source = %v", source)
		}
	}
}

// Overrides are verified as composed: a project service that global
// policies exceed fails check, and every other command stops before it
// does anything.
func TestComposedSettingsAreVerified(t *testing.T) {
	home, repo := setup(t, "approve")
	write(t, filepath.Join(repo, ".agister", "service.toml"), strings.Replace(read(t, filepath.Join(home, "service.toml")), `max_timeout = "1h"`, `max_timeout = "5m"`, 1))

	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "override service service:") || !strings.Contains(r.stderr, "process adversarial_review") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	for _, args := range [][]string{{}, {"run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"}, {"runs"}, {"process", "list"}} {
		r := agister(t, home, repo, args...)
		if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "process adversarial_review") || !strings.Contains(r.stderr, "settings have problems") {
			t.Fatalf("%v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
		}
	}
	if _, err := os.Stat(filepath.Join(home, "runs")); err == nil {
		t.Fatal("a call started despite invalid settings")
	}
	// Help needs no settings, and init is how settings are repaired.
	if r := agister(t, home, repo, "--help"); r.code != 0 {
		t.Fatalf("help: %d\n%s", r.code, r.stderr)
	}
	if r := agisterInput(t, "yes\n", home, repo, "init"); r.code != 0 {
		t.Fatalf("init: %d\n%s", r.code, r.stderr)
	}
}

// init writes nothing until the user types "yes", and --force says which
// existing files it would replace before asking.
func TestInitAsksBeforeWriting(t *testing.T) {
	home, dir := filepath.Join(t.TempDir(), "home"), t.TempDir()
	for _, input := range []string{"", "\n", "y\n", "no\n", "YES please\n"} {
		r := agisterInput(t, input, home, dir, "init")
		if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "will create  "+filepath.Join(home, "service.toml")) || !strings.Contains(r.stderr, "Type yes to write") || !strings.Contains(r.stderr, "nothing was written") {
			t.Fatalf("input %q: %d\n%s%s", input, r.code, r.stdout, r.stderr)
		}
		if _, err := os.Stat(home); err == nil {
			if entries, _ := os.ReadDir(home); len(entries) > 1 || (len(entries) == 1 && entries[0].Name() != "logs") {
				t.Fatalf("input %q: wrote %v", input, entries)
			}
		}
	}
	if r := agisterInput(t, " yes \n", home, dir, "init"); r.code != 0 || !strings.Contains(r.stdout, "created  "+filepath.Join(home, "service.toml")) {
		t.Fatalf("yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Everything exists: nothing to write, nothing to confirm.
	if r := agister(t, home, dir, "init"); r.code != 0 || !strings.Contains(r.stdout, "nothing to write") || strings.Contains(r.stderr, "Type yes") {
		t.Fatalf("again: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	edited := filepath.Join(home, "agents", "reviewer.toml")
	write(t, edited, read(t, edited)+"# mine\n")
	r := agister(t, home, dir, "init", "--force")
	if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "will REPLACE "+edited) || !strings.HasSuffix(read(t, edited), "# mine\n") {
		t.Fatalf("force without yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agisterInput(t, "yes\n", home, dir, "init", "--force"); r.code != 0 || !strings.Contains(r.stdout, "replaced "+edited) || strings.HasSuffix(read(t, edited), "# mine\n") {
		t.Fatalf("force with yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// agent create asks for "yes" only when --force would replace an agent.
func TestAgentCreateAsksBeforeReplacing(t *testing.T) {
	home, dir := filepath.Join(t.TempDir(), "home"), t.TempDir()
	if r := agisterInput(t, "yes\n", home, dir, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	reviewer := filepath.Join(home, "agents", "reviewer.toml")
	before := read(t, reviewer)
	replace := []string{"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model", "opus", "--model-family", "anthropic"}
	for _, input := range []string{"", "y\n", "no\n"} {
		r := agisterInput(t, input, home, dir, replace...)
		if r.code != cli.ExitUsage || !strings.Contains(r.stdout, "will REPLACE "+reviewer) || !strings.Contains(r.stderr, "Type yes to replace agent reviewer") || read(t, reviewer) != before {
			t.Fatalf("input %q: %d\n%s%s", input, r.code, r.stdout, r.stderr)
		}
	}
	if r := agisterInput(t, "yes\n", home, dir, replace...); r.code != 0 || !strings.Contains(r.stdout, "replaced agent reviewer: "+reviewer) || !strings.Contains(read(t, reviewer), `model = "opus"`) {
		t.Fatalf("yes: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// An agent that would break the settings is refused before the question,
	// and every command still works afterwards. Here the agent's runtime is
	// valid, but the reviewer's processes cannot run on it: its one
	// primitive also grants what their policy does not allow.
	write(t, filepath.Join(home, "runtimes", "narrow.yaml"), `schema: agister.runtime/v1alpha1
name: narrow
adapter: claude-code
contract: claude-code/2
efforts: [high]
primitives:
  select: one
  items:
    Bash: {grants: [process.execute, repository.read], verified: ["2.1."]}
`)
	current := read(t, reviewer)
	r := agisterInput(t, "yes\n", home, dir, "agent", "create", "reviewer", "--force", "--runtime", "narrow")
	if r.code != cli.ExitUsage || strings.Contains(r.stderr, "Type yes") || !strings.Contains(r.stderr, "agent reviewer would break the global settings") || read(t, reviewer) != current {
		t.Fatalf("breaking agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, dir, "check"); r.code != 0 {
		t.Fatalf("check after refusal: %d\n%s", r.code, r.stderr)
	}
	// A new agent replaces nothing, so --force or not, nothing is asked.
	if r := agister(t, home, dir, "agent", "create", "fresh", "--force", "--runtime", "claude-code"); r.code != 0 || strings.Contains(r.stderr, "Type yes") || !strings.Contains(r.stdout, "created agent fresh") {
		t.Fatalf("new agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Without --force an existing agent is refused, not asked about.
	if r := agister(t, home, dir, "agent", "create", "fresh", "--runtime", "claude-code"); r.code != cli.ExitUsage || strings.Contains(r.stderr, "Type yes") || !strings.Contains(r.stderr, "already exists") {
		t.Fatalf("existing without force: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// agent create writes global settings, so it must keep them valid on their
// own, not only as a project in view composes them.
func TestAgentCreateKeepsEveryScopeValid(t *testing.T) {
	home, repo := setup(t, "approve")
	mapping := strings.Replace(read(t, filepath.Join(home, "runtimes", "claude-code.yaml")), "name: claude-code", "name: local-rt", 1)
	write(t, filepath.Join(repo, ".agister", "runtimes", "local-rt.yaml"), mapping)

	r := agister(t, home, repo, "agent", "create", "g", "--runtime", "local-rt", "--model-family", "anthropic")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "agent g would break the global settings") || !strings.Contains(r.stderr, `runtime mapping "local-rt" does not exist`) {
		t.Fatalf("inside the project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if _, err := os.Stat(filepath.Join(home, "agents", "g.toml")); err == nil {
		t.Fatal("an agent valid only in the project was written to global settings")
	}
	if r := agister(t, home, t.TempDir(), "check"); r.code != 0 {
		t.Fatalf("outside the project: %d\n%s", r.code, r.stderr)
	}

	// Where the project defines the agent, the global one is shadowed there,
	// so only the global scope judges it.
	write(t, filepath.Join(repo, ".agister", "agents", "solo.toml"), "schema = \"agister.agent/v1alpha1\"\nname = \"solo\"\nruntime = \"claude-code\"\nmodel_family = \"anthropic\"\n")
	process := strings.Replace(strings.Replace(read(t, filepath.Join(home, "processes", "adversarial_review.yaml")), "name: adversarial_review", "name: solo_review", 1), "agent:reviewer", "agent:solo", 1)
	write(t, filepath.Join(repo, ".agister", "processes", "solo_review.yaml"), process)
	if r := agister(t, home, repo, "agent", "create", "solo", "--runtime", "claude-code"); r.code != 0 {
		t.Fatalf("shadowed agent: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// typedAfter answers the prompt, but only after something else happened
// while the user was reading it.
type typedAfter struct {
	meanwhile func()
	answer    io.Reader
}

func (r *typedAfter) Read(p []byte) (int, error) {
	if r.meanwhile != nil {
		r.meanwhile()
		r.meanwhile = nil
	}
	return r.answer.Read(p)
}

// "yes" approves the plan that was shown, not whatever is on disk by then.
func TestConfirmedWritesRefuseChangesMadeWhileAsking(t *testing.T) {
	home, dir := filepath.Join(t.TempDir(), "home"), t.TempDir()
	if r := agisterInput(t, "yes\n", home, dir, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	reviewer := filepath.Join(home, "agents", "reviewer.toml")
	edited := read(t, reviewer) + "# edited while asking\n"
	editMeanwhile := func() { write(t, reviewer, edited) }

	r := agisterReading(t, &typedAfter{editMeanwhile, strings.NewReader("yes\n")}, home, dir, "init", "--force")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "changed since you confirmed") || read(t, reviewer) != edited {
		t.Fatalf("init --force: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agisterReading(t, &typedAfter{func() { write(t, reviewer, edited+"# again\n") }, strings.NewReader("yes\n")}, home, dir,
		"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model-family", "anthropic")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "changed since you confirmed") || read(t, reviewer) != edited+"# again\n" {
		t.Fatalf("agent create --force: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// On a fresh machine only init and help work; after init everything does.
func TestFreshHomeNeedsInit(t *testing.T) {
	home, dir := filepath.Join(t.TempDir(), "home"), t.TempDir()
	if r := agister(t, home, dir, "process", "list"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, "service service: not found") {
		t.Fatalf("before init: %d\n%s", r.code, r.stderr)
	}
	if r := agisterInput(t, "yes\n", home, dir, "init"); r.code != 0 {
		t.Fatalf("init: %d\n%s", r.code, r.stderr)
	}
	if r := agister(t, home, dir, "process", "list"); r.code != 0 {
		t.Fatalf("after init: %d\n%s", r.code, r.stderr)
	}
}

// A .agister that exists but cannot be used fails every command instead of
// silently leaving the project's settings out.
func TestUnusableProjectSettingsFail(t *testing.T) {
	home, repo := setup(t, "approve")
	write(t, filepath.Join(repo, ".agister"), "not a directory")
	if r := agister(t, home, repo, "process", "list"); r.code == 0 || !strings.Contains(r.stderr, ".agister: not a directory") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// Fields that settings once accepted and ignored are refused, so a home
// written for the old format fails check instead of running unverified.
func TestRefusedSettingsFieldsFailCheck(t *testing.T) {
	home, repo := setup(t, "approve")
	mapping := filepath.Join(home, "runtimes", "claude-code.yaml")
	original := read(t, mapping)
	write(t, mapping, strings.Replace(original, "efforts:", "verified_versions: [\"2.1.\"]\nefforts:", 1))
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "verified_versions: no longer supported") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	write(t, mapping, original)

	write(t, filepath.Join(home, "processes", "res.yaml"), strings.Replace(read(t, filepath.Join(home, "processes", "ask.yaml")), "name: ask", "name: res\nresources: [x]", 1))
	r = agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "resources: not supported yet") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

func write(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func read(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func readJSON(t *testing.T, path string, value any) {
	t.Helper()
	if err := json.Unmarshal([]byte(read(t, path)), value); err != nil {
		t.Fatal(err)
	}
}

// Cancelling through the contract interrupts the runtime and releases the
// workspace; the run finishes interrupted, not lost.
func TestCancelThroughTheContract(t *testing.T) {
	home, repo := setup(t, "hang")
	client, err := compose(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	id, err := client.Submit(ctx, contract.CallRequest{Process: "adversarial_review", Params: map[string]string{"base": "main"}, Timeout: "30s", Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	cancelled := false
	err = client.Observe(ctx, id, 0, func(event contract.Event) error {
		if event.Kind == "PROCESS_STARTED" && !cancelled {
			cancelled = true
			return client.Cancel(ctx, id)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	inspected, err := client.Inspect(ctx, id)
	if err != nil || inspected.State != "finished" || inspected.Result.Status != "interrupted" || inspected.Result.Error.Class != "cancelled" {
		t.Fatalf("run = %+v, %v", inspected, err)
	}
	if lines := strings.Split(gitCmd(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktree not released: %v", lines)
	}
}

// Settings broken mid-run do not strand the run: it stays cancellable,
// observable and inspectable, while other uses are refused.
func TestRunSurvivesSettingsBrokenMidRun(t *testing.T) {
	home, repo := setup(t, "hang")
	client, err := compose(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	id, err := client.Submit(ctx, contract.CallRequest{Process: "adversarial_review", Params: map[string]string{"base": "main"}, Timeout: "30s", Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	broken := false
	err = client.Observe(ctx, id, 0, func(event contract.Event) error {
		if event.Kind == "PROCESS_STARTED" && !broken {
			broken = true
			write(t, filepath.Join(home, "agents", "broken.toml"), "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\n")
			return client.Cancel(ctx, id)
		}
		return nil
	})
	if err != nil || !broken {
		t.Fatalf("observe: %v", err)
	}
	if inspected, err := client.Inspect(ctx, id); err != nil || inspected.Result.Status != "interrupted" {
		t.Fatalf("inspect: %+v, %v", inspected, err)
	}
	var settings *contract.SettingsError
	if _, err := client.ListRuns(ctx); !errors.As(err, &settings) {
		t.Fatalf("list runs with broken settings: %v", err)
	}
}

// A domain result, even an unfavourable one, is output of a completed node:
// routing on it is the workflow's business.
func TestVerdictIsOutputNotStatus(t *testing.T) {
	home, repo := setup(t, "request_changes")
	r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--json", "--quiet", "--timeout", "1m")
	var result contract.Result
	if err := json.Unmarshal([]byte(r.stdout), &result); err != nil || r.code != cli.ExitCompleted || result.Status != "completed" || !strings.Contains(string(result.Output), `"request_changes"`) {
		t.Fatalf("exit %d, result %s, err %v", r.code, r.stdout, err)
	}
}

// A continuation resumes the earlier run's provider session in place, by the
// ID the runtime reported, and costs what it added to the session's total.
func TestContinuationEndToEnd(t *testing.T) {
	// The fake runtime keeps its sessions' costs here: each turn costs
	// $0.0123, and the result reports the session's total.
	t.Setenv("FAKE_CLAUDE_CONFIG_DIR", t.TempDir())
	home, repo := setup(t, "approve")
	client, err := compose(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	finish := func(request contract.CallRequest) contract.Run {
		id, err := client.Submit(ctx, request)
		if err != nil {
			t.Fatal(err)
		}
		if err := client.Observe(ctx, id, 0, func(contract.Event) error { return nil }); err != nil {
			t.Fatal(err)
		}
		inspected, err := client.Inspect(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return inspected
	}
	first := finish(contract.CallRequest{Process: "ask", Params: map[string]string{"question": "What is a.txt?"}, Timeout: "1m", Cwd: repo})
	second := finish(contract.CallRequest{Process: "ask", Params: map[string]string{"question": "And b.txt?"}, Continue: first.ID, Timeout: "1m", Cwd: repo})
	if first.Result.Status != "completed" || second.Result.Status != "completed" {
		t.Fatalf("first %+v, second %+v", first.Result, second.Result)
	}
	earlier, later := first.Result.Session.ProviderSessionID, second.Result.Session.ProviderSessionID
	var provider map[string]any
	data, _ := os.ReadFile(filepath.Join(home, "runs", second.ID, "provider.jsonl"))
	_ = json.Unmarshal([]byte(strings.SplitN(string(data), "\n", 2)[0]), &provider)
	args := fmt.Sprint(provider["argv"])
	if earlier != later || second.Result.Session.Continues != first.ID || !strings.Contains(args, "--resume "+earlier) ||
		strings.Contains(args, "--fork-session") || strings.Contains(args, "--session-id") {
		t.Fatalf("earlier %s, later %s, argv %s", earlier, later, args)
	}
	// A run that was already continued can be continued again: the same
	// session is resumed.
	again := finish(contract.CallRequest{Process: "ask", Params: map[string]string{"question": "And c.txt?"}, Continue: first.ID, Timeout: "1m", Cwd: repo})
	if again.Result.Status != "completed" || again.Result.Session.ProviderSessionID != earlier || again.Result.Session.Continues != first.ID {
		t.Fatalf("result = %+v", again.Result)
	}
	// The session's total rose to 0.0246 with the second call, which the
	// first never recorded: each call costs its own turn, the third
	// included.
	for _, call := range []contract.Run{first, second, again} {
		if cost := call.Result.Cost; cost.Source != "runtime" || cost.USD == nil || math.Abs(*cost.USD-0.0123) > 1e-9 {
			t.Fatalf("run %s cost %+v, usd %v", call.ID, cost, cost.USD)
		}
	}
	// The reviewer is fresh-only: continuing with it is refused.
	refused := finish(contract.CallRequest{Process: "adversarial_review", Params: map[string]string{"base": "main"}, Continue: first.ID, Timeout: "1m", Cwd: repo})
	if refused.Result.Error == nil || refused.Result.Error.Class != "refused" || !strings.Contains(refused.Result.Error.Message, "fresh-only") {
		t.Fatalf("result = %+v", refused.Result)
	}
}

// What the agent changed in its own checkout is kept as an artifact before
// the checkout is released; the repository is untouched.
func TestWorkspaceChangesAreKept(t *testing.T) {
	home, repo := setup(t, "edit")
	if r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	last := lastRun(t, home)
	artifacts := last.record["result"].(map[string]any)["artifacts"].([]any)
	artifact := artifacts[0].(map[string]any)
	patch := read(t, filepath.Join(last.dir, artifact["path"].(string)))
	if len(artifacts) != 1 || !strings.Contains(patch, "+++ b/written-by-agent.txt") || !strings.HasPrefix(artifact["digest"].(string), "sha256:") {
		t.Fatalf("artifacts %v, patch:\n%s", artifacts, patch)
	}
	if status := gitCmd(t, repo, "status", "--porcelain"); status != "" {
		t.Fatalf("repository changed: %s", status)
	}
}

// A process declaring verify, in settings on disk: check and process show
// warn of it, a call records it under the process's digest and completes
// once its fixture command passes in the checkout, and a caller's timeout
// shorter than one run refuses the call.
func TestVerifyDeclarationEndToEnd(t *testing.T) {
	home, repo := setup(t, "approve")
	shipped := read(t, filepath.Join(home, "processes", "adversarial_review.yaml"))
	process := strings.Replace(shipped, "name: adversarial_review", "name: verified", 1) + `
verify:
  command: test -f a.txt
  timeout: 20s
  max_attempts: 1
  instruction: The verification command failed. Fix the cause, not the check.
`
	write(t, filepath.Join(home, "processes", "verified.yaml"), process)

	r := agister(t, home, repo, "check")
	if r.code != 0 || strings.Count(r.stderr, "warning process verified: verify runs its command with the operator's authority") != 1 || strings.Contains(r.stderr, "adversarial_review") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "process", "show", "verified")
	if r.code != 0 || !strings.Contains(r.stdout, "verify       test -f a.txt\n") || !strings.Contains(r.stdout, "WARNING      verify runs its command with the operator's authority") {
		t.Fatalf("show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	r = agister(t, home, repo, "run", "verified", "--param", "base=main", "--timeout", "30s")
	if r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s", r.code, r.stderr)
	}
	record := lastRun(t, home).record
	verified := record["id"]
	verify := record["verify"].(map[string]any)
	if verify["command"] != "test -f a.txt" || verify["timeout"] != float64(20e9) || verify["max_attempts"] != 1.0 || !strings.HasPrefix(verify["instruction"].(string), "The verification command failed.") {
		t.Fatalf("verify = %v", verify)
	}
	if attempts, _ := record["attempts"].([]any); len(attempts) != 1 || attempts[0].(map[string]any)["run"].(map[string]any)["passed"] != true {
		t.Fatalf("attempts = %v", record["attempts"])
	}
	for _, source := range record["definitions"].([]any) {
		source := source.(map[string]any)
		if sum := sha256.Sum256([]byte(process)); source["kind"] == "processes" && source["sha256"] != hex.EncodeToString(sum[:]) {
			t.Fatalf("process digest %v is not of the file as resolved", source["sha256"])
		}
	}

	r = agister(t, home, repo, "run", "verified", "--param", "base=main", "--timeout", "10s")
	// Two runs in one second need not list in the order they ran.
	entries, _ := os.ReadDir(filepath.Join(home, "runs"))
	var refused map[string]any
	for _, entry := range entries {
		var record map[string]any
		readJSON(t, filepath.Join(home, "runs", entry.Name(), "record.json"), &record)
		if record["id"] != verified {
			refused = record["result"].(map[string]any)["error"].(map[string]any)
		}
	}
	if r.code == cli.ExitCompleted || len(entries) != 2 || refused["class"] != "refused" ||
		!strings.Contains(refused["message"].(string), "verify.timeout 20s exceeds the effective timeout 10s") {
		t.Fatalf("run with a shorter timeout: %d, %v", r.code, refused)
	}
}
