package app_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// unreadAnswers are the ways the definitions fail to give a document, by
// the name of the document they fail on: a failure of the read itself, and
// layers that do not compose, which fail with the error a parse fails with.
func unreadAnswers() map[string]error {
	return map[string]error{
		"denied":     errors.New("permission denied"),
		"uncomposed": &document.InvalidError{Subject: "layers of uncomposed", Problems: []document.Problem{{Message: "cannot be composed"}}},
	}
}

// listedSettings are definitions that list, of kind, the documents no read
// gives, then the valid one named held, then one named broken that does
// not parse.
func listedSettings(t *testing.T, kind document.Kind, held string) *answeredDefinitions {
	t.Helper()
	of := func(name string) checkedDocument {
		return checkedDocument{ref: app.DocumentRef{Kind: kind, Name: name}}
	}
	definitions := &answeredDefinitions{
		t:     t,
		names: map[document.Kind][]string{kind: {"denied", "uncomposed", held, "broken"}},
		read: map[app.DocumentRef]portAnswer{
			of(held).ref:     {doc: of(held).held(settingsDocs()[kind][held])},
			of("broken").ref: {doc: of("broken").held(unparsed)},
		},
	}
	for name, err := range unreadAnswers() {
		definitions.read[of(name).ref] = portAnswer{doc: document.Document{Source: of(name).looked()}, err: err}
	}
	return definitions
}

// A listing lists every name the settings list, in their order: a document
// no read gives with the read's failure, whatever the failure, one that
// does not parse as invalid, and neither dropped.
func TestAListingTellsADocumentNotReadFromOneThatDoesNotParse(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	type entry struct{ name, problem string }
	for name, c := range map[string]struct {
		kind document.Kind
		held string
		list func(*app.Settings) ([]entry, error)
	}{
		"agents": {kind: document.KindAgent, held: "a", list: func(settings *app.Settings) (entries []entry, err error) {
			agents, err := settings.ListAgents(ctx)
			for _, agent := range agents {
				entries = append(entries, entry{agent.Name, agent.Problem})
			}
			return entries, err
		}},
		"processes": {kind: document.KindProcess, held: "p", list: func(settings *app.Settings) (entries []entry, err error) {
			processes, err := settings.ListProcesses(ctx)
			for _, process := range processes {
				entries = append(entries, entry{process.Name, process.Problem})
			}
			return entries, err
		}},
		"workflows": {kind: document.KindWorkflow, held: "p_a", list: func(settings *app.Settings) (entries []entry, err error) {
			workflows, err := settings.ListWorkflows(ctx)
			for _, workflow := range workflows {
				entries = append(entries, entry{workflow.Name, workflow.Problem})
			}
			return entries, err
		}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			settings := app.NewSettings(listedSettings(t, c.kind, c.held), &writerSpy{}, nil, nil, settingsCheckStub{})
			got, err := c.list(settings)
			if err != nil {
				t.Fatal(err)
			}
			want := []entry{
				{"denied", "unreadable: permission denied (run `agister check`)"},
				{"uncomposed", "unreadable: " + unreadAnswers()["uncomposed"].Error() + " (run `agister check`)"},
				{c.held, ""},
				{"broken", "invalid (run `agister check`)"},
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("listed = %q, want %q", got, want)
			}
		})
	}
}

// An agent on a runtime mapping no read gives is refused for a runtime the
// settings do not have, whatever the read's failure; one on a mapping that
// does not parse is refused with the mapping's problems, counting what
// they name that this code does not know. Neither is written.
func TestCreateAgentTellsAMappingNotReadFromOneThatDoesNotParse(t *testing.T) {
	t.Parallel()
	definitions := listedSettings(t, document.KindRuntime, "rt")
	newer := checkedDocument{ref: app.DocumentRef{Kind: document.KindRuntime, Name: "newer"}}
	definitions.read[newer.ref] = portAnswer{doc: newer.held(settingsDocs()[document.KindRuntime]["rt"] + "isolation: strict\n")}
	_, parseErr := definition.ParseMapping(definitions.read[newer.ref].doc)
	if parseErr == nil {
		t.Fatal("the newer mapping is valid")
	}
	const available = " (available: denied, uncomposed, rt, broken)"
	for runtime, want := range map[string]contract.InputError{
		"denied":     {Message: `unknown runtime "denied"` + available},
		"uncomposed": {Message: `unknown runtime "uncomposed"` + available},
		"newer":      {Message: parseErr.Error(), Unknown: 1},
	} {
		t.Run(runtime, func(t *testing.T) {
			t.Parallel()
			writer := &writerSpy{}
			settings := app.NewSettings(definitions, writer, nil, nil, settingsCheckStub{})
			_, err := createNow(settings, contract.Agent{Name: "b", Runtime: runtime}, false)
			var input *contract.InputError
			if !errors.As(err, &input) || !reflect.DeepEqual(*input, want) {
				t.Fatalf("refusal = %#v, want %#v", err, want)
			}
			if len(writer.writes) != 0 {
				t.Fatalf("a refused agent was written: %v", writer.writes)
			}
		})
	}
}
