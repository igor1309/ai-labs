package resolve_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

const homeW = "/home/.agister/workflows/w.yaml"

// from is the binding name reading what, on line of w's file.
func from(name, what string, line int) resolve.Binding {
	return resolve.Binding{Name: name, From: what, Origin: resolve.Origin{Path: homeW, Line: line}}
}

// problemOfW is the problem of w's file on line, at place.
func problemOfW(line int, place, message string) resolve.Problem {
	return resolve.Problem{Path: homeW, Line: line, Place: place, Message: message}
}

// withSteps is s holding the workflow w of items, each step's process it
// does not hold yet, declaring the params the step binds, each of a
// default, and the agent "a".
func withSteps(s *source, items ...resolve.Item) *source {
	w := s.workflows["w"]
	w.Name, w.Steps = "w", items
	s.workflows["w"] = w
	var processes func([]resolve.Item)
	processes = func(items []resolve.Item) {
		for _, item := range items {
			if p := item.Process.Value; p != "" {
				if _, held := s.processes[p]; !held {
					process := resolve.Process{Name: p}
					for _, binding := range item.Inputs {
						process.Params = append(process.Params, resolve.Param{Name: binding.Name, Default: true})
					}
					s.processes[p] = process
				}
			}
			processes(item.Parallel)
			processes(item.Branch)
			if item.Repeat != nil {
				processes(item.Repeat.Steps)
			}
		}
	}
	processes(items)
	s.pair("a", "r")
	return s
}

// reading is the step name of the process of its name, binding bindings.
func reading(name string, bindings ...resolve.Binding) resolve.Item {
	item := step(name, name, "a")
	item.Inputs = bindings
	return item
}

// assertProblemsOf asserts that resolving w refuses for the document of
// kind and name alone, with problems.
func assertProblemsOf(t *testing.T, s *source, request resolve.Request, kind resolve.Kind, name string, problems ...resolve.Problem) {
	t.Helper()
	got, faults := newResolver(t, s).Resolve(request)
	if len(faults) != 1 {
		t.Fatalf("faults %+v, want one of the %s %q", faults, kind, name)
	}
	chain := faults[0].Chain
	if last := chain[len(chain)-1]; last.Kind != kind || last.Name != name {
		t.Errorf("fault of %v, want the %s %q", last, kind, name)
	}
	if !reflect.DeepEqual(faults[0].Problems, problems) {
		t.Errorf("problems\n got %+v\nwant %+v", faults[0].Problems, problems)
	}
	if !reflect.DeepEqual(got, resolve.Resolved{}) {
		t.Errorf("refused, yet resolved %+v", got)
	}
}

var requestW = resolve.Document(resolve.KindWorkflow, "w")

// background is a source holding bindings.feature's workflow w: the param
// "base", of a default, and the input "goal", whose path reads it; the
// step "a"; the branch "pick", of the arm "one", on a condition, and the
// default "other"; and the repeat "loop", of the state "review", of the
// body "fix". Each place a
// reference sits reads what is declared and has ended, but those in
// reads, by place: "step", "if", "arm", "state", "next", "until", "output"
// and "path". Each reference is on its own line, its place's.
func background(reads map[string]string) *source {
	read := func(place, otherwise string) string {
		if r, ok := reads[place]; ok {
			return r
		}
		return otherwise
	}
	lines := map[string]int{"step": 5, "if": 6, "arm": 7, "state": 8, "next": 9, "until": 10, "output": 11, "path": 12}
	bind := func(place, otherwise string) []resolve.Binding {
		name := "x"
		if place == "state" {
			name = "review"
		}
		return []resolve.Binding{from(name, read(place, otherwise), lines[place])}
	}
	condition := func(place string, otherwise ...string) resolve.Condition {
		var c resolve.Condition
		if r, ok := reads[place]; ok {
			otherwise = []string{r}
		}
		for _, r := range otherwise {
			c.Reads = append(c.Reads, resolve.Name{Value: r, Origin: resolve.Origin{Path: homeW, Line: lines[place]}})
		}
		return c
	}
	one := reading("one")
	one.If = condition("if", "steps.a.outputs.findings", "item.fixed")
	one.Outputs = bind("arm", "steps.one.outputs")
	other := reading("other")
	other.Outputs = []resolve.Binding{from("x", "steps.other.outputs", 13)}
	s := newSource()
	s.workflows["w"] = resolve.Workflow{
		Params:  []resolve.Param{{Name: "base", Default: true}},
		Inputs:  []resolve.Input{{Name: "goal", Arguments: []resolve.Binding{{Name: "path", From: read("path", "params.base"), Origin: resolve.Origin{Path: homeW, Line: lines["path"]}}}}},
		Outputs: bind("output", "inputs.goal"),
	}
	return withSteps(s,
		reading("a", bind("step", "params.base")...),
		resolve.Item{Name: "pick", Branch: []resolve.Item{one, other}},
		resolve.Item{Name: "loop", Repeat: &resolve.Repeat{
			State: bind("state", "steps.a.outputs"),
			Steps: []resolve.Item{reading("fix", from("x", "state.review", 4))},
			Next:  bind("next", "steps.fix.outputs"),
			Until: condition("until", "state.review.findings"),
		}},
	)
}

// bindings.feature, "What is declared, and has ended, is read".
func TestWhatIsDeclaredAndHasEndedIsRead(t *testing.T) {
	t.Parallel()
	_, faults := newResolver(t, background(nil)).Resolve(requestW)
	assertResolved(t, faults)
}

