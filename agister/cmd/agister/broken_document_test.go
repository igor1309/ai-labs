package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// brokenMapping writes runtime mapping name, the shipped claude-code one
// naming an adapter this binary does not know, and returns its path.
func brokenMapping(t *testing.T, home, name string) string {
	t.Helper()
	text := read(t, filepath.Join(home, "runtimes", "claude-code.yaml"))
	for _, field := range []string{"name", "adapter"} {
		line := regexp.MustCompile(`(?m)^` + field + `: claude-code$`)
		if !line.MatchString(text) {
			t.Fatalf("the shipped mapping has no %s: claude-code", field)
		}
		text = line.ReplaceAllString(text, field+": "+name)
	}
	path := filepath.Join(home, "runtimes", name+".yaml")
	write(t, path, text)
	return path
}

// newRuns are the runs recorded since the last time it was asked, oldest
// first by ID; a run's ID orders it only to the second.
type newRuns struct {
	home string
	seen map[string]bool
}

func (n *newRuns) take(t *testing.T) []run {
	t.Helper()
	if n.seen == nil {
		n.seen = map[string]bool{}
	}
	entries, _ := os.ReadDir(filepath.Join(n.home, "runs"))
	var runs []run
	for _, entry := range entries {
		if !n.seen[entry.Name()] {
			n.seen[entry.Name()] = true
			runs = append(runs, readRun(t, filepath.Join(n.home, "runs", entry.Name())))
		}
	}
	return runs
}

// one is the single run recorded since the last time it was asked.
func (n *newRuns) one(t *testing.T) run {
	t.Helper()
	runs := n.take(t)
	if len(runs) != 1 {
		t.Fatalf("%d runs recorded, want one", len(runs))
	}
	return runs[0]
}

// A broken document stops nothing that does not use it (ADR-013): an
// unused global runtime mapping that names an unknown adapter fails check,
// which says it refuses nothing, and every other command and call runs.
func TestAnUnusedBrokenMappingRefusesNothing(t *testing.T) {
	home, repo := setup(t, "approve")
	brokenMapping(t, home, "elsewhere")

	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "runtime mapping elsewhere: unknown adapter \"elsewhere\"") ||
		!strings.Contains(r.stderr, "\n  refuses nothing\n1 problem(s)") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if last := lastRun(t, home); last.record["agent"] != "reviewer" || last.first == nil {
		t.Fatalf("the call did not run on the fake runtime: %v", last.record)
	}
	for _, args := range [][]string{{"runs", "list"}, {"process", "list"}, {"workflow", "list"}, {"agent", "list"}} {
		if r := agister(t, home, repo, args...); r.code != 0 || strings.Contains(r.stdout, "REFUSED") {
			t.Fatalf("%v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
		}
	}
}

// A call whose agent runs on a broken mapping is refused before its first
// turn and recorded, naming the document, its path, its problem and the
// chain that reaches it; a workflow with a node on it is refused before any
// node runs; with --agent, a call on a sound agent runs (ADR-013).
func TestACallOnABrokenMappingIsRefused(t *testing.T) {
	home, repo := setup(t, "approve")
	path := brokenMapping(t, home, "elsewhere")
	agent := read(t, filepath.Join(home, "agents", "reviewer.toml"))
	agent = strings.Replace(strings.Replace(agent, `name = "reviewer"`, `name = "stranded"`, 1), `runtime = "claude-code"`, `runtime = "elsewhere"`, 1)
	write(t, filepath.Join(home, "agents", "stranded.toml"), agent)
	process := filepath.Join(home, "processes", "adversarial_review.yaml")
	write(t, process, strings.Replace(read(t, process), "uses: agent:reviewer", "uses: agent:stranded", 1))

	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "runtime mapping elsewhere: unknown adapter \"elsewhere\"") ||
		!strings.Contains(r.stderr, "\n  refuses process adversarial_review, workflow review_panel\n") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	r = agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m")
	want := "process adversarial_review uses agent stranded, which uses runtime mapping elsewhere (" + path + "): unknown adapter \"elsewhere\""
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	refused := runs.one(t)
	if result := refused.record["result"].(map[string]any); result["error"].(map[string]any)["class"] != "refused" || !strings.Contains(result["error"].(map[string]any)["message"].(string), want) || refused.first != nil {
		t.Fatalf("record = %v, runtime = %v", refused.record, refused.first)
	}

	r = agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "workflow review_panel uses process adversarial_review, which uses agent stranded, which uses runtime mapping elsewhere ("+path+")") {
		t.Fatalf("workflow: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// The workflow's run alone: no node was started.
	if workflow := runs.one(t); workflow.record["process"] != "review_panel" || workflow.record["workflow"] != nil {
		t.Fatalf("workflow record = %v", workflow.record)
	}

	for _, args := range [][]string{{"process", "list"}, {"workflow", "list"}} {
		r := agister(t, home, repo, args...)
		if r.code != 0 || !strings.Contains(r.stdout, "\tREFUSED: ") {
			t.Fatalf("%v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
		}
	}
	if r := agister(t, home, repo, "process", "show", "adversarial_review"); r.code != 0 || !strings.Contains(r.stdout, "REFUSED: "+want) {
		t.Fatalf("show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	r = agister(t, home, repo, "run", "adversarial_review", "--agent", "reviewer", "--quiet", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("run --agent reviewer: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if ran := runs.one(t); ran.record["agent"] != "reviewer" || ran.first == nil {
		t.Fatalf("the call did not run as reviewer: %v", ran.record)
	}
}
