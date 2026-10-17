package main

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
)

// inputsSettings are the settings of inputs.feature: home's as shipped,
// with the repository's bash process "say" of the script echo "$what",
// its input "what" declared as what; then the files of more, by path.
func inputsSettings(t *testing.T, what string, more map[string]string) map[string]string {
	t.Helper()
	settings := shippedHome(t)
	settings["/r/.agister/processes/say.yaml"] = "schema: agister.process/v1alpha1\nprompt: say\ninputs:\n  what: " + what + "\n"
	settings["/r/.agister/prompts/say.md"] = `echo "$what"`
	maps.Copy(settings, more)
	return settings
}

// refusedRun checks that got printed the result, failed, class "refused",
// its reason reason, and exited 1, and that bash ran nothing.
func refusedRun(t *testing.T, f *runFixture, got ran, reason string) {
	t.Helper()
	if got.code != 1 || got.stderr != "" {
		t.Errorf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
	p := printedOf(t, got)
	if p.Status != "failed" || p.Class == nil || *p.Class != "refused" {
		t.Errorf("printed %+v, want failed, class refused", p)
	}
	if p.Reason == nil || *p.Reason != reason {
		t.Errorf("reason %v, want %q", p.Reason, reason)
	}
	if ran := f.runtimes.bash.ran(); len(ran) > 0 {
		t.Errorf("bash ran %+v, want nothing", ran)
	}
}

// inputs.feature, "Each source gives its value". Git's sources run in the
// worktree's root, "/r", and a relative path is the launch directory's.
//
// Contract test: the files home holds, as Agister ships them.
func TestEachSourceGivesItsValue(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, what string
		files      map[string]string
		commits    map[string]string
		changed    map[string][]string
		value      string
	}{
		{"a file relative to the launch directory", "{source: file, path: b.md}",
			map[string]string{"/r/a/b.md": "hi"}, nil, nil, "hi"},
		{"a revision's commit", "{source: git.revision, rev: main}",
			nil, map[string]string{"main": "c1"}, nil, "c1"},
		{"a file at an absolute path", "{source: file, path: /t/b.md}",
			map[string]string{"/t/b.md": "hi"}, nil, nil, "hi"},
		{"the files changed", "{source: git.changed_files, base: m, head: h}",
			nil, nil, map[string][]string{"m..h": {"a.go", "b.go"}}, "a.go\nb.go"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(t, inputsSettings(t, c.what, nil), echoes)
			f.sources.files, f.sources.commits, f.sources.changed = c.files, c.commits, c.changed
			got := f.run(t, "/r/a", "run", "--process", "say", "--agent", "bash")
			if got.code != 0 {
				t.Fatalf("ran %+v, want exit 0", got)
			}
			if want := []bash.Turn{bashTurn(`echo "$what"`, "what="+c.value)}; !reflect.DeepEqual(f.runtimes.bash.ran(), want) {
				t.Errorf("bash ran %+v, want %+v", f.runtimes.bash.ran(), want)
			}
		})
	}
}

// inputs.feature, "A source that cannot give its value refuses the run".
//
// Contract test: the files home holds, as Agister ships them.
func TestASourceThatCannotGiveItsValueRefusesTheRun(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, what string
		gitErr     error
		reason     string
	}{
		{"a file that does not exist", "{source: file, path: b.md}", nil,
			`input "what": the file "/r/b.md" does not exist`},
		{"a revision that names no commit", "{source: git.revision, rev: nope}", errors.New("fatal: Needed a single revision"),
			`input "what": fatal: Needed a single revision`},
		{"nothing changed", "{source: git.changed_files, base: m, head: h}", nil,
			`input "what": nothing changed from "m" to "h"`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(t, inputsSettings(t, c.what, nil), nil)
			f.sources.gitErr = c.gitErr
			refusedRun(t, f, f.run(t, "/r", "run", "--process", "say", "--agent", "bash"), c.reason)
		})
	}
}

// stepBrief is a brief of home's form "step", its goal naming "g.md".
const stepBrief = "# x step 1: y\n\n## Goal\n\n`g.md`\n\n## Covers\n\n- 1\n\n## Open\n\nNone.\n"

