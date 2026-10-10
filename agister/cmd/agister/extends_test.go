package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// A process may extend one base process (ADR-030 rule 9), on temp settings:
// home's, and a repository's .agister over it.

// baseAsk is a base: it leaves out the prompt, which the process that
// extends it sets.
const baseAsk = `schema: agister.process/v1alpha1
name: base_ask
type: process
uses: agent:assistant
policy: process-policy:read-only
input:
  instruction: 'HOME BASE: answer the question.'
  params:
    question: {default: the base's question}
  values:
    question: {source: param, name: question}
output:
  format: text
`

// childAsk extends baseAsk: its name, its base, its prompt and its own
// default for the base's param.
const childAsk = `schema: agister.process/v1alpha1
name: child_ask
type: process
extends: process:base_ask
prompt: ask
input:
  params:
    question: {default: the child's question}
`

// extending is setup with baseAsk and childAsk in home.
type extending struct {
	home, repo string
	// Each process's file in home, and the repository's.
	base, child, repoBase, repoChild string
}

func extendingSettings(t *testing.T) extending {
	t.Helper()
	home, repo := setup(t, "approve")
	e := extending{
		home: home, repo: repo,
		base:      filepath.Join(home, "processes", "base_ask.yaml"),
		child:     filepath.Join(home, "processes", "child_ask.yaml"),
		repoBase:  filepath.Join(repo, ".agister", "processes", "base_ask.yaml"),
		repoChild: filepath.Join(repo, ".agister", "processes", "child_ask.yaml"),
	}
	write(t, e.base, baseAsk)
	write(t, e.child, childAsk)
	return e
}

// The base is composed from its layers first, and the process's layers are
// laid over it: the repository's partial of the base reaches the process,
// whose own home file still wins over it. The record names the process,
// and the base's files among the layers it was composed from. check passes
// though the base has no prompt: it is checked through its process.
func TestAProcessRunsOverItsBaseAsItsLayersComposeIt(t *testing.T) {
	t.Parallel()
	e := extendingSettings(t)
	write(t, e.repoBase, "input:\n  instruction: 'REPOSITORY BASE: answer the question.'\n  params:\n    question: {default: the repository base's question}\n")
	runs := &newRuns{home: e.home}
	runs.take(t)

	if r := agister(t, e.home, e.repo, "check"); r.code != 0 || !strings.Contains(r.stdout, "settings OK") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, e.home, e.repo, "run", "child_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run child_ask: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	run := runs.one(t)
	given, _ := run.first["prompt"].(string)
	if run.record["process"] != "child_ask" || run.record["agent"] != "assistant" ||
		!strings.Contains(strings.Join(run.argv(), " "), "REPOSITORY BASE: answer the question.") ||
		!strings.Contains(given, "the child's question") || strings.Contains(given, "the repository base's question") ||
		!strings.Contains(given, read(t, filepath.Join(e.home, "prompts", "ask.md"))) {
		t.Fatalf("process %v on agent %v was run by %v and given:\n%s", run.record["process"], run.record["agent"], run.argv(), given)
	}
	var paths []string
	for _, layer := range definitionOf(t, run, "processes", "child_ask")["layers"].([]any) {
		paths = append(paths, layer.(map[string]any)["path"].(string))
	}
	if strings.Join(paths, " ") != strings.Join([]string{e.child, e.repoBase, e.base}, " ") {
		t.Fatalf("layers %v", paths)
	}
}

