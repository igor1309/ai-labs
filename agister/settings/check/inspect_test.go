package check_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/check"
)

// inspect.feature, "A listing gives each name of its kind, with what it
// is".
func TestAListingGivesEachNameOfItsKindWithWhatItIs(t *testing.T) {
	t.Parallel()
	for _, kind := range []check.Kind{check.KindProcess, check.KindWorkflow, check.KindAgent} {
		t.Run(string(kind), func(t *testing.T) {
			t.Parallel()
			s := newSpy(t)
			x, y := check.Reference{Kind: kind, Name: "x"}, check.Reference{Kind: kind, Name: "y"}
			s.held = []check.Held{
				{Kind: kind, Name: "y", Layers: []check.Layer{check.LayerProject}},
				{Kind: kind, Name: "x", Layers: []check.Layer{check.LayerHome, check.LayerRepository}},
			}
			s.resolves(x)
			s.refuses([]check.Fault{at(problem("it is broken"), y)}, y)

			got, err := newChecker(t, s).List(kind)

			if err != nil {
				t.Fatal(err)
			}
			want := []check.Listed{
				{Name: "x", Layers: []check.Layer{check.LayerHome, check.LayerRepository}, Resolves: true},
				{Name: "y", Layers: []check.Layer{check.LayerProject}},
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("listed\n got %+v\nwant %+v", got, want)
			}
		})
	}
}

// inspect.feature, "A listing gives no other kind".
func TestAListingGivesNoOtherKind(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(process("p"), check.Reference{Kind: check.KindRuntime, Name: "r"})
	s.resolves(process("p"))

	got, err := newChecker(t, s).List(check.KindProcess)

	if err != nil {
		t.Fatal(err)
	}
	if want := []check.Listed{{Name: "p", Layers: []check.Layer{check.LayerHome}, Resolves: true}}; !reflect.DeepEqual(got, want) {
		t.Errorf("listed\n got %+v\nwant %+v", got, want)
	}
	if want := []check.Reference{process("p")}; !reflect.DeepEqual(s.resolved, want) {
		t.Errorf("asked resolve for %v, want %v", s.resolved, want)
	}
}

// Inspect lists and shows the processes, the workflows and the agents, and
// no document of another kind, asking its ports nothing.
func TestInspectListsAndShowsNoOtherKind(t *testing.T) {
	t.Parallel()
	for _, kind := range []check.Kind{check.KindRuntime, check.KindBrief, check.KindPrompt, check.KindSchema, check.KindSkill} {
		t.Run(string(kind), func(t *testing.T) {
			t.Parallel()
			s := newSpy(t)
			document := check.Reference{Kind: kind, Name: "x"}
			s.hold(document)
			c := newChecker(t, s)

			if _, err := c.List(kind); err == nil {
				t.Errorf("List of the kind %q gave no error", kind)
			}
			if _, err := c.Show(document); err == nil {
				t.Errorf("Show of the %s %q gave no error", kind, "x")
			}
			if len(s.resolved) > 0 || len(s.shown) > 0 {
				t.Errorf("asked resolve for %v and fields of %v, want none", s.resolved, s.shown)
			}
		})
	}
}

// show shows document, which the test expects to be held.
func show(t *testing.T, s *spy, document check.Reference) check.Shown {
	t.Helper()
	got, err := newChecker(t, s).Show(document)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Held {
		t.Errorf("the %s %q shown as not held", document.Kind, document.Name)
	}
	return got
}

// inspect.feature, "A document shown gives each field with its source", in
// the order given.
func TestADocumentShownGivesEachFieldWithItsSource(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(process("p"))
	fields := []check.Field{
		{Place: "prompt", Value: "review", Source: check.Source{File: "home/processes/p.yaml", Line: 2, Layer: check.LayerHome}},
		{Place: "permissions.require[0]", Value: "edit", Source: check.Source{File: ".agister/processes/p.yaml", Line: 4, Layer: check.LayerRepository}},
	}
	s.fields[process("p")] = fields
	s.resolves(process("p"))

	got := show(t, s, process("p"))

	if !reflect.DeepEqual(got.Fields, fields) {
		t.Errorf("fields\n got %+v\nwant %+v", got.Fields, fields)
	}
}

