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

// End-to-end: the real composition root, real git, fake runtime binaries.

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
	claude, codex := runtimetest.Binary(t, "fakeclaude"), runtimetest.Binary(t, "fakecodex")
	for _, args := range [][]string{
		{"init"},
		{"agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--model", "sonnet", "--model-family", "anthropic", "--effort", "high", "--command", claude},
		{"agent", "create", "assistant", "--force", "--runtime", "claude-code", "--model-family", "anthropic", "--command", claude},
		{"agent", "create", "codex-reviewer", "--force", "--runtime", "codex", "--model-family", "openai", "--command", codex},
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

func TestInitAndInspect(t *testing.T) {
	home, repo := setup(t, "approve")
	again := agister(t, home, repo, "init")
	if strings.Count(again.stdout, "kept ") != 14 {
		t.Fatalf("init again:\n%s", again.stdout)
	}
	shown := agister(t, home, repo, "process", "show", "adversarial_review")
	for _, want := range []string{
		"permissions  repository.read, repository.diff, repository.search",
		"  denied     repository.write, repository.history.write, process.execute, network",
		"plan         Read, Glob, Grep",
		"  withheld   repository.diff",
	} {
		if !strings.Contains(shown.stdout, want) {
			t.Errorf("missing %q in:\n%s", want, shown.stdout)
		}
	}
	codex := agister(t, home, repo, "process", "show", "adversarial_review", "--agent", "codex-reviewer")
	if !strings.Contains(codex.stdout, "REFUSED: runtime mapping codex is not verified") {
		t.Fatalf("codex:\n%s", codex.stdout)
	}
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
	// Constraints and plan come before any runtime process.
	order := strings.Join(last.kinds(), " ")
	if strings.Index(order, "CONSTRAINT_CHECKED") > strings.Index(order, "PROCESS_STARTED") || !strings.Contains(order, "PERMISSIONS_WITHHELD") {
		t.Fatalf("events = %s", order)
	}
}

func TestOutcomesMapToExitCodes(t *testing.T) {
	cases := map[string]struct {
		code int
		want string
	}{
		"request_changes": {cli.ExitRejected, "rejected (verdict is request_changes)"},
		"invalid_output":  {cli.ExitFailed, "failed (invalid output:"},
		"error_result":    {cli.ExitFailed, "failed (failed: runtime reported error_during_execution"},
	}
	for scenario, c := range cases {
		home, repo := setup(t, scenario)
		r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--quiet")
		if r.code != c.code || !strings.Contains(r.stderr, c.want) {
			t.Errorf("%s: exit %d\n%s", scenario, r.code, r.stderr)
		}
	}
}

func TestEveryRefusalIsRecorded(t *testing.T) {
	home, repo := setup(t, "approve")
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"run", "no_such_process"}, `process "no_such_process": not found`},
		{[]string{"run", "adversarial_review", "--param", "base=main", "--agent", "codex-reviewer"}, "runtime mapping codex is not verified for codex version 0.158.0"},
		{[]string{"run", "adversarial_review", "--param", "base=main", "--param", "focus=x"}, "takes no params: focus"},
		{[]string{"run", "architecture_review", "--param", "base=main"}, "missing params: architecture"},
		{[]string{"run", "adversarial_review", "--param", "base=main", "--timeout", "2h"}, "caller timeout 2h0m0s widens the effective 20m0s"},
		{[]string{"run", "adversarial_review", "--param", "base=HEAD"}, "no changes between"},
	}
	for _, c := range cases {
		r := agister(t, home, repo, c.args...)
		if r.code != cli.ExitRefused || !strings.Contains(r.stderr, c.want) {
			t.Errorf("%v: exit %d\n%s", c.args, r.code, r.stderr)
			continue
		}
		last := lastRun(t, home)
		if last.record["outcome"] != "refused" || strings.Contains(strings.Join(last.kinds(), " "), "PROCESS_STARTED") {
			t.Errorf("%v: record %v, events %v", c.args, last.record["outcome"], last.kinds())
		}
	}
}

func TestSandboxedRuntimeWithAConfinedMapping(t *testing.T) {
	home, repo := setup(t, "request_changes")
	// The shipped Codex mapping is unverified and declares host.read. A
	// verified mapping for a runtime that confines reads is settings only.
	mapping := filepath.Join(home, "runtimes", "codex.yaml")
	text := read(t, mapping)
	text = strings.Replace(text, "verified_versions: []", `verified_versions: ["0.158."]`, 1)
	text = strings.ReplaceAll(text, ", host.read", "")
	write(t, mapping, text)

	r := agister(t, home, repo, "run", "adversarial_review_sandboxed", "--param", "base=main", "--quiet")
	if r.code != cli.ExitRejected || !strings.Contains(r.stderr, "codex resume 01a0e850") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	last := lastRun(t, home)
	args := strings.Join(last.argv(), " ")
	if !strings.Contains(args, "--sandbox read-only") || !strings.HasPrefix(last.first["prompt"].(string), "<instructions>\nReview the exact candidate") {
		t.Fatalf("argv = %s", args)
	}
	// With host.read declared, the mode reaches Agister's state and is refused.
	write(t, mapping, strings.Replace(read(t, mapping), "process.execute]", "process.execute, host.read]", 1))
	refused := agister(t, home, repo, "run", "adversarial_review_sandboxed", "--param", "base=main", "--quiet")
	if refused.code != cli.ExitRefused || !strings.Contains(refused.stderr, "read-only also grants host.read") {
		t.Fatalf("exit %d\n%s", refused.code, refused.stderr)
	}
}

