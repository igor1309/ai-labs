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

// Settings are layered by field (ADR-028), on real settings directories:
// Agister's home, a repository's .agister and the .agister of a directory
// below its root, composed by the layered store as the CLI selects them.

// The process ask as the repository's layer and a project's change it: each
// a partial document, holding only the fields it sets.
const (
	repositoryAsk = "input:\n  instruction: 'REPOSITORY: answer the question.'\n"
	projectAsk    = "uses: agent:reviewer\ninput:\n  params:\n    question: {default: the project's question}\n"
)

// threeLayers is setup with the process ask held by three layers: home's
// whole, the repository's and the project's of <repo>/docs partial. guide
// is a directory below the project's, with no settings of its own.
type threeLayers struct {
	home, repo, docs, guide string
	// The process's file in each layer.
	project, repository, global string
}

func layered(t *testing.T) threeLayers {
	t.Helper()
	home, repo := setup(t, "approve")
	l := threeLayers{home: home, repo: repo, docs: filepath.Join(repo, "docs"), guide: filepath.Join(repo, "docs", "guide")}
	l.global = filepath.Join(home, "processes", "ask.yaml")
	l.repository = filepath.Join(repo, ".agister", "processes", "ask.yaml")
	l.project = filepath.Join(l.docs, ".agister", "processes", "ask.yaml")
	write(t, l.repository, repositoryAsk)
	write(t, l.project, projectAsk)
	write(t, filepath.Join(l.guide, "keep"), "")
	return l
}

// definitionOf is the definition of kind and name a run recorded.
func definitionOf(t *testing.T, r run, kind, name string) map[string]any {
	t.Helper()
	definitions, _ := r.record["definitions"].([]any)
	for _, d := range definitions {
		if d := d.(map[string]any); d["kind"] == kind && d["name"] == name {
			return d
		}
	}
	t.Fatalf("no %s %s among the definitions: %v", kind, name, definitions)
	return nil
}

