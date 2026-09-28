package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

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
		{"agent", "create", "assistant", "--force", "--runtime", "claude-code", "--model-family", "anthropic", "--command", claude},
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
	if r.code != cli.ExitAccepted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	var output map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &output); err != nil || output["verdict"] != "approve" {
		t.Fatalf("stdout = %s", r.stdout)
	}

	last := lastRun(t, home)
	record := last.record
	if record["outcome"] != "accepted" || record["agent"] != "reviewer" {
		t.Fatalf("record = %v", record)
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
	if !strings.Contains(args, "--tools=Read,Glob,Grep --allowedTools=Read,Glob,Grep") || strings.Contains(args, "Bash") {
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

func TestRefusedCallIsRecorded(t *testing.T) {
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "no_such_process", "--quiet")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, `process "no_such_process": not found`) {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if last := lastRun(t, home); last.record["outcome"] != "refused" {
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
	if r.code != cli.ExitAccepted {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	if args := strings.Join(lastRun(t, home).argv(), " "); !strings.Contains(args, "--tools=Read --allowedTools=Read") {
		t.Fatalf("argv = %s", args)
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
// workspace; the run finishes as failed (interrupted), not lost.
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
	if err != nil || inspected.Status != "finished" || inspected.Outcome != "failed" || inspected.Reason != "interrupted: cancelled" {
		t.Fatalf("run = %+v, %v", inspected, err)
	}
	if lines := strings.Split(gitCmd(t, repo, "worktree", "list"), "\n"); len(lines) != 1 {
		t.Fatalf("worktree not released: %v", lines)
	}
}
