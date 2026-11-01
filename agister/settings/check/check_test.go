package check_test

import (
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/check"
)

// spy is a spy of check's ports: the documents held, the answers of
// resolve and the fields its test gives, and nothing else. A document it
// is asked for that its test does not answer fails the test. It keeps
// what it is asked, in order. It gives a copy of each answer, so a result
// that changes what it was given does not change the test's expectation
// with it.
type spy struct {
	t    *testing.T
	held []check.Held
	// none are the problems of no document.
	none     []check.Problem
	answers  map[check.Reference]answer
	fields   map[check.Reference][]check.Field
	resolved []check.Reference
	// problems is how many times the problems of no document were asked.
	problems int
	shown    []check.Reference
}

// answer is what resolve gives for one document.
type answer struct {
	resolved check.Resolved
	faults   []check.Fault
}

func newSpy(t *testing.T) *spy {
	return &spy{t: t, answers: map[check.Reference]answer{}, fields: map[check.Reference][]check.Field{}}
}

func (s *spy) Held() []check.Held {
	held := slices.Clone(s.held)
	for i := range held {
		held[i].Layers = slices.Clone(held[i].Layers)
	}
	return held
}

func (s *spy) Resolve(document check.Reference) (check.Resolved, []check.Fault) {
	s.resolved = append(s.resolved, document)
	a, ok := s.answers[document]
	if !ok {
		s.t.Errorf("resolve asked for %v, which the test does not answer", document)
	}
	resolved := check.Resolved{
		Reached:  slices.Clone(a.resolved.Reached),
		Plans:    slices.Clone(a.resolved.Plans),
		Warnings: slices.Clone(a.resolved.Warnings),
	}
	for i, plan := range resolved.Plans {
		for _, permissions := range []*[]string{&plan.Options, &plan.Required, &plan.Allowed, &plan.Granted, &plan.Extra, &plan.Withheld} {
			*permissions = slices.Clone(*permissions)
		}
		resolved.Plans[i] = plan
	}
	faults := slices.Clone(a.faults)
	for i := range faults {
		faults[i].Chain = slices.Clone(faults[i].Chain)
		faults[i].Problems = slices.Clone(faults[i].Problems)
		if block := faults[i].Block; block != nil {
			faults[i].Block = &check.Block{Reason: block.Reason, Source: block.Source}
		}
	}
	return resolved, faults
}

func (s *spy) Problems() []check.Problem {
	s.problems++
	return slices.Clone(s.none)
}

func (s *spy) Fields(document check.Reference) []check.Field {
	s.shown = append(s.shown, document)
	fields, ok := s.fields[document]
	if !ok {
		s.t.Errorf("fields asked for %v, which the test does not give", document)
	}
	return slices.Clone(fields)
}

// hold holds the documents, each in home.
func (s *spy) hold(documents ...check.Reference) {
	for _, document := range documents {
		s.held = append(s.held, check.Held{Kind: document.Kind, Name: document.Name, Layers: []check.Layer{check.LayerHome}})
	}
}

// resolves answers that each document resolves, with nothing reached.
func (s *spy) resolves(documents ...check.Reference) {
	for _, document := range documents {
		s.answers[document] = answer{}
	}
}

// refuses answers that each document is refused by faults.
func (s *spy) refuses(faults []check.Fault, documents ...check.Reference) {
	for _, document := range documents {
		s.answers[document] = answer{faults: faults}
	}
}

func newChecker(t *testing.T, s *spy) *check.Checker {
	t.Helper()
	c, err := check.New(s, s, s)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func workflow(name string) check.Reference {
	return check.Reference{Kind: check.KindWorkflow, Name: name}
}
func process(name string) check.Reference {
	return check.Reference{Kind: check.KindProcess, Name: name}
}
func agent(name string) check.Reference { return check.Reference{Kind: check.KindAgent, Name: name} }

// at is the fault of the document reached by chain, the documents named
// in order, with problems.
func at(problems []check.Problem, chain ...check.Reference) check.Fault {
	fault := check.Fault{Problems: problems}
	for _, document := range chain {
		fault.Chain = append(fault.Chain, check.Link{Kind: document.Kind, Name: document.Name})
	}
	return fault
}

func problem(message string) []check.Problem { return []check.Problem{{Message: message}} }

func assertReport(t *testing.T, got, want check.Report) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("report\n got %+v\nwant %+v", got, want)
	}
}

