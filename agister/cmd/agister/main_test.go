package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
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
	var stdout, stderr bytes.Buffer
	code := cli.Run(context.Background(), append([]string{"--home", home}, args...), cli.IO{
		Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: &stderr, Cwd: cwd,
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
	dir := t.TempDir()
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
	for _, args := range [][]string{
		{"init"},
		{"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model", "sonnet", "--model-family", "anthropic", "--effort", "high", "--command", claude},
		{"agent", "create", "assistant", "--force", "--runtime", "claude-code", "--model-family", "anthropic", "--session", "resumable", "--command", claude},
	} {
		if r := agister(t, home, repo, args...); r.code != 0 {
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
	r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main")
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
		timing["runtime_ms"] != 3400.0 || timing["turn_ms"] == nil || result["session"].(map[string]any)["provider_session_id"] != record["requested_session_id"] {
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
	// Constraints and plan come before any runtime process.
	order := strings.Join(last.kinds(), " ")
	if strings.Index(order, "CONSTRAINT_CHECKED") > strings.Index(order, "PROCESS_STARTED") || !strings.Contains(order, "PERMISSIONS_WITHHELD") {
		t.Fatalf("events = %s", order)
	}
}

func TestShippedExamplesPassCheck(t *testing.T) {
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "check", "--probe")
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") {
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
	if r := agister(t, home, repo, "init"); r.code != 0 {
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
	if r.code != cli.ExitUsage || !strings.HasPrefix(r.stderr, "service service: not a UTF-8 text file\n1 problem(s)") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
}

func TestRefusedCallIsRecorded(t *testing.T) {
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "no_such_process", "--quiet")
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
contract: claude-code/1
verified_versions: ["2.1."]
primitives:
  select: any
  items:
    Read: {grants: [docs.read]}
    Write: {grants: [docs.write]}
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
	r := agister(t, home, repo, "run", "check_docs", "--quiet")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if args := strings.Join(lastRun(t, home).argv(), " "); !strings.Contains(args, "--tools=Read --allowedTools=Read") {
		t.Fatalf("argv = %s", args)
	}
}

// A repository's own .agister replaces global settings of the same name,
// wherever in the repository Agister runs; outside it, only global ones apply.
func TestProjectSettingsOverrideGlobal(t *testing.T) {
	home, repo := setup(t, "approve")
	ask := strings.Replace(read(t, filepath.Join(home, "processes", "ask.yaml")), "Answer the question", "PROJECT: answer the question", 1)
	write(t, filepath.Join(repo, ".agister", "processes", "ask.yaml"), ask)
	write(t, filepath.Join(repo, ".agister", "processes", "ask_here.yaml"), strings.Replace(ask, "name: ask", "name: ask_here", 1))
	sub := filepath.Join(repo, "sub")
	write(t, filepath.Join(sub, "keep"), "")

	if r := agister(t, home, sub, "process", "list"); r.code != 0 || !strings.Contains(r.stdout, "ask_here") {
		t.Fatalf("list in project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, sub, "run", "ask", "--quiet", "--param", "question=q"); r.code != cli.ExitCompleted {
		t.Fatalf("run in project: %d\n%s", r.code, r.stderr)
	}
	last := lastRun(t, home)
	var process string
	for _, source := range last.record["definitions"].([]any) {
		if source := source.(map[string]any); source["kind"] == "processes" {
			process = source["path"].(string)
		}
	}
	if !strings.Contains(strings.Join(last.argv(), " "), "PROJECT: answer") || process != filepath.Join(repo, ".agister", "processes", "ask.yaml") {
		t.Fatalf("project process not used: path %s, argv %v", process, last.argv())
	}

	outside := t.TempDir()
	// Run IDs have one-second resolution; keep the next run the only one.
	if err := os.RemoveAll(filepath.Join(home, "runs")); err != nil {
		t.Fatal(err)
	}
	if r := agister(t, home, outside, "process", "list"); r.code != 0 || strings.Contains(r.stdout, "ask_here") {
		t.Fatalf("list outside project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, outside, "run", "ask", "--quiet", "--param", "question=q"); r.code != cli.ExitCompleted {
		t.Fatalf("run outside project: %d\n%s", r.code, r.stderr)
	}
	if args := strings.Join(lastRun(t, home).argv(), " "); strings.Contains(args, "PROJECT") {
		t.Fatalf("project settings leaked outside the project: %s", args)
	}

	// The limits and grants that bound the project's policies stay global.
	write(t, filepath.Join(repo, ".agister", "service.toml"), read(t, filepath.Join(home, "service.toml")))
	r := agister(t, home, sub, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "only global settings") {
		t.Fatalf("check with project service: %d\n%s%s", r.code, r.stdout, r.stderr)
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
	id, err := client.Submit(ctx, contract.CallRequest{Process: "adversarial_review", Params: map[string]string{"base": "main"}, Cwd: repo})
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

// A domain result, even an unfavourable one, is output of a completed node:
// routing on it is the workflow's business.
func TestVerdictIsOutputNotStatus(t *testing.T) {
	home, repo := setup(t, "request_changes")
	r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--json", "--quiet")
	var result contract.Result
	if err := json.Unmarshal([]byte(r.stdout), &result); err != nil || r.code != cli.ExitCompleted || result.Status != "completed" || !strings.Contains(string(result.Output), `"request_changes"`) {
		t.Fatalf("exit %d, result %s, err %v", r.code, r.stdout, err)
	}
}

// A continuation resumes the earlier run's provider session in a new one.
func TestContinuationEndToEnd(t *testing.T) {
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
	first := finish(contract.CallRequest{Process: "ask", Params: map[string]string{"question": "What is a.txt?"}, Cwd: repo})
	second := finish(contract.CallRequest{Process: "ask", Params: map[string]string{"question": "And b.txt?"}, Continue: first.ID, Cwd: repo})
	if first.Result.Status != "completed" || second.Result.Status != "completed" {
		t.Fatalf("first %+v, second %+v", first.Result, second.Result)
	}
	earlier, later := first.Result.Session.ProviderSessionID, second.Result.Session.ProviderSessionID
	var provider map[string]any
	data, _ := os.ReadFile(filepath.Join(home, "runs", second.ID, "provider.jsonl"))
	_ = json.Unmarshal([]byte(strings.SplitN(string(data), "\n", 2)[0]), &provider)
	args := fmt.Sprint(provider["argv"])
	if earlier == later || second.Result.Session.Continues != first.ID || !strings.Contains(args, "--resume "+earlier+" --fork-session --session-id "+later) {
		t.Fatalf("earlier %s, later %s, argv %s", earlier, later, args)
	}
	// The reviewer is fresh-only: continuing with it is refused.
	refused := finish(contract.CallRequest{Process: "adversarial_review", Params: map[string]string{"base": "main"}, Continue: first.ID, Cwd: repo})
	if refused.Result.Error == nil || refused.Result.Error.Class != "refused" || !strings.Contains(refused.Result.Error.Message, "fresh-only") {
		t.Fatalf("result = %+v", refused.Result)
	}
}

// What the agent changed in its own checkout is kept as an artifact before
// the checkout is released; the repository is untouched.
func TestWorkspaceChangesAreKept(t *testing.T) {
	home, repo := setup(t, "edit")
	if r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--quiet"); r.code != cli.ExitCompleted {
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