// inspect.feature, "A document shown gives what resolve gives", the plan
// whole (ADR-003, rule 4): what is required, allowed, granted, granted
// beyond the allowed and withheld.
func TestADocumentShownGivesWhatResolveGives(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"))
	fields := []check.Field{{Place: "steps[0].process", Value: "p", Source: check.Source{File: "home/workflows/w.yaml", Line: 3, Layer: check.LayerHome}}}
	s.fields[workflow("w")] = fields
	resolved := check.Resolved{
		Reached: []check.Reference{workflow("w"), process("p"), agent("a")},
		Plans: []check.Plan{{
			Workflow: "w", Place: "steps[0]", Process: "p", Agent: "a", Runtime: "r",
			Options:  []string{"--sandbox"},
			Required: []string{"read"},
			Allowed:  []string{"read", "edit"},
			Granted:  []string{"read", "net"},
			Extra:    []string{"net"},
			Withheld: []string{"edit"},
		}},
		Warnings: []check.Problem{{Place: "steps[0]", Message: "the runtime grants beyond the allowed: net"}},
	}
	s.answers[workflow("w")] = answer{resolved: resolved}

	got := show(t, s, workflow("w"))

	if want := (check.Shown{Held: true, Fields: fields, Resolved: resolved}); !reflect.DeepEqual(got, want) {
		t.Errorf("shown\n got %+v\nwant %+v", got, want)
	}
}

// inspect.feature, "A document refused gives each fault with its chain".
func TestADocumentRefusedGivesEachFaultWithItsChain(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"))
	fields := []check.Field{{Place: "steps[0].agent", Value: "a", Source: check.Source{File: "home/workflows/w.yaml", Line: 4, Layer: check.LayerHome}}}
	s.fields[workflow("w")] = fields
	faults := []check.Fault{{
		Chain: []check.Link{
			{Kind: check.KindWorkflow, Name: "w"},
			{Kind: check.KindAgent, Name: "a", Source: fields[0].Source, Place: "steps[0].agent"},
		},
		Problems: problem("runtime is missing"),
	}}
	s.refuses(faults, workflow("w"))

	got := show(t, s, workflow("w"))

	if want := (check.Shown{Held: true, Fields: fields, Faults: faults}); !reflect.DeepEqual(got, want) {
		t.Errorf("shown\n got %+v\nwant %+v", got, want)
	}
}

// inspect.feature, "A document that does not type is shown with its
// fields".
func TestADocumentThatDoesNotTypeIsShownWithItsFields(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(agent("a"))
	source := check.Source{File: "home/agents/a.yaml", Line: 1, Layer: check.LayerHome}
	fields := []check.Field{{Place: "runtime", Value: "7", Source: source}}
	s.fields[agent("a")] = fields
	faults := []check.Fault{at([]check.Problem{{Source: source, Place: "runtime", Message: "a name is text"}}, agent("a"))}
	s.refuses(faults, agent("a"))

	got := show(t, s, agent("a"))

	if want := (check.Shown{Held: true, Fields: fields, Faults: faults}); !reflect.DeepEqual(got, want) {
		t.Errorf("shown\n got %+v\nwant %+v", got, want)
	}
}

// inspect.feature, "A document no layer holds is shown as not held".
func TestADocumentNoLayerHoldsIsShownAsNotHeld(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(agent("y"), process("z"))

	got, err := newChecker(t, s).Show(agent("z"))

	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, check.Shown{}) {
		t.Errorf("shown %+v, want not held", got)
	}
	if len(s.resolved) > 0 || len(s.shown) > 0 {
		t.Errorf("asked resolve for %v and fields of %v, want none", s.resolved, s.shown)
	}
}
