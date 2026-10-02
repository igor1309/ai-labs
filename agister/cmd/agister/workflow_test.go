package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// workflowRun finds the workflow's own run among home's runs and returns
// its ID and record.
func workflowRun(t *testing.T, home string) (string, domain.Record) {
	t.Helper()
	paths, _ := filepath.Glob(filepath.Join(home, "runs", "*", "record.json"))
	for _, path := range paths {
		var record domain.Record
		data, err := os.ReadFile(path)
		if err == nil && json.Unmarshal(data, &record) == nil && record.Workflow != nil {
			return record.ID, record
		}
	}
	t.Fatalf("no workflow run among %v", paths)
	return "", domain.Record{}
}

// The shipped example workflow, end to end on the fake runtime: both
// fan-out nodes, then the join, whose text is the workflow's output; each
// node is a run of its own that names the workflow run.
func TestExampleWorkflowEndToEnd(t *testing.T) {
	home, repo := setup(t, "approve")
	if r := agister(t, home, repo, "workflow", "show", "review_panel"); r.code != 0 || !strings.Contains(r.stdout, "the collection as input reviews, and nothing else") {
		t.Fatalf("workflow show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r := agister(t, home, repo, "run", "review_panel", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitCompleted || r.stdout != "All good.\n" {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	for _, line := range []string{"· node adversarial (adversarial_review): run ", "· node architecture: completed", "· barrier passed", "· node summary: completed"} {
		if !strings.Contains(r.stderr, line) {
			t.Fatalf("stderr lacks %q:\n%s", line, r.stderr)
		}
	}
	id, record := workflowRun(t, home)
	if record.Process != "review_panel" || record.Result.Status != domain.Completed || record.Workflow.Barrier.State != domain.BarrierPassed || len(record.Workflow.Nodes) != 3 {
		t.Fatalf("workflow run = %+v", record)
	}
	candidate := gitCmd(t, repo, "rev-parse", "feature")
	var join run
	for _, node := range record.Workflow.Nodes {
		var child domain.Record
		readJSON(t, filepath.Join(home, "runs", node.Run, "record.json"), &child)
		if child.Parent == nil || child.Parent.Run != id || child.Parent.Node != node.Name || child.Result.Status != domain.Completed {
			t.Fatalf("node %s: %+v", node.Name, child)
		}
		if !node.Join && child.Request.Params["candidate"] != candidate {
			t.Fatalf("node %s params = %v, want candidate %s", node.Name, child.Request.Params, candidate)
		}
		if node.Join {
			join = lastRunIn(t, filepath.Join(home, "runs", node.Run))
		}
	}
	// The join's runtime received each fan-out output once, and nothing of
	// the caller's.
	prompt, _ := join.first["prompt"].(string)
	for _, node := range []string{`"node": "adversarial"`, `"node": "architecture"`} {
		if strings.Count(prompt, node) != 1 {
			t.Fatalf("the join's prompt has %s %d times:\n%s", node, strings.Count(prompt, node), prompt)
		}
	}
	if strings.Contains(prompt, candidate) {
		t.Fatalf("the join's prompt carries the candidate commit:\n%s", prompt)
	}
	// runs show and runs list cover it.
	if r := agister(t, home, repo, "runs", "show", id); r.code != 0 || !strings.Contains(r.stdout, `"barrier":{"state":"passed"}`) || !strings.Contains(r.stdout, `"nodes":[{"name":"adversarial"`) {
		t.Fatalf("runs show: %d\n%s", r.code, r.stdout)
	}
	if r := agister(t, home, repo, "runs"); r.code != 0 || !strings.Contains(r.stdout, id+"\treview_panel\t-\tcompleted") {
		t.Fatalf("runs: %d\n%s", r.code, r.stdout)
	}

	// What a caller may not give a workflow, and a join called on its own,
	// are refused.
	if r := agister(t, home, repo, "run", "review_panel", "--param", "architecture=a.txt", "--timeout", "1m"); r.code != cli.ExitRefused {
		t.Fatalf("with a timeout: exit %d\n%s", r.code, r.stderr)
	}
	if r := agister(t, home, repo, "run", "review_summary"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "given only to a workflow's join") {
		t.Fatalf("the join on its own: exit %d\n%s", r.code, r.stderr)
	}
}

// A fan-out node that times out, its runtime never ending by itself, does
// not keep the join from running on the node that completed (ADR-004): the
// join receives the completed output and the other node's status and class,
// the workflow's result is the join's, and both its record and its progress
// lines name the node that did not complete.
func TestExampleWorkflowJoinsWithoutATimedOutNode(t *testing.T) {
	home, repo := setup(t, "approve")
	// The adversarial review alone reads a file that makes the fake runtime
	// hang, first among its inputs, under a one-second timeout.
	path := filepath.Join(home, "processes", "adversarial_review.yaml")
	process := strings.Replace(read(t, path), "  values:\n", "  values:\n    stall: {source: file, path: stall.txt}\n", 1)
	write(t, path, strings.Replace(process, "workspace:\n", "timeout: 1s\n\nworkspace:\n", 1))
	write(t, filepath.Join(repo, "stall.txt"), "SCENARIO:hang\n")

	r := agister(t, home, repo, "run", "review_panel", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitCompleted || r.stdout != "All good.\n" {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	for _, line := range []string{"· node adversarial: interrupted/timeout", "· node architecture: completed",
		"! barrier passed: the join runs without adversarial, which did not complete", "· node summary: completed"} {
		if !strings.Contains(r.stderr, line) {
			t.Fatalf("stderr lacks %q:\n%s", line, r.stderr)
		}
	}
	_, record := workflowRun(t, home)
	if record.Result.Status != domain.Completed || record.Workflow.Barrier.State != domain.BarrierPassed ||
		strings.Join(record.Workflow.Barrier.Incomplete, ",") != "adversarial" {
		t.Fatalf("workflow run: result %+v, barrier %+v", record.Result, record.Workflow.Barrier)
	}
	var collection []map[string]any
	data, err := os.ReadFile(filepath.Join(home, "runs", record.ID, "artifacts", "collection.json"))
	if err != nil || json.Unmarshal(data, &collection) != nil || len(collection) != 2 {
		t.Fatalf("collection: %v\n%s", err, data)
	}
	adversarial, architecture := collection[0], collection[1]
	if adversarial["node"] != "adversarial" || adversarial["status"] != "interrupted" || adversarial["class"] != "timeout" || adversarial["output"] != nil {
		t.Fatalf("adversarial entry = %v", adversarial)
	}
	if architecture["node"] != "architecture" || architecture["status"] != "completed" || architecture["output"] == nil {
		t.Fatalf("architecture entry = %v", architecture)
	}
}

// lastRunIn reads one run's directory as lastRun does.
func lastRunIn(t *testing.T, dir string) run {
	t.Helper()
	var r run
	r.dir = dir
	readJSON(t, filepath.Join(dir, "record.json"), &r.record)
	if data, err := os.ReadFile(filepath.Join(dir, "provider.jsonl")); err == nil {
		_ = json.Unmarshal([]byte(strings.SplitN(string(data), "\n", 2)[0]), &r.first)
	}
	return r
}

// A CLI killed with SIGKILL while a workflow's fan-out nodes run leaves
// their runtimes and checkouts behind. The next call's reap treats each
// node's run like any unfinished run: it ends their effects and finishes
// them lost; the workflow run, unfinished and unowned, reads lost too.
func TestNextCallReapsAKilledWorkflowsNodes(t *testing.T) {
	home, repo := setup(t, "hang")
	binary := agisterBinary(t)
	victim := exec.Command(binary, "--home", home, "run", "review_panel", "--param", "base=main", "--param", "architecture=a.txt", "--quiet")
	victim.Dir = repo
	victim.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := victim.Start(); err != nil {
		t.Fatal(err)
	}
	// Should the test fail first, the cleanup ends what every run left on
	// record, whatever point the test reached.
	cleanupRecorded(t, home, repo)
	t.Cleanup(func() {
		_ = victim.Process.Kill()
		_ = victim.Wait()
	})
	var nodes []domain.Record

	// Both fan-out nodes run, each with its runtime and checkout on record.
	eventually(t, "both fan-out nodes to record their runtime and checkout", func() bool {
		paths, _ := filepath.Glob(filepath.Join(home, "runs", "*", "record.json"))
		nodes = nil
		for _, path := range paths {
			var record domain.Record
			data, err := os.ReadFile(path)
			if err != nil || json.Unmarshal(data, &record) != nil || record.Parent == nil {
				continue
			}
			if record.Effects == nil || record.Effects.Process == nil || record.Effects.Checkout == nil {
				return false
			}
			if _, token, err := supervisor.ParseRef(record.Effects.Process.Ref); err != nil || token == "" {
				return false
			}
			nodes = append(nodes, record)
		}
		return len(nodes) == 2
	})
	if err := victim.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	_ = victim.Wait()
	id, _ := workflowRun(t, home)

	client, background, err := wire(cli.Config{Home: home, Cwd: repo})
	if err != nil {
		t.Fatal(err)
	}
	next, err := client.Submit(context.Background(), contract.CallRequest{
		Process: "adversarial_review", Params: map[string]string{"base": "main"}, Timeout: "1s", Cwd: repo,
	})
	if err != nil {
		t.Fatal(err)
	}
	background.Wait()
	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	for _, node := range nodes {
		group, _, _ := supervisor.ParseRef(node.Effects.Process.Ref)
		eventually(t, "a node's runtime to be gone", func() bool { return !groupAlive(group) })
		if _, err := os.Stat(node.Effects.Checkout.Dir); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("checkout left behind: %v", err)
		}
		reaped, state, err := store.Get(context.Background(), node.ID)
		if err != nil || state != domain.StateFinished || reaped.Result.Status != domain.Lost || reaped.Result.Error.Class != domain.ClassAbandoned {
			t.Fatalf("node run %s: %s %+v %v", node.ID, state, reaped.Result, err)
		}
	}
	workflow, err := client.Inspect(context.Background(), id)
	if err != nil || workflow.State != string(domain.StateAbandoned) || workflow.Result.Status != "lost" || workflow.Result.Error.Class != "abandoned" {
		t.Fatalf("workflow run: %+v %v", workflow, err)
	}
	eventually(t, "the next call to finish", func() bool {
		_, state, err := store.Get(context.Background(), next)
		return err == nil && state == domain.StateFinished
	})
	eventually(t, "every checkout to be released", func() bool {
		return len(strings.Split(gitCmd(t, repo, "worktree", "list"), "\n")) == 1
	})
}