// What a process cannot take from its base, or say of it: each is a
// problem of the process, which check reports and which refuses its run.
func TestWhatAnExtendingProcessCannotDo(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name    string
		change  func(e extending)
		problem string
	}{
		{"the base's name is not taken", func(e extending) {
			write(t, e.child, strings.Replace(childAsk, "name: child_ask\n", "", 1))
		}, "process child_ask: name: is required"},
		{"a base extends nothing", func(e extending) {
			write(t, e.base, baseAsk+"extends: process:ask\n")
		}, "process child_ask: extends process:base_ask, which names extends too: a base extends nothing"},
		{"a layer's partial cannot set extends", func(e extending) {
			write(t, e.repoChild, "extends: process:ask\n")
		}, "process child_ask: extends: is set in REPO_CHILD, a layer's partial: only the nearest file that holds the whole process, HOME_CHILD, names its base"},
		{"a layer's partial cannot repeat extends", func(e extending) {
			write(t, e.repoChild, "extends: process:base_ask\n")
		}, "process child_ask: extends: is set in REPO_CHILD, a layer's partial"},
		{"a base is of the process's layer", func(e extending) {
			write(t, e.repoBase, "input:\n  instruction: 'REPOSITORY BASE: answer the question.'\n")
			write(t, e.repoChild, childAsk)
		}, "process child_ask: extends process:base_ask, which the repository layer of REPO_CHILD does not define: a process extends a base of its own layer"},
		{"a base is named as process:<name>", func(e extending) {
			write(t, e.child, strings.Replace(childAsk, "process:base_ask", "base_ask", 1))
		}, `process child_ask: extends: must be "process:<name>"`},
		{"the base exists", func(e extending) {
			write(t, e.child, strings.Replace(childAsk, "process:base_ask", "process:gone", 1))
		}, "process child_ask: extends process:gone: not found"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			e := extendingSettings(t)
			c.change(e)
			problem := strings.NewReplacer("REPO_CHILD", e.repoChild, "HOME_CHILD", e.child).Replace(c.problem)
			if r := agister(t, e.home, e.repo, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) {
				t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
			}
			runs := &newRuns{home: e.home}
			runs.take(t)
			if r := agister(t, e.home, e.repo, "run", "child_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused {
				t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			if refused := runs.one(t); refused.first != nil {
				t.Fatalf("the runtime ran: %v", refused.first)
			}
		})
	}
}