// bindings.feature, "A reference reads what is there, wherever it is".
func TestAReferenceReadsWhatIsThereWhereverItIs(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		where, reads, place, problem string
		line                         int
	}{
		{"step", "params.head", "steps[0].inputs.x", `its workflow declares the param "head"`, 5},
		{"step", "inputs.brief", "steps[0].inputs.x", `its workflow declares the input "brief"`, 5},
		{"step", "state.review", "steps[0].inputs.x", `it is in no repeat of the state "review"`, 5},
		{"step", "steps.no.outputs", "steps[0].inputs.x", `its workflow has the item "no"`, 5},
		{"if", "params.head", "steps[1].branch[0].if", `its workflow declares the param "head"`, 6},
		{"arm", "params.head", "steps[1].branch[0].outputs.x", `its workflow declares the param "head"`, 7},
		{"state", "state.review", "steps[2].repeat.state.review", `it is in no repeat of the state "review"`, 8},
		{"next", "params.head", "steps[2].repeat.next.x", `its workflow declares the param "head"`, 9},
		{"until", "params.head", "steps[2].repeat.until", `its workflow declares the param "head"`, 10},
		{"output", "params.head", "outputs.x", `its workflow declares the param "head"`, 11},
		{"path", "params.head", "inputs.goal.path", `its workflow declares the param "head"`, 12},
		{"output", "steps.a.output", "outputs.x", "it reads an item's outputs or its session", 11},
	} {
		t.Run(test.where+" "+test.reads, func(t *testing.T) {
			t.Parallel()
			s := background(map[string]string{test.where: test.reads})
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", problemOfW(test.line, test.place, test.problem))
		})
	}
}

// bindings.feature, "Items that may run together, or not both, cannot
// read each other".
func TestItemsThatMayRunTogetherOrNotBothCannotReadEachOther(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		operator func(...resolve.Item) resolve.Item
		problem  string
	}{
		"parallel": {func(items ...resolve.Item) resolve.Item { return resolve.Item{Name: "both", Parallel: items} }, `the item "a" runs beside it`},
		"branch":   {func(items ...resolve.Item) resolve.Item { return resolve.Item{Name: "both", Branch: items} }, `the item "a" is another arm of its branch`},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := withSteps(newSource(), test.operator(reading("a"), reading("b", from("x", "steps.a.outputs", 6))))
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", problemOfW(6, "steps[0]."+name+"[1].inputs.x", test.problem))
		})
	}
}

// bindings.feature, "An item reads the items that ended before it".
func TestAnItemReadsTheItemsThatEndedBeforeIt(t *testing.T) {
	t.Parallel()
	s := background(map[string]string{"step": "steps.pick.outputs"})
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
		problemOfW(5, "steps[0].inputs.x", `the item "pick" has ended before it`))
}

// bindings.feature, "An item inside another is read through the item
// holding it".
func TestAnItemInsideAnotherIsReadThroughTheItemHoldingIt(t *testing.T) {
	t.Parallel()
	s := background(map[string]string{"output": "steps.one.outputs"})
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
		problemOfW(11, "outputs.x", `the item "one" is read through the item holding it`))
}

// bindings.feature, "A session is a step's".
func TestASessionIsAStepsSession(t *testing.T) {
	t.Parallel()
	s := withSteps(newSource(), resolve.Item{Name: "d", Workflow: resolve.Name{Value: "d"}}, func() resolve.Item {
		item := reading("s")
		item.Session = resolve.Name{Value: "steps.d.session", Origin: resolve.Origin{Path: homeW, Line: 6}}
		return item
	}())
	s.workflows["d"] = resolve.Workflow{Name: "d", Steps: []resolve.Item{reading("t")}}
	s.processes["t"] = resolve.Process{Name: "t"}
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
		problemOfW(6, "steps[1].session", `the item "d" is no step, and has no session`))
}

// bindings.feature, "A process's references read its own params and
// inputs".
func TestAProcesssReferencesReadItsOwnParamsAndInputs(t *testing.T) {
	t.Parallel()
	const homeP = "/home/.agister/processes/p.yaml"
	at := func(line int) resolve.Origin { return resolve.Origin{Path: homeP, Line: line} }
	process := func(reads map[string]string) resolve.Process {
		read := func(place, otherwise string) string {
			if r, ok := reads[place]; ok {
				return r
			}
			return otherwise
		}
		return resolve.Process{
			Name:        "p",
			Params:      []resolve.Param{{Name: "base", Default: true}},
			Inputs:      []resolve.Input{{Name: "rev", Arguments: []resolve.Binding{{Name: "rev", From: read("argument", "params.base"), Origin: at(3)}}}},
			Environment: []resolve.Binding{{Name: "HEAD", From: read("environment", "params.base"), Origin: at(5)}},
			Revision:    resolve.Name{Value: read("revision", "inputs.rev"), Origin: at(7)},
		}
	}
	t.Run("declared", func(t *testing.T) {
		t.Parallel()
		s := withSteps(newSource(), reading("p"))
		s.processes["p"] = process(nil)
		_, faults := newResolver(t, s).Resolve(requestW)
		assertResolved(t, faults)
	})
	for _, test := range []struct {
		where, reads, place, problem string
		line                         int
	}{
		{"environment", "params.head", "environment.HEAD", `its process declares the param "head"`, 5},
		{"argument", "params.head", "inputs.rev.rev", `its process declares the param "head"`, 3},
		{"revision", "inputs.head", "workspace.revision", `its process declares the input "head"`, 7},
	} {
		t.Run(test.where, func(t *testing.T) {
			t.Parallel()
			s := withSteps(newSource(), reading("p"))
			s.processes["p"] = process(map[string]string{test.where: test.reads})
			assertProblemsOf(t, s, requestW, resolve.KindProcess, "p",
				resolve.Problem{Path: homeP, Line: test.line, Place: test.place, Message: test.problem})
		})
	}
}
