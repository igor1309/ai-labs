package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

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