// A base is not work: its run is refused before its runtime starts, and a
// workflow whose node binds it is a problem of the workflow, which refuses
// it.
func TestABaseIsNotRun(t *testing.T) {
	t.Parallel()
	e := extendingSettings(t)
	runs := &newRuns{home: e.home}
	runs.take(t)

	want := "process base_ask is a base of child_ask, not work, and is not run"
	if r := agister(t, e.home, e.repo, "run", "base_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run base_ask: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil {
		t.Fatalf("the runtime ran: %v", refused.first)
	}
	// Listed as refused, and not as invalid: it is checked through its
	// process.
	r := agister(t, e.home, e.repo, "process", "list")
	if line := regexp.MustCompile(`(?m)^base_ask\b.*$`).FindString(r.stdout); r.code != 0 || !strings.Contains(line, "REFUSED: "+want) || strings.Contains(line, "invalid") {
		t.Fatalf("process list: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	panel := strings.NewReplacer("name: review_panel", "name: base_panel", "process:adversarial_review", "process:base_ask").
		Replace(read(t, filepath.Join(e.home, "workflows", "review_panel.yaml")))
	write(t, filepath.Join(e.home, "workflows", "base_panel.yaml"), panel)
	problem := "workflow base_panel: fan-out node adversarial: process base_ask is a base of child_ask, not work"
	if r := agister(t, e.home, e.repo, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) || strings.Contains(r.stderr, "does not exist") {
		t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}
	if r := agister(t, e.home, e.repo, "run", "base_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, "workflow base_panel") ||
		!strings.Contains(r.stderr, strings.TrimPrefix(problem, "workflow base_panel: ")) {
		t.Fatalf("run base_panel: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// The nearest layer file that holds the whole process, here a repository's
// copy of home's, says what it extends: another base of its own layer, or
// none. The extends of home's file is not heard, and the record names the
// files the process was composed from.
func TestTheNearestWholeProcessNamesItsBase(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, child string
		// files are the record's layers beyond the two of child_ask.
		files                 func(e extending) []string
		instruction, question string
	}{
		{"another base", strings.Replace(childAsk, "process:base_ask", "process:repo_ask", 1), func(e extending) []string {
			return []string{filepath.Join(e.repo, ".agister", "processes", "repo_ask.yaml")}
		}, "REPOSITORY BASE: answer the question.", "the child's question"},
		{"no base", strings.NewReplacer("name: base_ask", "name: child_ask", "HOME BASE", "REPOSITORY CHILD").Replace(baseAsk) + "prompt: ask\n",
			func(extending) []string { return nil }, "REPOSITORY CHILD: answer the question.", "the base's question"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			e := extendingSettings(t)
			write(t, filepath.Join(e.repo, ".agister", "processes", "repo_ask.yaml"), strings.NewReplacer("name: base_ask", "name: repo_ask", "HOME BASE", "REPOSITORY BASE").Replace(baseAsk))
			write(t, e.repoChild, strings.Replace(c.child, "input:\n  params:\n    question: {default: the child's question}\n", "", 1))
			runs := &newRuns{home: e.home}
			runs.take(t)

			if r := agister(t, e.home, e.repo, "run", "child_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
				t.Fatalf("run child_ask: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			run := runs.one(t)
			argv := strings.Join(run.argv(), " ")
			given, _ := run.first["prompt"].(string)
			if !strings.Contains(argv, c.instruction) || strings.Contains(argv, "HOME BASE") || !strings.Contains(given, c.question) {
				t.Fatalf("run by %v and given:\n%s", run.argv(), given)
			}
			var paths []string
			for _, layer := range definitionOf(t, run, "processes", "child_ask")["layers"].([]any) {
				paths = append(paths, layer.(map[string]any)["path"].(string))
			}
			if want := append([]string{e.repoChild, e.child}, c.files(e)...); strings.Join(paths, " ") != strings.Join(want, " ") {
				t.Fatalf("layers %v, want %v", paths, want)
			}
		})
	}
}

// A process that is broken still names its base in the file that defines
// it, so the base stays a base: a duplicate key there, or a repository
// partial that cannot be read.
func TestABrokenProcessKeepsItsBaseABase(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name    string
		change  func(t *testing.T, e extending)
		problem string
	}{
		{"a duplicate key", func(t *testing.T, e extending) {
			write(t, e.child, childAsk+"prompt: ask\n")
		}, "process child_ask: prompt: is declared more than once"},
		{"an unreadable partial", func(t *testing.T, e extending) {
			if err := os.Symlink(filepath.Join(e.repo, "nowhere.yaml"), e.repoChild); err != nil {
				t.Fatal(err)
			}
		}, "process child_ask: cannot be resolved"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			e := extendingSettings(t)
			if err := os.MkdirAll(filepath.Dir(e.repoChild), 0o755); err != nil {
				t.Fatal(err)
			}
			c.change(t, e)
			if r := agister(t, e.home, e.repo, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, c.problem) {
				t.Fatalf("check: %d, want %q\n%s%s", r.code, c.problem, r.stdout, r.stderr)
			}
			want := "process base_ask is a base of child_ask"
			if r := agister(t, e.home, e.repo, "run", "base_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
				t.Fatalf("run base_ask: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
			}
		})
	}
}

// A block on a base refuses each process that extends it (ADR-018), before
// its runtime starts, and check names them.
func TestABlockOnABaseRefusesItsProcesses(t *testing.T) {
	t.Parallel()
	e := extendingSettings(t)
	path := writeBlocks(t, filepath.Join(e.repo, ".agister"), "{ref: 'process:base_ask'}")
	runs := &newRuns{home: e.home}
	runs.take(t)

	if r := agister(t, e.home, e.repo, "check"); r.code != 0 || !strings.Contains(r.stdout, "block process base_ask: "+path+"\n  refuses process base_ask, process child_ask\n") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	want := "process child_ask: process base_ask is blocked by " + path
	if r := agister(t, e.home, e.repo, "run", "child_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run child_ask: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil {
		t.Fatalf("the runtime ran: %v", refused.first)
	}
}
