package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// briefForm parses the brief form name of the settings folder dir.
func briefForm(t *testing.T, dir, name string) (definition.Brief, []byte) {
	t.Helper()
	path := filepath.Join(dir, "briefs", name+".yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	brief, err := definition.ParseBrief(definition.Document{Source: definition.Source{Kind: definition.KindBrief, Name: name, Path: path}, Bytes: data})
	if err != nil {
		t.Fatal(err)
	}
	return brief, data
}

// The repository and the examples ship the same two forms (ADR-026 rules 3
// and 4): the goal, whose Intent, Done when, Out of scope and Open are
// required, and the step brief, whose Goal refers to the goal file and
// whose Goal, Covers and Open are required. Open reads None. in both.
func TestTheRepositoryShipsTheGoalAndStepForms(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][]definition.BriefPart{
		"goal": {
			{Heading: "## Intent", Required: true},
			{Heading: "## Done when", Required: true},
			{Heading: "## Expected behaviour"},
			{Heading: "## Out of scope", Required: true},
			{Heading: "## Sources"},
			{Heading: "## Decisions"},
			{Heading: "## Open", Required: true, Reads: "None."},
		},
		"step": {
			{Heading: "## Goal", Required: true, Reference: definition.ReferenceFile},
			{Heading: "## Covers", Required: true},
			{Heading: "## Acts on"},
			{Heading: "## Constraints"},
			{Heading: "## Open", Required: true, Reads: "None."},
		},
	}
	for name, parts := range want {
		repo, repoBytes := briefForm(t, filepath.Join(root, ".agister"), name)
		example, exampleBytes := briefForm(t, filepath.Join(root, "agister", "examples", "settings"), name)
		if !reflect.DeepEqual(repo.Parts, parts) {
			t.Errorf("%s: parts = %+v, want %+v", name, repo.Parts, parts)
		}
		if string(repoBytes) != string(exampleBytes) {
			t.Errorf("%s: the repository's form is not the example's", name)
		}
		if example.Template != repo.Template {
			t.Errorf("%s: the templates differ", name)
		}
	}
}

// A step brief's Goal refers to a file, which the composition looks up
// relative to the caller's directory (ADR-026 rule 8): a brief whose goal
// exists runs, and one whose goal does not is refused before the agent
// starts, naming the input, the form and the part.
func TestAStepBriefsGoalIsLookedUpThroughTheComposition(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	shipped, err := os.ReadFile(filepath.Join("..", "..", "examples", "settings", "briefs", "step.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(home, "briefs", "step.yaml"), string(shipped))
	write(t, filepath.Join(home, "processes", "briefed.yaml"), strings.Replace(briefedProcess,
		`{source: file, path: "${param.brief}"}`, `{source: file, path: "${param.brief}", form: [step]}`, 1))
	write(t, filepath.Join(repo, "goals", "g.md"), "# The goal\n")
	brief := func(goal string) string {
		return "## Goal\n\n`" + goal + "`\n\n## Covers\n\n- 1\n\n## Open\n\nNone.\n"
	}
	write(t, filepath.Join(repo, "briefs", "found.md"), brief("goals/g.md"))
	write(t, filepath.Join(repo, "briefs", "lost.md"), brief("goals/lost.md"))
	runs := &newRuns{home: home}
	runs.take(t)

	briefed(t, home, repo, runs, "briefs/found.md")

	r := agister(t, home, repo, "run", "briefed", "--quiet", "--timeout", "1m", "--param", "brief=briefs/lost.md")
	want := `input brief: does not have its form step: part "## Goal": file goals/lost.md does not exist`
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, want) {
		t.Fatalf("run: %d, want %q\n%s%s", r.code, want, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil {
		t.Fatalf("the refused call reached the runtime: %v", refused.first)
	}
}