func TestNewNeedsEachPort(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	if _, err := check.New(nil, s, s); err == nil {
		t.Error("New with no names gave no error")
	}
	if _, err := check.New(s, nil, s); err == nil {
		t.Error("New with no resolver gave no error")
	}
	if _, err := check.New(s, s, nil); err == nil {
		t.Error("New with no fields gave no error")
	}
}

// check.feature, "Every name is asked for alone, kind by kind, by name",
// over every kind: workflow, process, agent, runtime, brief, prompt,
// schema, skill.
func TestEveryNameIsAskedForAloneKindByKindByName(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	in := func(kind check.Kind, name string) check.Reference { return check.Reference{Kind: kind, Name: name} }
	want := []check.Reference{
		workflow("w"), process("p"), process("q"), agent("b"), in(check.KindRuntime, "r"),
		in(check.KindBrief, "f"), in(check.KindPrompt, "pr"), in(check.KindSchema, "sc"), in(check.KindSkill, "k"),
	}
	s.hold(in(check.KindSkill, "k"), in(check.KindSchema, "sc"), in(check.KindPrompt, "pr"), in(check.KindBrief, "f"),
		in(check.KindRuntime, "r"), agent("b"), process("q"), process("p"), workflow("w"))
	s.resolves(want...)

	newChecker(t, s).Check()

	if !reflect.DeepEqual(s.resolved, want) {
		t.Errorf("asked resolve for\n got %v\nwant %v", s.resolved, want)
	}
}

// check.feature, "A document nothing uses is checked".
func TestADocumentNothingUsesIsChecked(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"), process("unused"))
	s.resolves(workflow("w"))
	missing := problem("prompt is missing")
	s.refuses([]check.Fault{at(missing, process("unused"))}, process("unused"))

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{
		Findings: []check.Finding{{Document: process("unused"), Problems: missing, Refuses: []check.Reference{process("unused")}}},
		Names:    []check.Status{{Document: workflow("w"), Resolves: true}, {Document: process("unused")}},
	})
}

// check.feature, "A fault met by many names is reported once, with each".
func TestAFaultMetByManyNamesIsReportedOnceWithEach(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w1"), workflow("w2"), agent("a"))
	missing := problem("runtime is missing")
	s.refuses([]check.Fault{at(missing, workflow("w1"), agent("a"))}, workflow("w1"))
	s.refuses([]check.Fault{at(missing, workflow("w2"), agent("a"))}, workflow("w2"))
	s.refuses([]check.Fault{at(missing, agent("a"))}, agent("a"))

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{
		Findings: []check.Finding{{Document: agent("a"), Problems: missing, Refuses: []check.Reference{workflow("w1"), workflow("w2"), agent("a")}}},
		Names:    []check.Status{{Document: workflow("w1")}, {Document: workflow("w2")}, {Document: agent("a")}},
	})
}

// check.feature, "A fault met again adds the problems it did not have".
func TestAFaultMetAgainAddsNewProblemsInOrder(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w1"), workflow("w2"), process("p"))
	one := check.Problem{Message: "one"}
	two := check.Problem{Message: "two"}
	three := check.Problem{Message: "three"}
	s.refuses([]check.Fault{at([]check.Problem{one, two}, workflow("w1"), process("p"))}, workflow("w1"))
	s.refuses([]check.Fault{at([]check.Problem{two, three}, workflow("w2"), process("p"))}, workflow("w2"))
	s.refuses([]check.Fault{at([]check.Problem{three}, process("p"))}, process("p"))

	got := newChecker(t, s).Check()

	if want := []check.Problem{one, two, three}; !reflect.DeepEqual(got.Findings[0].Problems, want) {
		t.Errorf("problems %v, want %v", got.Findings[0].Problems, want)
	}
}

