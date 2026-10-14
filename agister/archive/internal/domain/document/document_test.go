package document_test

import (
	"errors"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// kinds are every kind of document.
var kinds = []document.Kind{
	document.KindService, document.KindAgent, document.KindProcess, document.KindRuntime,
	document.KindSchema, document.KindWorkflow, document.KindVerify, document.KindPrompt,
	document.KindSkill, document.KindBrief, document.KindWorkspace, document.KindBlocks,
}

// A kind's value is its settings folder's name, and a message names one
// document of it; a singleton is named as its kind.
func TestAKindNamesOneOfItsDocuments(t *testing.T) {
	t.Parallel()
	want := map[document.Kind]string{
		document.KindService:   "service",
		document.KindAgent:     "agent",
		document.KindProcess:   "process",
		document.KindRuntime:   "runtime mapping",
		document.KindSchema:    "schema",
		document.KindWorkflow:  "workflow",
		document.KindVerify:    "verification",
		document.KindPrompt:    "prompt",
		document.KindSkill:     "skill",
		document.KindBrief:     "brief",
		document.KindWorkspace: "workspace",
		document.KindBlocks:    "blocks",
	}
	for _, kind := range kinds {
		if got := kind.Singular(); got != want[kind] {
			t.Errorf("%s: singular %q, want %q", kind, got, want[kind])
		}
	}
}

// ADR-028 rules 4 and 6: the kinds a call reads as fields are composed, and
// the rest are taken whole.
func TestTheComposedKinds(t *testing.T) {
	t.Parallel()
	whole := []document.Kind{document.KindSchema, document.KindPrompt, document.KindSkill, document.KindWorkspace, document.KindBlocks}
	for _, kind := range kinds {
		if got, want := document.Composed(kind), !slices.Contains(whole, kind); got != want {
			t.Errorf("%s: composed %v, want %v", kind, got, want)
		}
	}
}

// ADR-028 rule 5: a problem of a composed document names the layer files
// that set the field at fault, and every layer file read when none does.
func TestAProblemOfAComposedDocumentNamesTheLayerFileAtFault(t *testing.T) {
	t.Parallel()
	const repository, home = "/w/.agister/processes/p.yaml", "/h/processes/p.yaml"
	source := document.Source{Kind: document.KindProcess, Name: "p", Layers: []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"session", "input.values.goal.path", "output"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{"name", "session", "skills"}},
	}}
	for name, c := range map[string]struct{ field, want string }{
		"set in the nearer layer":         {"output", "m (set in " + repository + ")"},
		"set in the farther layer":        {"name", "m (set in " + home + ")"},
		"set in both":                     {"session", "m (set in " + repository + ", " + home + ")"},
		"a map a layer gave a leaf below": {"input.values", "m (set in " + repository + ")"},
		"an item of a list":               {"skills[1]", "m (set in " + home + ")"},
		"a field under a list's item":     {"skills[1].name", "m (set in " + home + ")"},
		"no layer sets it":                {"prompt", "m (no layer sets it: " + repository + ", " + home + ")"},
		// The leaf a layer gave above the field, such as an empty map, sets
		// no field below it.
		"under a leaf a layer gave":          {"output.format", "m (no layer sets it: " + repository + ", " + home + ")"},
		"a field another's name starts with": {"sess", "m (no layer sets it: " + repository + ", " + home + ")"},
		"the document, not a field":          {"", "m"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := source.Attribute(c.field, "m"); got != c.want {
				t.Fatalf("attributed %q, want %q", got, c.want)
			}
		})
	}

	// A document one file holds, and one taken whole, name no layer file:
	// the subject of its problems names its file.
	alone := source
	alone.Layers = source.Layers[:1]
	taken := source
	taken.Kind = document.KindPrompt
	for name, source := range map[string]document.Source{"one file": alone, "taken whole": taken, "no file": {Kind: document.KindProcess}} {
		if got := source.Attribute("session", "m"); got != "m" {
			t.Errorf("%s: attributed %q, want the message alone", name, got)
		}
	}
}

func TestAnInvalidDocumentListsItsProblems(t *testing.T) {
	t.Parallel()
	var err error = &document.InvalidError{Subject: "process p (/h/processes/p.yaml)", Problems: []document.Problem{
		{Message: "future: unknown field", Unknown: true},
		{Message: "prompt: is required"},
	}}
	if want := "process p (/h/processes/p.yaml) is invalid:\n  future: unknown field\n  prompt: is required"; err.Error() != want {
		t.Errorf("error %q, want %q", err.Error(), want)
	}
	var invalid *document.InvalidError
	if !errors.As(err, &invalid) {
		t.Fatalf("%v is no InvalidError", err)
	}
	if want := []string{"future: unknown field", "prompt: is required"}; !reflect.DeepEqual(invalid.Messages(), want) {
		t.Errorf("messages %q, want %q", invalid.Messages(), want)
	}
}