func TestConstraintsUseOnlyRecordedProvenance(t *testing.T) {
	home, repo := setup(t, "approve")
	candidate := gitCmd(t, repo, "rev-parse", "HEAD")
	write(t, filepath.Join(home, "provenance", candidate+".json"), `{"writer":{"agent":"builder","model_family":"anthropic","run_id":"r0"}}`)
	r := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--quiet")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "writer family anthropic (run r0)") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
	os.Remove(filepath.Join(home, "provenance", candidate+".json"))

	// Unknown provenance follows the constraint's own rule.
	policy := filepath.Join(home, "policies", "static-review.yaml")
	write(t, policy, strings.Replace(read(t, policy), "on_unknown: pass", "on_unknown: fail", 1))
	r = agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--quiet")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "no Agister-recorded provenance") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}

	// A constrained call needs the agent's model family.
	write(t, policy, strings.Replace(read(t, policy), "on_unknown: fail", "on_unknown: pass", 1))
	agister(t, home, repo, "agent", "create", "reviewer", "--force", "--runtime", "claude-code", "--command", runtimetest.Binary(t, "fakeclaude"))
	r = agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--quiet")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "declares no model_family") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
}

func TestAgistersStateIsOutsideEveryWorkspace(t *testing.T) {
	_, repo := setup(t, "approve")
	home := filepath.Join(repo, ".agister")
	setupHome(t, home, repo)
	r := agister(t, home, repo, "run", "ask", "--param", "question=what?", "--quiet")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "overlaps Agister's state") {
		t.Fatalf("exit %d\n%s", r.code, r.stderr)
	}
}

func setupHome(t *testing.T, home, repo string) {
	for _, args := range [][]string{
		{"init"},
		{"agent", "create", "assistant", "--force", "--runtime", "claude-code", "--model-family", "anthropic", "--command", runtimetest.Binary(t, "fakeclaude")},
	} {
		if r := agister(t, home, repo, args...); r.code != 0 {
			t.Fatalf("%v: %s", args, r.stderr)
		}
	}
}

func TestTextProcessAndRunInspection(t *testing.T) {
	home, repo := setup(t, "approve")
	r := agister(t, home, repo, "run", "ask", "--param", "question=What is here?", "--quiet")
	if r.code != 0 || r.stdout != "All good.\n" {
		t.Fatalf("exit %d stdout %q\n%s", r.code, r.stdout, r.stderr)
	}
	id := filepath.Base(lastRun(t, home).dir)
	listed := agister(t, home, repo, "runs")
	if !strings.Contains(listed.stdout, id+"\task\tassistant\taccepted") {
		t.Fatalf("runs:\n%s", listed.stdout)
	}
	// Observation resumes from any sequence: after event 2, the plan
	// (event 2) is not replayed but the rest is.
	watched := agister(t, home, repo, "runs", "watch", id, "--after", "2")
	if watched.code != 0 || strings.Contains(watched.stderr, "· plan") || !strings.Contains(watched.stderr, "· started pid") {
		t.Fatalf("watch:\n%s", watched.stderr)
	}
	shown := agister(t, home, repo, "runs", "show", id)
	var record map[string]any
	if err := json.Unmarshal([]byte(shown.stdout), &record); err != nil || record["id"] != id {
		t.Fatalf("show: %v\n%s", err, shown.stdout)
	}
	if missing := agister(t, home, repo, "runs", "show", "nope"); missing.code != cli.ExitUsage {
		t.Fatalf("missing run: %d", missing.code)
	}
}

func TestDiagnosticsAreCorrelatedWithRuns(t *testing.T) {
	home, repo := setup(t, "approve")
	agister(t, home, repo, "run", "ask", "--param", "question=hi", "--quiet")
	id := filepath.Base(lastRun(t, home).dir)
	var started, finished bool
	for _, line := range strings.Split(strings.TrimSpace(read(t, filepath.Join(home, "logs", "agister.jsonl"))), "\n") {
		var entry map[string]any
		_ = json.Unmarshal([]byte(line), &entry)
		if entry["run_id"] != id {
			continue
		}
		started = started || entry["msg"] == "turn.started"
		finished = finished || entry["msg"] == "turn.finished"
		if entry["level"] == "DEBUG" {
			t.Fatal("debug lines without --debug")
		}
	}
	if !started || !finished {
		t.Fatal("turn not logged under its run ID")
	}
	debug := agister(t, home, repo, "run", "ask", "--param", "question=hi", "--quiet", "--debug")
	if !strings.Contains(debug.stderr, `"level":"DEBUG","msg":"turn.event"`) {
		t.Fatalf("--debug:\n%s", debug.stderr)
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