// check.feature, "A blocked document is reported with its block".
func TestABlockedDocumentIsReportedWithItsBlock(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"), process("p"))
	block := &check.Block{Reason: "it writes to main", Source: check.Source{File: "/repo/.agister/blocks.yaml", Line: 3, Layer: check.LayerRepository}}
	blocked := func(chain ...check.Reference) check.Fault {
		fault := at(nil, chain...)
		fault.Block = block
		return fault
	}
	s.refuses([]check.Fault{blocked(workflow("w"), process("p"))}, workflow("w"))
	s.refuses([]check.Fault{blocked(process("p"))}, process("p"))

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{
		Findings: []check.Finding{{Document: process("p"), Block: block, Refuses: []check.Reference{workflow("w"), process("p")}}},
		Names:    []check.Status{{Document: workflow("w")}, {Document: process("p")}},
	})
}

// check.feature, "The problems of no document come first, refusing every
// request": they are asked once, and each is reported once, whether the
// problems of no document give it or only a refusal does.
func TestTheProblemsOfNoDocumentComeFirstRefusingEveryRequest(t *testing.T) {
	t.Parallel()
	unread := check.Problem{Source: check.Source{File: "/repo/project/.agister", Layer: check.LayerProject}, Message: "the project's layer cannot be read"}
	for name, none := range map[string][]check.Problem{
		"given by both":      {unread},
		"given by a refusal": nil,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := newSpy(t)
			s.hold(workflow("w"), process("p"))
			s.none = none
			missing := problem("prompt is missing")
			noDocument := check.Fault{Problems: []check.Problem{unread}}
			s.refuses([]check.Fault{noDocument, at(missing, workflow("w"), process("p"))}, workflow("w"))
			s.refuses([]check.Fault{noDocument, at(missing, process("p"))}, process("p"))

			got := newChecker(t, s).Check()

			assertReport(t, got, check.Report{
				Problems: []check.Problem{unread},
				Findings: []check.Finding{{Document: process("p"), Problems: missing, Refuses: []check.Reference{workflow("w"), process("p")}}},
				Names:    []check.Status{{Document: workflow("w")}, {Document: process("p")}},
			})
			if s.problems != 1 {
				t.Errorf("the problems of no document asked %d times, want once", s.problems)
			}
		})
	}
}

// check.feature, "A problem of no document is reported though no name is
// held".
func TestAProblemOfNoDocumentIsReportedThoughNoNameIsHeld(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	unread := check.Problem{Source: check.Source{File: "/home/.agister", Layer: check.LayerHome}, Message: "the home layer cannot be read"}
	s.none = []check.Problem{unread}

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{Problems: []check.Problem{unread}})
	if len(s.resolved) > 0 {
		t.Errorf("asked resolve for %v, want none", s.resolved)
	}
}

// check.feature, "Faults are in the order first met".
func TestFaultsAreInTheOrderFirstMet(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"), process("p"))
	agentFault := at(problem("runtime is missing"), workflow("w"), agent("a"))
	processFault := problem("prompt is missing")
	s.refuses([]check.Fault{agentFault, at(processFault, workflow("w"), process("p"))}, workflow("w"))
	s.refuses([]check.Fault{at(processFault, process("p"))}, process("p"))

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{
		Findings: []check.Finding{
			{Document: agent("a"), Problems: agentFault.Problems, Refuses: []check.Reference{workflow("w")}},
			{Document: process("p"), Problems: processFault, Refuses: []check.Reference{workflow("w"), process("p")}},
		},
		Names: []check.Status{{Document: workflow("w")}, {Document: process("p")}},
	})
}

// check.feature, "A warning is reported once, with every name it came
// with".
func TestAWarningIsReportedOnceWithEveryNameItCameWith(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w2"), workflow("w1"), workflow("w"))
	warning := check.Problem{Source: check.Source{File: "/home/.agister/workflows/w.yaml", Line: 4, Layer: check.LayerHome},
		Place: "steps[0]", Message: "the runtime grants beyond the allowed: net"}
	for _, name := range []string{"w", "w1", "w2"} {
		s.answers[workflow(name)] = answer{resolved: check.Resolved{Warnings: []check.Problem{warning}}}
	}

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{
		Warnings: []check.Warning{{Problem: warning, With: []check.Reference{workflow("w"), workflow("w1"), workflow("w2")}}},
		Names:    []check.Status{{Document: workflow("w"), Resolves: true}, {Document: workflow("w1"), Resolves: true}, {Document: workflow("w2"), Resolves: true}},
	})
}

