package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// writeBlocks writes dir's blocks.yaml, blocking each ref, and returns its path.
func writeBlocks(t *testing.T, dir string, entries ...string) string {
	t.Helper()
	text := "schema: agister.blocks/v1alpha1\nblocks:\n"
	for _, entry := range entries {
		text += "  - " + entry + "\n"
	}
	path := filepath.Join(dir, "blocks.yaml")
	write(t, path, text)
	return path
}

// Home allows the reviewer and the repository blocks it (ADR-018): every
// call that depends on it is refused before its first turn and recorded,
// naming the chain, the block's path and its reason; a workflow with a node
// on it is refused before any node runs; --agent naming it is refused, and
// --agent naming another agent runs. check passes and lists the block with
// what it refuses, and listings show the refusal.
func TestARepositoryBlocksAnAgentHomeAllows(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	path := writeBlocks(t, filepath.Join(repo, ".agister"), "{ref: 'agent:reviewer', reason: Reviews are done by hand here}")

	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.Contains(r.stdout, "block agent reviewer: "+path+": Reviews are done by hand here\n"+
		"  refuses process adversarial_review, process architecture_review, process review_summary, workflow review_panel\n") ||
		!strings.Contains(r.stdout, "settings OK") || !strings.Contains(r.stdout, "1 blocks") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	var report contract.CheckReport
	r = agister(t, home, repo, "check", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 || len(report.Problems) != 0 || len(report.Blocks) != 1 ||
		report.Blocks[0].Ref != (contract.DefinitionRef{Kind: "agents", Name: "reviewer"}) || report.Blocks[0].Path != path || report.Blocks[0].Reason != "Reviews are done by hand here" ||
		!reflect.DeepEqual(report.Blocks[0].Processes, []string{"adversarial_review", "architecture_review", "review_summary"}) ||
		!reflect.DeepEqual(report.Blocks[0].Workflows, []string{"review_panel"}) {
		t.Fatalf("check --json: %d %v\n%s", r.code, err, r.stdout)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	want := "process adversarial_review: agent reviewer is blocked by " + path + ": Reviews are done by hand here"
	r = agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	refused := runs.one(t)
	if failure := refused.record["result"].(map[string]any)["error"].(map[string]any); failure["class"] != "refused" || !strings.Contains(failure["message"].(string), want) || refused.first != nil {
		t.Fatalf("record = %v, runtime = %v", refused.record, refused.first)
	}

	r = agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "workflow review_panel uses process adversarial_review: agent reviewer is blocked by "+path+": Reviews are done by hand here") {
		t.Fatalf("workflow: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if workflow := runs.one(t); workflow.record["process"] != "review_panel" || workflow.record["workflow"] != nil {
		t.Fatalf("workflow record = %v", workflow.record)
	}

	r = agister(t, home, repo, "run", "ask", "--agent", "reviewer", "--quiet", "--param", "question=q", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "process ask: agent reviewer is blocked by "+path) {
		t.Fatalf("run ask --agent reviewer: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil {
		t.Fatalf("the runtime ran: %v", refused.first)
	}
	r = agister(t, home, repo, "run", "adversarial_review", "--agent", "assistant", "--quiet", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitCompleted {
		t.Fatalf("run --agent assistant: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if ran := runs.one(t); ran.record["agent"] != "assistant" || ran.first == nil {
		t.Fatalf("the call did not run as assistant: %v", ran.record)
	}

	for _, listing := range []struct {
		args           []string
		refused, sound string
	}{
		{[]string{"process", "list"}, "adversarial_review", "ask"},
		{[]string{"workflow", "list"}, "review_panel", ""},
		{[]string{"agent", "list"}, "reviewer", "assistant"},
	} {
		r := agister(t, home, repo, listing.args...)
		if r.code != 0 || !regexp.MustCompile(`(?m)^`+listing.refused+`\b.*\tREFUSED: .*is blocked by `+regexp.QuoteMeta(path)).MatchString(r.stdout) ||
			listing.sound != "" && regexp.MustCompile(`(?m)^`+listing.sound+`\b.*REFUSED`).MatchString(r.stdout) {
			t.Fatalf("%v: %d\n%s%s", listing.args, r.code, r.stdout, r.stderr)
		}
	}
	if r := agister(t, home, repo, "process", "show", "adversarial_review"); r.code != 0 || !strings.Contains(r.stdout, "REFUSED: "+want) {
		t.Fatalf("show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	// Home is unchanged for a repository without blocks.
	other := recordRepository(t, gitOf(t, home), "approve")
	if r := agister(t, home, other, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run in a repository without blocks: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if ran := runs.one(t); ran.record["agent"] != "reviewer" || ran.first == nil {
		t.Fatalf("the call did not run as reviewer: %v", ran.record)
	}
	if r := agister(t, home, other, "check"); r.code != 0 || strings.Contains(r.stdout, "block ") {
		t.Fatalf("check in a repository without blocks: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, other, "check", "--json"); r.code != 0 || !strings.Contains(r.stdout, `"blocks": []`) {
		t.Fatalf("check --json in a repository without blocks: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A block on a process refuses its calls and the workflows with a node on
// it; a block on a runtime mapping refuses every process whose agent runs
// on it, through the chain (ADR-018 rule 2). A block without a reason names
// its path.
func TestBlocksOnAProcessAndARuntimeMapping(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	path := writeBlocks(t, filepath.Join(repo, ".agister"), "{ref: 'process:review_summary'}")

	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.Contains(r.stdout, "block process review_summary: "+path+"\n  refuses process review_summary, workflow review_panel\n") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "review_summary", "--quiet", "--param", "base=main", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "process review_summary is blocked by "+path+")") {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "workflow review_panel: process review_summary is blocked by "+path) {
		t.Fatalf("workflow: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("unblocked run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	writeBlocks(t, filepath.Join(repo, ".agister"), "{ref: 'runtime:claude-code', reason: no Claude here}")
	r = agister(t, home, repo, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m")
	want := "process ask uses agent assistant: runtime mapping claude-code is blocked by " + path + ": no Claude here"
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run on the blocked runtime: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "check")
	if r.code != 0 || !strings.Contains(r.stdout, "block runtime claude-code: "+path+": no Claude here\n  refuses process adversarial_review, process architecture_review, process ask, process implement, process review_summary, workflow review_panel\n") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A block on a workflow refuses its runs before any node starts, and is
// recorded; check lists it with what it refuses, the listing and the view
// show the workflow refused, and the processes its nodes call still run on
// their own (ADR-018 rule 2).
func TestABlockOnAWorkflow(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	path := writeBlocks(t, filepath.Join(repo, ".agister"), "{ref: 'workflow:review_panel', reason: no panels here}")
	want := "workflow review_panel is blocked by " + path + ": no panels here"

	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.Contains(r.stdout, "block workflow review_panel: "+path+": no panels here\n  refuses workflow review_panel\n") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	var report contract.CheckReport
	r = agister(t, home, repo, "check", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 || len(report.Blocks) != 1 ||
		report.Blocks[0].Ref != (contract.DefinitionRef{Kind: "workflows", Name: "review_panel"}) ||
		len(report.Blocks[0].Processes) != 0 || !reflect.DeepEqual(report.Blocks[0].Workflows, []string{"review_panel"}) {
		t.Fatalf("check --json: %d %v\n%s", r.code, err, r.stdout)
	}

	runs := &newRuns{home: home}
	runs.take(t)
	r = agister(t, home, repo, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	// One run, the workflow's, refused: no node started.
	refused := runs.one(t)
	if failure := refused.record["result"].(map[string]any)["error"].(map[string]any); refused.record["process"] != "review_panel" ||
		failure["class"] != "refused" || !strings.Contains(failure["message"].(string), want) || refused.first != nil {
		t.Fatalf("record = %v, runtime = %v", refused.record, refused.first)
	}

	r = agister(t, home, repo, "workflow", "list")
	if r.code != 0 || !regexp.MustCompile(`(?m)^review_panel\b.*\tREFUSED: .*`+regexp.QuoteMeta(want)).MatchString(r.stdout) {
		t.Fatalf("workflow list: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "workflow", "show", "review_panel"); r.code != 0 || !strings.Contains(r.stdout, "REFUSED: "+want) {
		t.Fatalf("workflow show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "process", "list"); r.code != 0 || strings.Contains(r.stdout, "REFUSED") {
		t.Fatalf("process list: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	if r := agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("a node's process on its own: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if ran := runs.one(t); ran.record["agent"] != "reviewer" || ran.first == nil {
		t.Fatalf("the call did not run: %v", ran.record)
	}
}

// A broken blocks.yaml, or one naming a document in neither layer, stops
// every command in the repository, as what it was meant to block cannot be
// known (ADR-018 rule 5): one that is invalid, declares a key twice, holds
// more than one document, or exists but cannot be read, as a directory, a dangling symlink or a
// symlink loop cannot, never reads as no blocks. check names its path, no
// runtime starts, and install and restore still run.
func TestABrokenBlockListStopsEveryCommandButInstallAndRestore(t *testing.T) {
	t.Parallel()
	entries := func(entries ...string) func(t *testing.T, dir string) string {
		return func(t *testing.T, dir string) string { return writeBlocks(t, dir, entries...) }
	}
	text := func(text string) func(t *testing.T, dir string) string {
		return func(t *testing.T, dir string) string {
			path := filepath.Join(dir, "blocks.yaml")
			write(t, path, text)
			return path
		}
	}
	planted := func(plant func(path string) error) func(t *testing.T, dir string) string {
		return func(t *testing.T, dir string) string {
			path := filepath.Join(dir, "blocks.yaml")
			if err := os.MkdirAll(dir, 0o700); err != nil {
				t.Fatal(err)
			}
			if err := plant(path); err != nil {
				t.Fatal(err)
			}
			return path
		}
	}
	for name, c := range map[string]struct {
		plant func(t *testing.T, dir string) string
		want  string // at the end of check's problem, which names the path
	}{
		"missing document": {plant: entries("{ref: 'agent:nobody'}"), want: "blocks[0].ref: agent nobody is in neither the repository's settings nor home's"},
		"unknown kind":     {plant: entries("{ref: 'policy:read-only'}")},
		"invalid":          {plant: entries("{ref: 'agent:reviewer', why: typo}")},
		"key twice in an entry": {
			plant: entries("{ref: 'agent:nobody', ref: 'agent:reviewer'}"),
			want:  "blocks[0].ref: is declared more than once",
		},
		"key twice in the document": {
			plant: text("schema: agister.blocks/v1alpha1\nblocks: []\nblocks:\n  - ref: agent:reviewer\n"),
			want:  "blocks: is declared more than once",
		},
		"a second document": {
			plant: text("---\n---\nschema: agister.blocks/v1alpha1\nblocks:\n  - ref: agent:reviewer\n"),
			want:  "must hold exactly one YAML document",
		},
		"directory":        {plant: planted(func(path string) error { return os.Mkdir(path, 0o700) }), want: ": is a directory"},
		"dangling symlink": {plant: planted(func(path string) error { return os.Symlink(path+".gone", path) }), want: ": no such file or directory"},
		"symlink loop":     {plant: planted(func(path string) error { return os.Symlink(path, path) }), want: ": too many levels of symbolic links"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, "approve")
			path := c.plant(t, filepath.Join(repo, ".agister"))

			r := agister(t, home, repo, "check")
			problem := regexp.MustCompile(`(?m)^blocks \(` + regexp.QuoteMeta(path) + `\): .*` + regexp.QuoteMeta(c.want) + `$`)
			if r.code != cli.ExitUsage || !problem.MatchString(r.stderr) || !strings.Contains(r.stderr, "\n  stops every command\n") {
				t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			runs := &newRuns{home: home}
			runs.take(t)
			for _, args := range [][]string{
				{"run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m"},
				{"run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt"},
				{"process", "list"}, {"process", "show", "ask"}, {"workflow", "list"}, {"agent", "list"}, {"runs"},
			} {
				if r := agister(t, home, repo, args...); r.code == 0 || r.code == cli.ExitCompleted || !strings.Contains(r.stderr, "stop every command") {
					t.Fatalf("%v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
				}
			}
			for _, ran := range runs.take(t) {
				if ran.first != nil {
					t.Fatalf("the runtime started: %v", ran.record)
				}
			}

			src := filepath.Join(tempDir(t), ".agister")
			write(t, filepath.Join(src, "prompts", "house.md"), "Follow the house style.\n")
			r = agisterInstalling(t, "yes\n", home, repo, "install", src)
			match := regexp.MustCompile(`restore with: agister install --restore (\S+)\n`).FindStringSubmatch(r.stdout)
			if r.code != 0 || match == nil || read(t, filepath.Join(home, "prompts", "house.md")) != "Follow the house style.\n" {
				t.Fatalf("install: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			if r := agisterInstalling(t, "yes\n", home, repo, "install", "--restore", match[1]); r.code != 0 || !strings.Contains(r.stdout, "removed  "+filepath.Join(home, "prompts", "house.md")) {
				t.Fatalf("restore: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
		})
	}
}

// A block on a document that exists but has a problem of its own blocks it
// as written, and the document's problem is reported as before (ADR-018
// rule 5): the agent is not missing, and a process on another agent runs.
func TestABlockOnABrokenDocumentBlocksItAsWritten(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "agents", "reviewer.toml"), "not toml =\n")
	path := writeBlocks(t, filepath.Join(repo, ".agister"), "{ref: 'agent:reviewer', reason: Reviews are done by hand here}")

	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "\nagent reviewer: toml: ") ||
		!strings.Contains(r.stdout, "block agent reviewer: "+path+": Reviews are done by hand here\n") ||
		strings.Contains(r.stdout+r.stderr, "in neither the repository's settings nor home's") || strings.Contains(r.stderr, "stops every command") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs := &newRuns{home: home}
	runs.take(t)
	if r := agister(t, home, repo, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run ask: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if ran := runs.one(t); ran.record["agent"] != "assistant" || ran.first == nil {
		t.Fatalf("the call did not run as assistant: %v", ran.record)
	}
}

// Home declines a choice by not defining it: a blocks.yaml in home is a
// problem of home's settings that refuses nothing, and blocks nothing
// (ADR-018 rule 1), in a repository with blocks of its own or without.
func TestHomeBlocksNothing(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	path := writeBlocks(t, home, "{ref: 'agent:reviewer'}")

	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "blocks ("+path+"): home's settings block nothing") ||
		!strings.Contains(r.stderr, "\n  refuses nothing\n1 problem(s)") || strings.Contains(r.stdout, "block agent") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	own := writeBlocks(t, filepath.Join(repo, ".agister"), "{ref: 'process:ask'}")
	r = agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "blocks ("+path+"): home's settings block nothing") ||
		!strings.Contains(r.stdout, "block process ask: "+own+"\n") || strings.Contains(r.stdout, "block agent") {
		t.Fatalf("check with the repository's blocks: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, home, repo, "run", "adversarial_review", "--quiet", "--param", "base=main", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run with the repository's blocks: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// install installs settings into home, which has no blocks: a blocks.yaml
// in the folder is reported and not installed (ADR-018 rule 6).
func TestInstallDoesNotInstallBlocks(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	src := filepath.Join(tempDir(t), ".agister")
	write(t, filepath.Join(src, "prompts", "house.md"), "Follow the house style.\n")
	writeBlocks(t, src, "{ref: 'agent:reviewer'}")

	r := agisterInstalling(t, "yes\n", home, tempDir(t), "install", src)
	if r.code != 0 || !strings.Contains(r.stdout, "not settings, not installed: blocks.yaml") || strings.Contains(r.stdout, filepath.Join(home, "blocks.yaml")) {
		t.Fatalf("install: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if _, ok := files(t, home)["blocks.yaml"]; ok {
		t.Fatal("blocks.yaml was installed")
	}
}