// inputs.feature, "A brief form is the snapshot's brief document of its
// name": the path its goal names is the launch directory's.
//
// Contract test: the files home holds, as Agister ships them.
func TestABriefFormIsTheSnapshotsBriefDocumentOfItsName(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, inputsSettings(t, "{source: file, path: b.md, form: [step]}", nil), echoes)
	f.sources.files = map[string]string{"/r/a/b.md": stepBrief}
	f.sources.exist = []string{"/r/a/g.md"}
	got := f.run(t, "/r/a", "run", "--process", "say", "--agent", "bash")
	if got.code != 0 {
		t.Fatalf("ran %+v, want exit 0", got)
	}
	if want := []bash.Turn{bashTurn(`echo "$what"`, "what="+stepBrief)}; !reflect.DeepEqual(f.runtimes.bash.ran(), want) {
		t.Errorf("bash ran %+v, want %+v", f.runtimes.bash.ran(), want)
	}
	if asked := f.sources.askedOf(); !slices.Contains(asked, "exists /r/a/g.md") {
		t.Errorf("asked %q, want whether /r/a/g.md exists", asked)
	}
}

// inputs.feature, "A brief that takes no form refuses the run".
//
// Contract test: the files home holds, as Agister ships them.
func TestABriefThatTakesNoFormRefusesTheRun(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, inputsSettings(t, "{source: file, path: b.md, form: [step]}", nil), nil)
	f.sources.files = map[string]string{"/r/b.md": "x"}
	refusedRun(t, f, f.run(t, "/r", "run", "--process", "say", "--agent", "bash"),
		`input "what": it takes none of its forms: "step": part "## Goal" is missing, part "## Covers" is missing, part "## Open" is missing`)
}

// inputs.feature, "A workflow's input that cannot be resolved ends the run
// saying why".
//
// Contract test: the files home holds, as Agister ships them.
func TestAWorkflowsInputThatCannotBeResolvedEndsTheRunSayingWhy(t *testing.T) {
	t.Parallel()
	settings := inputsSettings(t, "{source: param, name: what}", map[string]string{
		"/r/.agister/workflows/w.yaml": `schema: agister.workflow/v1alpha1
inputs:
  goal: {source: file, path: g.md}
steps:
  - {name: say, process: say, agent: bash, inputs: {what: {from: inputs.goal}}}
`,
	})
	settings["/r/.agister/processes/say.yaml"] += "params:\n  what: {}\n"
	f := newRunFixture(t, settings, nil)
	refusedRun(t, f, f.run(t, "/r", "run", "w"), `input "goal": the file "/r/g.md" does not exist`)
}

// fileTextsFailing is files failing to read every file with err.
type fileTextsFailing struct{ err error }

func (f fileTextsFailing) Bytes(string) ([]byte, error) { return nil, f.err }

// Each source refuses an input whose arguments name none of what it reads,
// a file files cannot read is the input's error, saying which, and a
// revision's commit is its identity too.
func TestTheSourcesRefuseWhatTheyCannotRead(t *testing.T) {
	t.Parallel()
	spy := &sourcesSpy{root: "/r", commits: map[string]string{"main": "c1"}}
	plugged := spy.sourcing().sources("/r/a", "/r")
	cases := []struct {
		source    inputs.Source
		arguments map[string]string
		want      string
	}{
		{plugged["file"], nil, `the source "file" names no path`},
		{plugged["git.revision"], nil, `the source "git.revision" names no rev`},
		{plugged["git.changed_files"], map[string]string{"head": "h"}, `the source "git.changed_files" names no base`},
		{plugged["git.changed_files"], map[string]string{"base": "m"}, `the source "git.changed_files" names no head`},
		{fileSource{texts: fileTextsFailing{err: errors.New("denied")}, launch: "/r/a"}, map[string]string{"path": "b.md"},
			`the file "/r/a/b.md": denied`},
	}
	for _, c := range cases {
		if _, err := c.source.Value(context.Background(), c.arguments, nil); err == nil || err.Error() != c.want {
			t.Errorf("%T of %v: %v, want %q", c.source, c.arguments, err, c.want)
		}
	}
	got, err := plugged["git.revision"].Value(context.Background(), map[string]string{"rev": "main"}, nil)
	if want := (inputs.Fixed{Value: "c1", Identity: "c1"}); err != nil || got != want {
		t.Errorf("the revision main: %+v, %v; want %+v", got, err, want)
	}
}