// check.feature, "A warning is reported once, with every name it came
// with": a warning that differs from another in any of its source, its
// place or its message is another warning, reported apart.
func TestWarningsThatDifferAreReportedApart(t *testing.T) {
	t.Parallel()
	warning := check.Problem{Source: check.Source{File: "/home/.agister/workflows/w.yaml", Line: 4, Layer: check.LayerHome},
		Place: "steps[0]", Message: "the runtime grants beyond the allowed: net"}
	for name, differ := range map[string]func(*check.Problem){
		"file":    func(p *check.Problem) { p.Source.File = "/home/.agister/workflows/v.yaml" },
		"line":    func(p *check.Problem) { p.Source.Line = 9 },
		"layer":   func(p *check.Problem) { p.Source.Layer = check.LayerRepository },
		"place":   func(p *check.Problem) { p.Place = "steps[1]" },
		"message": func(p *check.Problem) { p.Message = "the runtime grants beyond the allowed: tmp" },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			other := warning
			differ(&other)
			s := newSpy(t)
			s.hold(workflow("w1"), workflow("w2"))
			s.answers[workflow("w1")] = answer{resolved: check.Resolved{Warnings: []check.Problem{warning, other}}}
			s.answers[workflow("w2")] = answer{resolved: check.Resolved{Warnings: []check.Problem{other, warning}}}

			got := newChecker(t, s).Check()

			assertReport(t, got, check.Report{
				Warnings: []check.Warning{
					{Problem: warning, With: []check.Reference{workflow("w1"), workflow("w2")}},
					{Problem: other, With: []check.Reference{workflow("w1"), workflow("w2")}},
				},
				Names: []check.Status{{Document: workflow("w1"), Resolves: true}, {Document: workflow("w2"), Resolves: true}},
			})
		})
	}
}

// check.feature, "A fault met by many names is reported once, with each":
// documents of one name and different kinds are different documents, each
// at fault apart, with its own problems and the names it refuses.
func TestDocumentsOfOneNameAndDifferentKindsAreReportedApart(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"), process("x"), agent("x"))
	ofProcess, ofAgent := problem("prompt is missing"), problem("runtime is missing")
	s.refuses([]check.Fault{at(ofAgent, workflow("w"), agent("x")), at(ofProcess, workflow("w"), process("x"))}, workflow("w"))
	s.refuses([]check.Fault{at(ofProcess, process("x"))}, process("x"))
	s.refuses([]check.Fault{at(ofAgent, agent("x"))}, agent("x"))

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{
		Findings: []check.Finding{
			{Document: agent("x"), Problems: problem("runtime is missing"), Refuses: []check.Reference{workflow("w"), agent("x")}},
			{Document: process("x"), Problems: problem("prompt is missing"), Refuses: []check.Reference{workflow("w"), process("x")}},
		},
		Names: []check.Status{{Document: workflow("w")}, {Document: process("x")}, {Document: agent("x")}},
	})
}

// check.feature, "Every name is listed, resolving or refused".
func TestEveryNameIsListedResolvingOrRefused(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"), process("p"))
	s.refuses([]check.Fault{at(problem("steps is missing"), workflow("w"))}, workflow("w"))
	s.resolves(process("p"))

	got := newChecker(t, s).Check()

	if want := []check.Status{{Document: workflow("w")}, {Document: process("p"), Resolves: true}}; !reflect.DeepEqual(got.Names, want) {
		t.Errorf("names\n got %+v\nwant %+v", got.Names, want)
	}
}

// check.feature, "Settings with no fault report none".
func TestSettingsWithNoFaultReportNone(t *testing.T) {
	t.Parallel()
	s := newSpy(t)
	s.hold(workflow("w"))
	s.resolves(workflow("w"))

	got := newChecker(t, s).Check()

	assertReport(t, got, check.Report{Names: []check.Status{{Document: workflow("w"), Resolves: true}}})
}
