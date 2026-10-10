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

// A process may extend one base process (ADR-030 rule 9), on temp settings:
// home's, and a repository's .agister over it.

// baseAsk is a base: it leaves out the prompt, which the process that
// extends it sets.
const baseAsk = `schema: agister.process/v1alpha1
name: base_ask
type: process
uses: agent:assistant
timeout: 10m
tools: {allow: [repository.read, repository.diff, repository.search, repository.history.read, process.execute, host.read]}
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
// whose own home file still wins over it, and the repository's partial of
// the process wins over both. The record names the process, and the base's
// files among the layers it was composed from. check passes though the
// base has no prompt: it is checked through its process.
func TestAProcessRunsOverItsBaseAsItsLayersComposeIt(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name string
		// child is the repository's partial of child_ask; none where "".
		child string
		// instruction and question are what the runtime is given, and
		// left what it is not.
		instruction, question string
		left                  []string
		layers                func(e extending) []string
	}{
		{"the base's partial", "", "REPOSITORY BASE: answer the question.", "the child's question",
			[]string{"HOME BASE", "the repository base's question"},
			func(e extending) []string { return []string{e.child, e.repoBase, e.base} }},
		{"the process's partial over it", "input:\n  instruction: 'REPOSITORY CHILD: answer the question.'\n  params:\n    question: {default: the repository child's question}\n",
			"REPOSITORY CHILD: answer the question.", "the repository child's question",
			[]string{"HOME BASE", "REPOSITORY BASE", "the repository base's question", "the child's question"},
			func(e extending) []string { return []string{e.repoChild, e.child, e.repoBase, e.base} }},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			e := extendingSettings(t)
			write(t, e.repoBase, "input:\n  instruction: 'REPOSITORY BASE: answer the question.'\n  params:\n    question: {default: the repository base's question}\n")
			if c.child != "" {
				write(t, e.repoChild, c.child)
			}
			runs := &newRuns{home: e.home}
			runs.take(t)

			if r := agister(t, e.home, e.repo, "check"); r.code != 0 || !strings.Contains(r.stdout, "settings OK") {
				t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			if r := agister(t, e.home, e.repo, "run", "child_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
				t.Fatalf("run child_ask: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			run := runs.one(t)
			argv := strings.Join(run.argv(), " ")
			given, _ := run.first["prompt"].(string)
			if run.record["process"] != "child_ask" || run.record["agent"] != "assistant" ||
				!strings.Contains(argv, c.instruction) || !strings.Contains(given, c.question) ||
				!strings.Contains(given, read(t, filepath.Join(e.home, "prompts", "ask.md"))) {
				t.Fatalf("process %v on agent %v was run by %v and given:\n%s", run.record["process"], run.record["agent"], run.argv(), given)
			}
			for _, left := range c.left {
				if strings.Contains(argv, left) || strings.Contains(given, left) {
					t.Fatalf("run by %v and given %q:\n%s", run.argv(), left, given)
				}
			}
			var paths []string
			for _, layer := range definitionOf(t, run, "processes", "child_ask")["layers"].([]any) {
				paths = append(paths, layer.(map[string]any)["path"].(string))
			}
			if want := c.layers(e); strings.Join(paths, " ") != strings.Join(want, " ") {
				t.Fatalf("layers %v, want %v", paths, want)
			}
		})
	}
}

// Each field's origin names the process whose layer file gave it (ADR-030
// rule 9): the base for a field it gave, in its own files, and the process
// for its own, in process show --json, in process show's text, in check
// --tree and in the record's definitions.
func TestEachFieldNamesTheProcessWhoseFileGaveIt(t *testing.T) {
	t.Parallel()
	e := extendingSettings(t)
	write(t, e.repoBase, "input:\n  instruction: 'REPOSITORY BASE: answer the question.'\n")
	want := []contract.DefinitionLayer{
		{Layer: "home", Path: e.child, Process: "child_ask", Fields: []string{"schema", "name", "type", "extends", "prompt", "input.params.question.default"}},
		{Layer: "repository", Path: e.repoBase, Process: "base_ask", Fields: []string{"input.instruction"}},
		{Layer: "home", Path: e.base, Process: "base_ask", Fields: []string{"uses", "timeout", "tools.allow", "input.values.question.source", "input.values.question.name", "output.format"}},
	}

	var shown struct {
		Sources []struct {
			Kind, Name string
			Layers     []contract.DefinitionLayer
		}
	}
	r := agister(t, e.home, e.repo, "process", "show", "child_ask", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &shown); err != nil || r.code != 0 {
		t.Fatalf("process show --json: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	found := false
	for _, source := range shown.Sources {
		if source.Kind == "processes" && source.Name == "child_ask" {
			found = true
			if !reflect.DeepEqual(source.Layers, want) {
				t.Fatalf("process show --json layers\n%+v\nwant\n%+v", source.Layers, want)
			}
		}
	}
	if !found {
		t.Fatalf("no process child_ask among the sources:\n%s", r.stdout)
	}

	r = agister(t, e.home, e.repo, "process", "show", "child_ask")
	sources := "process child_ask: home " + e.child + "\n" +
		"                                repository " + e.repoBase + " (base base_ask)\n" +
		"                                home " + e.base + " (base base_ask)\n"
	fields := "               input.instruction              repository (base base_ask)\n" +
		"               input.params.question.default  home\n" +
		"               input.values.question.name     home (base base_ask)\n"
	if r.code != 0 || !strings.Contains(r.stdout, sources) || !strings.Contains(r.stdout, fields) {
		t.Fatalf("process show: %d, want\n%s%s\ngot\n%s%s", r.code, sources, fields, r.stdout, r.stderr)
	}
	r = agister(t, e.home, e.repo, "check", "--tree")
	tree := regexp.MustCompile(`(?m)^process child_ask +home +` + regexp.QuoteMeta(e.child) + `\n` +
		` +schema, name, type, extends, prompt, input\.params\.question\.default\n` +
		` +repository ` + regexp.QuoteMeta(e.repoBase) + ` \(base base_ask\)\n` +
		` +input\.instruction\n` +
		` +home +` + regexp.QuoteMeta(e.base) + ` \(base base_ask\)\n`)
	if r.code != 0 || !tree.MatchString(r.stdout) {
		t.Fatalf("check --tree: %d, want %s\ngot\n%s%s", r.code, tree, r.stdout, r.stderr)
	}

	runs := &newRuns{home: e.home}
	runs.take(t)
	if r := agister(t, e.home, e.repo, "run", "child_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run child_ask: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	var recorded []contract.DefinitionLayer
	for _, layer := range definitionOf(t, runs.one(t), "processes", "child_ask")["layers"].([]any) {
		layer := layer.(map[string]any)
		one := contract.DefinitionLayer{Layer: layer["layer"].(string), Path: layer["path"].(string)}
		one.Process, _ = layer["process"].(string)
		for _, field := range layer["fields"].([]any) {
			one.Fields = append(one.Fields, field.(string))
		}
		recorded = append(recorded, one)
	}
	if !reflect.DeepEqual(recorded, want) {
		t.Fatalf("the record's layers\n%+v\nwant\n%+v", recorded, want)
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
		// A file is whole by what it sets, not by a header: one that
		// leaves out what its base does not give is a partial, the
		// farthest too, and says nothing of a base.
		{"the base's name is not taken", func(e extending) {
			write(t, e.child, strings.Replace(childAsk, "name: child_ask\n", "", 1))
		}, "process child_ask: extends: is set in HOME_CHILD, which leaves out name even over the base it names, and so is a layer's partial"},
		{"a process that is not whole over its base names none", func(e extending) {
			write(t, e.child, strings.Replace(childAsk, "prompt: ask\n", "", 1))
		}, "process child_ask: extends: is set in HOME_CHILD, which leaves out prompt even over the base it names, and so is a layer's partial"},
		{"a layer's partial with a header cannot set extends", func(e extending) {
			write(t, e.repoChild, "schema: agister.process/v1alpha1\nname: child_ask\ntype: process\nextends: process:base_ask\n")
		}, "process child_ask: extends: is set in REPO_CHILD, a layer's partial: only the nearest file that holds the whole process, HOME_CHILD, names its base"},
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
		// A file that names a base and does not compose is not read whole
		// in its place: its last uses would run it without the base.
		{"a duplicate key does not hide a missing base", func(e extending) {
			write(t, e.child, strings.Replace(childAsk, "process:base_ask", "process:gone", 1)+"uses: agent:assistant\nuses: agent:assistant\n")
		}, "process child_ask: HOME_CHILD: uses: is declared more than once"},
		{"extends is named once", func(e extending) {
			write(t, e.child, childAsk+"uses: agent:assistant\nextends: process:base_ask\n")
		}, "process child_ask: HOME_CHILD: extends: is declared more than once"},
		{"a duplicate key does not hide a base's base", func(e extending) {
			write(t, filepath.Join(e.home, "processes", "root_ask.yaml"), strings.Replace(baseAsk, "name: base_ask", "name: root_ask", 1))
			write(t, e.base, baseAsk+"extends: process:root_ask\n")
			write(t, e.child, childAsk+"uses: agent:assistant\nstatus: draft\nstatus: ready\n")
		}, "process child_ask: HOME_CHILD: status: is declared more than once"},
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
// copy of home's or a file that is whole over its base, says what it
// extends: another base of its own layer, or none. The extends of home's file is not heard, and the record names the
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
		// Whole by what it sets over its base, with no header.
		{"another base, by a file with no header", "name: child_ask\nextends: process:repo_ask\nprompt: ask\n", func(e extending) []string {
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
		// The file that names a base and does not compose says so, by
		// its path, before it is parsed.
		{"a duplicate key", func(t *testing.T, e extending) {
			write(t, e.child, childAsk+"prompt: ask\n")
		}, "process child_ask: HOME_CHILD: prompt: is declared more than once"},
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
			problem := strings.NewReplacer("HOME_CHILD", e.child).Replace(c.problem)
			if r := agister(t, e.home, e.repo, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) {
				t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
			}
			want := "process base_ask is a base of child_ask"
			if r := agister(t, e.home, e.repo, "run", "base_ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
				t.Fatalf("run base_ask: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
			}
		})
	}
}

// A block on a base refuses each process that extends it (ADR-018), here
// two, before either runtime starts, and check names them.
func TestABlockOnABaseRefusesItsProcesses(t *testing.T) {
	t.Parallel()
	e := extendingSettings(t)
	write(t, filepath.Join(e.home, "processes", "other_ask.yaml"), strings.Replace(childAsk, "name: child_ask", "name: other_ask", 1))
	path := writeBlocks(t, filepath.Join(e.repo, ".agister"), "{ref: 'process:base_ask'}")
	runs := &newRuns{home: e.home}
	runs.take(t)

	if r := agister(t, e.home, e.repo, "check"); r.code != 0 || !strings.Contains(r.stdout, "block process base_ask: "+path+"\n  refuses process base_ask, process child_ask, process other_ask\n") {
		t.Fatalf("check: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	for _, name := range []string{"child_ask", "other_ask"} {
		want := "process " + name + ": process base_ask is blocked by " + path
		if r := agister(t, e.home, e.repo, "run", name, "--quiet", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
			t.Fatalf("run %s: %d, want %q\n%s%s", name, r.code, want, r.stdout, r.stderr)
		}
		if refused := runs.one(t); refused.record["process"] != name || refused.first != nil {
			t.Fatalf("run %s: the runtime ran, or another was recorded: %v %v", name, refused.record["process"], refused.first)
		}
	}
}