// ADR-028 rules 1, 3, 4 and 11: a call launched below a directory that
// holds .agister runs the document composed from the project's, the
// repository's and home's files, each field from the nearest layer that
// sets it, and its record names each layer's file with its digest and the
// fields it gave, and each layer's directory. Launched at the root, the
// project's layer has no say, and is not in the record.
func TestACallRunsTheSettingsComposedForItsLaunchDirectory(t *testing.T) {
	t.Parallel()
	l := layered(t)
	runs := &newRuns{home: l.home}
	runs.take(t)

	// The project's default answers the param, the repository's
	// instruction is the one given, and the project's agent runs it.
	if r := agister(t, l.home, l.guide, "run", "ask", "--quiet", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run below the project: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	below := runs.one(t)
	given, _ := below.first["prompt"].(string)
	if !strings.Contains(strings.Join(below.argv(), " "), "REPOSITORY: answer the question.") || !strings.Contains(given, "the project's question") || below.record["agent"] != "reviewer" {
		t.Fatalf("agent %v was run by %v and given:\n%s", below.record["agent"], below.argv(), given)
	}
	want := map[string]any{"kind": "processes", "name": "ask", "layers": []any{
		map[string]any{"layer": "project", "path": l.project, "sha256": digestOf(projectAsk), "fields": []any{"uses", "input.params.question.default"}},
		map[string]any{"layer": "repository", "path": l.repository, "sha256": digestOf(repositoryAsk), "fields": []any{"input.instruction"}},
		map[string]any{"layer": "home", "path": l.global, "sha256": digestOf(read(t, l.global)), "fields": []any{"schema", "name", "type", "policy", "input.values.question.source", "input.values.question.name", "output.format"}},
	}}
	if got := definitionOf(t, below, "processes", "ask"); !reflect.DeepEqual(got, want) {
		t.Fatalf("process recorded as\n%v\nwant\n%v", got, want)
	}
	layers := []any{
		map[string]any{"layer": "project", "dir": filepath.Join(l.docs, ".agister")},
		map[string]any{"layer": "repository", "dir": filepath.Join(l.repo, ".agister")},
		map[string]any{"layer": "home", "dir": l.home},
	}
	if !reflect.DeepEqual(below.record["layers"], layers) {
		t.Fatalf("layers recorded as %v, want %v", below.record["layers"], layers)
	}
	// A document one layer holds is that layer's: one file, every field.
	policy := filepath.Join(l.home, "policies", "read-only.yaml")
	held := homeFile("policies", "read-only", policy, read(t, policy))
	held["layers"].([]any)[0].(map[string]any)["fields"] = []any{"schema", "name", "workspace.access", "workspace.scope", "tools.allow", "timeout"}
	if got := definitionOf(t, below, "policies", "read-only"); !reflect.DeepEqual(got, held) {
		t.Fatalf("policy recorded as %v, want %v", got, held)
	}
	for _, d := range below.record["definitions"].([]any) {
		for _, old := range []string{"path", "sha256", "project", "overrides"} {
			if _, written := d.(map[string]any)[old]; written {
				t.Fatalf("a definition still records %s: %v", old, d)
			}
		}
	}

	// At the root there is no project layer: the param has no default.
	if r := agister(t, l.home, l.repo, "run", "ask", "--quiet", "--timeout", "1m"); r.code == cli.ExitCompleted {
		t.Fatalf("run at the root without the param: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	runs.take(t)
	if r := agister(t, l.home, l.repo, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run at the root: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	root := runs.one(t)
	given, _ = root.first["prompt"].(string)
	if !strings.Contains(strings.Join(root.argv(), " "), "REPOSITORY: answer the question.") || strings.Contains(given, "the project's question") || root.record["agent"] != "assistant" {
		t.Fatalf("at the root, agent %v was run by %v and given:\n%s", root.record["agent"], root.argv(), given)
	}
	files, _ := definitionOf(t, root, "processes", "ask")["layers"].([]any)
	if len(files) != 2 || files[0].(map[string]any)["layer"] != "repository" || files[1].(map[string]any)["layer"] != "home" ||
		!reflect.DeepEqual(files[0].(map[string]any)["fields"], []any{"input.instruction"}) || !reflect.DeepEqual(root.record["layers"], layers[1:]) {
		t.Fatalf("at the root, the process is of %v and the layers are %v", files, root.record["layers"])
	}
}

// ADR-028 rule 5: the composed document is what is checked. A layer's
// partial document is no problem where a farther layer gives the rest, and
// a problem of a field names the layer file that set it; where no layer
// gives a required field, the problem names every file read.
func TestCheckChecksTheComposedDocument(t *testing.T) {
	t.Parallel()
	l := layered(t)
	for _, cwd := range []string{l.repo, l.docs, l.guide} {
		if r := agister(t, l.home, cwd, "check"); r.code != 0 || !strings.Contains(r.stdout, "settings OK") {
			t.Fatalf("check in %s: %d\n%s%s", cwd, r.code, r.stdout, r.stderr)
		}
	}
	if r := agister(t, l.home, l.docs, "check"); !strings.Contains(r.stdout, "override process ask: "+l.project+" overrides "+l.repository+", "+l.global+"\n") {
		t.Fatalf("check in the project names no layers of ask:\n%s%s", r.stdout, r.stderr)
	}

	write(t, l.project, "uses: reviewer\n")
	problem := "process ask: uses: must be \"agent:<name>\" (set in " + l.project + ")"
	if r := agister(t, l.home, l.docs, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) {
		t.Fatalf("check of the project's bad field: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}
	// The repository's composition does not read the project's file.
	if r := agister(t, l.home, l.repo, "check"); r.code != 0 {
		t.Fatalf("check at the root: %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	// A process no layer gives an agent: the two files read are named.
	partial := filepath.Join(l.docs, ".agister", "processes", "partial.yaml")
	rest := filepath.Join(l.repo, ".agister", "processes", "partial.yaml")
	write(t, l.project, projectAsk)
	write(t, partial, "policy: process-policy:read-only\n")
	write(t, rest, "schema: agister.process/v1alpha1\nname: partial\ntype: process\ninput: {instruction: Answer.}\noutput: {format: text}\n")
	problem = "process partial: uses: is required (no layer sets it: " + partial + ", " + rest + ")"
	if r := agister(t, l.home, l.docs, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) {
		t.Fatalf("check of a field no layer sets: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}

	// A layer's file that is not one map breaks the document: home's is
	// not run in its place.
	if err := os.Remove(partial); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(rest); err != nil {
		t.Fatal(err)
	}
	write(t, l.project, "- uses\n")
	if r := agister(t, l.home, l.docs, "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, "process ask") || !strings.Contains(r.stderr, l.project) {
		t.Fatalf("check of a layer file that is a list: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, l.home, l.docs, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitRefused || !strings.Contains(r.stderr, l.project) {
		t.Fatalf("run of a broken document: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// ADR-028 rule 12: process show prints each document's layer files,
// nearest first, by the names home, repository and project, and a fields
// block that says which layer gave each field of a document more than one
// layer holds; --json carries the same. check --tree prints each
// document's layer files, and under each but the farthest the fields it
// gave.
func TestShowAndTheTreeNameEachFieldsLayer(t *testing.T) {
	t.Parallel()
	l := layered(t)
	// A layer file that changes nothing: every field is a farther one's.
	agent := filepath.Join(l.docs, ".agister", "agents", "reviewer.toml")
	write(t, agent, "")

	r := agister(t, l.home, l.guide, "process", "show", "ask")
	sources := "             process ask: project " + l.project + "\n" +
		"                          repository " + l.repository + "\n" +
		"                          home " + l.global + "\n" +
		"             policy read-only: home " + filepath.Join(l.home, "policies", "read-only.yaml") + "\n" +
		"             agent reviewer: project " + agent + "\n" +
		"                             home " + filepath.Join(l.home, "agents", "reviewer.toml") + "\n"
	fields := "fields       service service\n" +
		"               max_attempts         home\n"
	composed := "             process ask\n" +
		"               input.instruction              repository\n" +
		"               input.params.question.default  project\n" +
		"               input.values.question.name     home\n" +
		"               input.values.question.source   home\n" +
		"               name                           home\n" +
		"               output.format                  home\n" +
		"               policy                         home\n" +
		"               schema                         home\n" +
		"               type                           home\n" +
		"               uses                           project\n" +
		"             policy read-only\n"
	// The project's file gave the agent nothing: every field is home's.
	nothing := "             agent reviewer\n" +
		"               command       home\n"
	if r.code != 0 || !strings.Contains(r.stdout, sources) || !strings.Contains(r.stdout, fields) || !strings.Contains(r.stdout, composed) || !strings.Contains(r.stdout, nothing) {
		t.Fatalf("process show: %d, want\n%s%s%s%s\ngot\n%s%s", r.code, sources, fields, composed, nothing, r.stdout, r.stderr)
	}

	var shown struct {
		Sources []struct {
			Kind, Name, Layer, Path string
			Layers                  []contract.DefinitionLayer
		}
	}
	r = agister(t, l.home, l.guide, "process", "show", "ask", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &shown); err != nil || r.code != 0 {
		t.Fatalf("process show --json: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	want := []contract.DefinitionLayer{
		{Layer: "project", Path: l.project, Fields: []string{"uses", "input.params.question.default"}},
		{Layer: "repository", Path: l.repository, Fields: []string{"input.instruction"}},
		{Layer: "home", Path: l.global, Fields: []string{"schema", "name", "type", "policy", "input.values.question.source", "input.values.question.name", "output.format"}},
	}
	found := false
	for _, source := range shown.Sources {
		switch {
		case source.Kind == "processes" && source.Name == "ask":
			found = true
			if source.Layer != "project" || source.Path != l.project || !reflect.DeepEqual(source.Layers, want) {
				t.Fatalf("process in --json = %+v", source)
			}
		case source.Kind == "agents" && source.Name == "reviewer":
			if len(source.Layers) != 2 || source.Layers[0].Layer != "project" || source.Layers[0].Fields == nil || len(source.Layers[0].Fields) != 0 {
				t.Fatalf("agent in --json = %+v", source)
			}
		}
	}
	if !found {
		t.Fatalf("no process among the sources:\n%s", r.stdout)
	}

	r = agister(t, l.home, l.guide, "check", "--tree")
	tree := regexp.MustCompile(`(?m)^process ask +project +` + regexp.QuoteMeta(l.project) + `\n` +
		` +uses, input\.params\.question\.default\n` +
		` +repository ` + regexp.QuoteMeta(l.repository) + `\n` +
		` +input\.instruction\n` +
		` +home +` + regexp.QuoteMeta(l.global) + `\n` +
		`├─ agent reviewer +project +` + regexp.QuoteMeta(agent) + `\n` +
		`│ +\(none\)\n` +
		`│ +home +` + regexp.QuoteMeta(filepath.Join(l.home, "agents", "reviewer.toml")) + `\n` +
		`│  └─ runtime claude-code +home +` + regexp.QuoteMeta(filepath.Join(l.home, "runtimes", "claude-code.yaml")) + `\n` +
		`└─ policy read-only +home +` + regexp.QuoteMeta(filepath.Join(l.home, "policies", "read-only.yaml")) + `\n`)
	if r.code != 0 || !tree.MatchString(r.stdout) {
		t.Fatalf("check --tree: %d, want %s\ngot\n%s%s", r.code, tree, r.stdout, r.stderr)
	}
}

// ADR-028 rule 2: check, process list, process show, workflow list and
// workflow show take --dir, and read the layers of that directory as if
// launched there, as run does; a relative one is resolved against the
// launch directory.
func TestTheReadCommandsTakeTheLaunchDirectory(t *testing.T) {
	t.Parallel()
	l := layered(t)
	write(t, filepath.Join(l.docs, ".agister", "processes", "docs_only.yaml"), strings.Replace(read(t, l.global), "name: ask", "name: docs_only", 1))
	write(t, filepath.Join(l.docs, ".agister", "workflows", "docs_panel.yaml"),
		strings.Replace(read(t, filepath.Join(l.home, "workflows", "review_panel.yaml")), "name: review_panel", "name: docs_panel", 1))

	for _, command := range [][]string{
		{"check"}, {"check", "--tree"}, {"check", "--json"},
		{"process", "list"}, {"process", "show", "ask"}, {"process", "show", "docs_only", "--json"},
		{"workflow", "list"}, {"workflow", "show", "docs_panel"}, {"workflow", "show", "docs_panel", "--json"},
	} {
		there := agister(t, l.home, l.guide, command...)
		if there.code != 0 || !strings.Contains(there.stdout, "docs") {
			t.Fatalf("%v launched there: %d\n%s%s", command, there.code, there.stdout, there.stderr)
		}
		for _, dir := range []string{l.guide, filepath.Join("docs", "guide")} {
			if r := agister(t, l.home, l.repo, append(append([]string{}, command...), "--dir", dir)...); r.code != 0 || r.stdout != there.stdout {
				t.Errorf("%v --dir %s: %d\n%s%s\nwant, as launched there:\n%s", command, dir, r.code, r.stdout, r.stderr, there.stdout)
			}
		}
		if r := agister(t, l.home, l.repo, command...); r.stdout == there.stdout {
			t.Errorf("%v at the root reads the project's layer:\n%s", command, r.stdout)
		}
	}
}

// ADR-028 rule 1: there is no fourth layer. A second .agister between the
// project layer's directory and the root makes the project layer invalid:
// check names the layer, the path and the reason, and every command
// launched there is stopped, a call before its first turn. Launched above
// it, or at the root, the settings are valid and the call runs.
func TestASecondSettingsDirectoryBelowTheProjectsStopsWhatIsLaunchedThere(t *testing.T) {
	t.Parallel()
	l := layered(t)
	inner := filepath.Join(l.guide, ".agister")
	write(t, filepath.Join(inner, "processes", "ask.yaml"), "timeout: 1m\n")
	outer := filepath.Join(l.docs, ".agister")

	problem := "project layer " + inner + ": " + outer + ": a second .agister between " + inner + " and the worktree's root"
	r := agister(t, l.home, l.guide, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) {
		t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}
	var report contract.CheckReport
	r = agister(t, l.home, l.guide, "check", "--json")
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != cli.ExitUsage || len(report.Problems) != 1 || !strings.Contains(report.Problems[0].Message, problem) {
		t.Fatalf("check --json: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	runs := &newRuns{home: l.home}
	runs.take(t)
	for _, args := range [][]string{
		{"run", "ask", "--quiet", "--timeout", "1m"},
		{"run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture=a.txt"},
		{"process", "list"}, {"process", "show", "ask"}, {"workflow", "list"}, {"workflow", "show", "review_panel"},
	} {
		if r := agister(t, l.home, l.guide, args...); r.code == 0 || r.code == cli.ExitCompleted || !strings.Contains(r.stderr, "stop every command") {
			t.Fatalf("%v: %d\n%s%s", args, r.code, r.stdout, r.stderr)
		}
		// From the root, --dir names the same layers.
		if r := agister(t, l.home, l.repo, append(append([]string{}, args...), "--dir", l.guide)...); r.code == 0 || r.code == cli.ExitCompleted || !strings.Contains(r.stderr, "stop every command") {
			t.Fatalf("%v --dir: %d\n%s%s", args, r.code, r.stdout, r.stderr)
		}
	}
	for _, ran := range runs.take(t) {
		if ran.first != nil {
			t.Fatalf("the runtime started: %v", ran.record)
		}
	}

	for _, cwd := range []string{l.docs, l.repo} {
		if r := agister(t, l.home, cwd, "check"); r.code != 0 {
			t.Fatalf("check in %s: %d\n%s%s", cwd, r.code, r.stdout, r.stderr)
		}
		if r := agister(t, l.home, cwd, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
			t.Fatalf("run in %s: %d\n%s%s", cwd, r.code, r.stdout, r.stderr)
		}
	}
}

// ADR-028 rule 7: blocks.yaml is the repository layer's alone. One in a
// project layer makes that layer invalid, so what is launched there is
// stopped, and it is not read: what it lists is blocked nowhere.
func TestBlocksInAProjectLayerStopWhatIsLaunchedThere(t *testing.T) {
	t.Parallel()
	l := layered(t)
	blocks := filepath.Join(l.docs, ".agister", "blocks.yaml")
	write(t, blocks, "schema: agister.blocks/v1alpha1\nblocks:\n  - {ref: agent:assistant, reason: The project's block}\n")

	problem := "project layer " + filepath.Join(l.docs, ".agister") + ": " + blocks + ": a project layer holds no blocks.yaml"
	r := agister(t, l.home, l.guide, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) || strings.Contains(r.stdout+r.stderr, "The project's block") {
		t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}
	if r := agister(t, l.home, l.guide, "run", "ask", "--quiet", "--timeout", "1m"); r.code == 0 || r.code == cli.ExitCompleted || !strings.Contains(r.stderr, "stop every command") {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, l.home, l.repo, "check"); r.code != 0 || strings.Contains(r.stdout, "block ") {
		t.Fatalf("check at the root: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if r := agister(t, l.home, l.repo, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m"); r.code != cli.ExitCompleted {
		t.Fatalf("run at the root: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// ADR-028 rule 10: a workflow's nodes resolve against the run's layers,
// the launch directory's, wherever each node's own checkout is: each
// node's call runs the document composed with the project's fields, and
// records the run's layers.
func TestAWorkflowsNodesResolveAgainstTheRunsLayers(t *testing.T) {
	t.Parallel()
	l := layered(t)
	const partial = "input:\n  instruction: 'PROJECT: review the candidate.'\n"
	project := filepath.Join(l.docs, ".agister", "processes", "adversarial_review.yaml")
	write(t, project, partial)
	runs := &newRuns{home: l.home}
	runs.take(t)

	r := agister(t, l.home, l.docs, "run", "review_panel", "--quiet", "--param", "base=main", "--param", "architecture="+filepath.Join(l.repo, "a.txt"))
	if r.code != cli.ExitCompleted {
		t.Fatalf("workflow: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	layers := []any{
		map[string]any{"layer": "project", "dir": filepath.Join(l.docs, ".agister")},
		map[string]any{"layer": "repository", "dir": filepath.Join(l.repo, ".agister")},
		map[string]any{"layer": "home", "dir": l.home},
	}
	recorded := runs.take(t)
	if len(recorded) != 4 {
		t.Fatalf("%d runs recorded, want the workflow's and its three nodes'", len(recorded))
	}
	var node *run
	for i, one := range recorded {
		if !reflect.DeepEqual(one.record["layers"], layers) {
			t.Errorf("run of %v records the layers %v, want %v", one.record["process"], one.record["layers"], layers)
		}
		if one.record["process"] == "adversarial_review" {
			node = &recorded[i]
		}
	}
	if node == nil {
		t.Fatal("no run of the node adversarial")
	}
	if !strings.Contains(strings.Join(node.argv(), " "), "PROJECT: review the candidate.") {
		t.Fatalf("the node was run by %v", node.argv())
	}
	nearest := nearest(definitionOf(t, *node, "processes", "adversarial_review"))
	want := map[string]any{"layer": "project", "path": project, "sha256": digestOf(partial), "fields": []any{"input.instruction"}}
	if !reflect.DeepEqual(nearest, want) {
		t.Fatalf("the node's process is recorded from %v, want %v", nearest, want)
	}
	// A document taken whole (rule 6) has one layer and no fields.
	schema := filepath.Join(l.home, "schemas", "review-result.json")
	if got := definitionOf(t, *node, "schemas", "review-result"); !reflect.DeepEqual(got, homeFile("schemas", "review-result", schema, read(t, schema))) {
		t.Fatalf("the node's schema is recorded as %v", got)
	}
}
