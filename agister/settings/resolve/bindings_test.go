package resolve_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

const homeW = "/home/.agister/workflows/w.yaml"

// from is the binding name reading reads, on line of w's file, at place.
func from(name string, reads resolve.Read, line int, place string) resolve.Binding {
	reads.Origin = resolve.Origin{Path: homeW, Line: line, Place: place}
	return resolve.Binding{Name: name, From: &reads, Origin: reads.Origin}
}

// problemOfW is the problem of w's file on line, at place.
func problemOfW(line int, place, message string) resolve.Problem {
	return resolve.Problem{Origin: resolve.Origin{Path: homeW, Line: line, Place: place}, Message: message}
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
// and "path". Each reference is on its own line, its place's, at the place
// the source gives it.
func background(reads map[string]resolve.Read) *source {
	read := func(place string, otherwise resolve.Read) resolve.Read {
		if r, ok := reads[place]; ok {
			return r
		}
		return otherwise
	}
	lines := map[string]int{"step": 5, "if": 6, "arm": 7, "state": 8, "next": 9, "until": 10, "output": 11, "path": 12}
	places := map[string]string{
		"step": "steps[0].inputs.x", "if": "steps[1].branch[0].if", "arm": "steps[1].branch[0].outputs.x",
		"state": "steps[2].repeat.state.review", "next": "steps[2].repeat.next.x", "until": "steps[2].repeat.until",
		"output": "outputs.x", "path": "inputs.goal.path",
	}
	bind := func(place string, otherwise resolve.Read) []resolve.Binding {
		name := "x"
		if place == "state" {
			name = "review"
		}
		return []resolve.Binding{from(name, read(place, otherwise), lines[place], places[place])}
	}
	condition := func(place string, otherwise ...resolve.Read) resolve.Condition {
		var c resolve.Condition
		if r, ok := reads[place]; ok {
			otherwise = []resolve.Read{r}
		}
		for _, r := range otherwise {
			r.Origin = resolve.Origin{Path: homeW, Line: lines[place], Place: places[place]}
			c.Reads = append(c.Reads, r)
		}
		return c
	}
	one := reading("one")
	one.If = condition("if", outputs("a", "findings"), queryItem("fixed"))
	one.Outputs = bind("arm", outputs("one", ""))
	other := reading("other")
	other.Outputs = []resolve.Binding{from("x", outputs("other", ""), 13, "steps[1].branch[1].outputs.x")}
	s := newSource()
	s.workflows["w"] = resolve.Workflow{
		Params:  []resolve.Param{{Name: "base", Default: true}},
		Inputs:  []resolve.Input{{Name: "goal", Arguments: []resolve.Binding{from("path", read("path", param("base")), lines["path"], places["path"])}}},
		Outputs: bind("output", input("goal")),
	}
	return withSteps(s,
		reading("a", bind("step", param("base"))...),
		resolve.Item{Name: "pick", Branch: []resolve.Item{one, other}},
		resolve.Item{Name: "loop", Repeat: &resolve.Repeat{
			State: bind("state", outputs("a", "")),
			Steps: []resolve.Item{reading("fix", from("x", state("review"), 4, "steps[2].repeat.steps[0].inputs.x"))},
			Next:  bind("next", outputs("fix", "")),
			Until: condition("until", state("review")),
		}},
	)
}

// bindings.feature, "What is declared, and has ended, is read".
func TestWhatIsDeclaredAndHasEndedIsRead(t *testing.T) {
	t.Parallel()
	_, faults := newResolver(t, background(nil)).Resolve(requestW)
	assertResolved(t, faults)
}

// paths.feature, "A file's text is not given where a path is read".
func TestAFileTextIsNotGivenWhereAProcessReadsAFilePath(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{
		Name:   "w",
		Params: []resolve.Param{{Name: "goal", Default: true}},
		Inputs: []resolve.Input{{Name: "text", File: true}},
		Steps:  []resolve.Item{{Name: "build", Process: named("p", "steps[0].process"), Agent: named("a", "steps[0].agent"), Inputs: []resolve.Binding{from("path", input("text"), 0, "steps[0].inputs.path")}}},
	}
	s.processes["p"] = resolve.Process{
		Name:   "p",
		Params: []resolve.Param{{Name: "path", Default: true}},
		Inputs: []resolve.Input{{Name: "brief", File: true, Path: ptr(param("path"))}},
	}
	s.pair("a", "r")
	assertProblemsOf(t, s, resolve.Document(resolve.KindWorkflow, "w"), resolve.KindWorkflow, "w",
		resolve.Problem{Origin: resolve.Origin{Path: homeW, Line: 0, Place: "steps[0].inputs.path"}, Message: `it gives a file's text where the process "p" reads a path, at its input "brief"`})
}

// paths.feature, "params.goal" gives a path and therefore resolves.
func TestAFilePathParamIsGivenWhereAProcessReadsAFilePath(t *testing.T) {
	t.Parallel()
	s := newSource()
	s.workflows["w"] = resolve.Workflow{
		Name:   "w",
		Params: []resolve.Param{{Name: "goal", Default: true}},
		Inputs: []resolve.Input{{Name: "text", File: true, Path: ptr(param("goal"))}},
		Steps:  []resolve.Item{{Name: "build", Process: named("p", "steps[0].process"), Agent: named("a", "steps[0].agent"), Inputs: []resolve.Binding{from("path", param("goal"), 0, "steps[0].inputs.path")}}},
	}
	s.processes["p"] = resolve.Process{
		Name:   "p",
		Params: []resolve.Param{{Name: "path", Default: true}},
		Inputs: []resolve.Input{{Name: "brief", File: true, Path: ptr(param("path"))}},
	}
	s.pair("a", "r")
	if _, faults := newResolver(t, s).Resolve(resolve.Document(resolve.KindWorkflow, "w")); len(faults) != 0 {
		t.Fatalf("faults %+v, want none", faults)
	}
}

// bindings.feature, "What is declared, and has ended, is read", of a
// repeat's until reading the items of its body, which have ended when it
// is read.
func TestARepeatsUntilReadsTheItemsOfItsBody(t *testing.T) {
	t.Parallel()
	for name, reads := range map[string]resolve.Read{
		"outputs":         outputs("fix", ""),
		"a field of them": outputs("fix", "fixed"),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, faults := newResolver(t, background(map[string]resolve.Read{"until": reads})).Resolve(requestW)
			assertResolved(t, faults)
		})
	}
}

// bindings.feature, "A reference reads what is there, wherever it is".
func TestAReferenceReadsWhatIsThereWhereverItIs(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		where                string
		reads                resolve.Read
		place, problem, name string
		line                 int
	}{
		{"step", param("head"), "steps[0].inputs.x", `its workflow declares the param "head"`, "params.head", 5},
		{"step", input("brief"), "steps[0].inputs.x", `its workflow declares the input "brief"`, "inputs.brief", 5},
		{"step", state("review"), "steps[0].inputs.x", `it is in no repeat of the state "review"`, "state.review", 5},
		{"step", outputs("no", ""), "steps[0].inputs.x", `its workflow has the item "no"`, "steps.no.outputs", 5},
		{"if", param("head"), "steps[1].branch[0].if", `its workflow declares the param "head"`, "params.head", 6},
		{"arm", param("head"), "steps[1].branch[0].outputs.x", `its workflow declares the param "head"`, "params.head", 7},
		{"state", state("review"), "steps[2].repeat.state.review", `it is in no repeat of the state "review"`, "state.review", 8},
		{"next", param("head"), "steps[2].repeat.next.x", `its workflow declares the param "head"`, "params.head", 9},
		{"until", param("head"), "steps[2].repeat.until", `its workflow declares the param "head"`, "params.head", 10},
		{"output", param("head"), "outputs.x", `its workflow declares the param "head"`, "params.head", 11},
		{"path", param("head"), "inputs.goal.path", `its workflow declares the param "head"`, "params.head", 12},
	} {
		t.Run(test.where+" "+test.name, func(t *testing.T) {
			t.Parallel()
			s := background(map[string]resolve.Read{test.where: test.reads})
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
			place := "steps[0]." + name + "[1].inputs.x"
			s := withSteps(newSource(), test.operator(reading("a"), reading("b", from("x", outputs("a", ""), 6, place))))
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", problemOfW(6, place, test.problem))
		})
	}
}

// bindings.feature, "An item reads the items that ended before it".
func TestAnItemReadsTheItemsThatEndedBeforeIt(t *testing.T) {
	t.Parallel()
	s := background(map[string]resolve.Read{"step": outputs("pick", "")})
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
		problemOfW(5, "steps[0].inputs.x", `the item "pick" has ended before it`))
}

// bindings.feature, "An item inside another is read through the item
// holding it".
func TestAnItemInsideAnotherIsReadThroughTheItemHoldingIt(t *testing.T) {
	t.Parallel()
	s := background(map[string]resolve.Read{"output": outputs("one", "")})
	assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
		problemOfW(11, "outputs.x", `the item "one" is read through the item holding it`))
}

// bindings.feature, "A step continues the session of a step"; and, where
// it does, it resolves.
func TestAStepContinuesTheSessionOfAStep(t *testing.T) {
	t.Parallel()
	workflowItem := resolve.Item{Name: "d", Workflow: resolve.Name{Value: "d"}}
	for name, test := range map[string]struct {
		item      resolve.Item
		continues resolve.Read
		problem   string
	}{
		"a step's session":    {reading("d"), session("d"), ""},
		"a workflow item's":   {workflowItem, session("d"), `the item "d" is no step, and has no session`},
		"a step's outputs":    {reading("d"), outputs("d", ""), "it reads a step's session"},
		"a field of outputs":  {reading("d"), outputs("d", "verdict"), "it reads a step's session"},
		"a param":             {reading("d"), param("base"), "it reads a step's session"},
		"the item of a query": {reading("d"), queryItem("fixed"), "it reads a step's session"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			continues := test.continues
			continues.Origin = resolve.Origin{Path: homeW, Line: 6, Place: "steps[1].session"}
			s := newSource()
			s.workflows["w"] = resolve.Workflow{Params: []resolve.Param{{Name: "base", Default: true}}}
			item := reading("s")
			item.Session = &continues
			withSteps(s, test.item, item)
			s.workflows["d"] = resolve.Workflow{Name: "d", Steps: []resolve.Item{reading("t")}}
			s.processes["t"] = resolve.Process{Name: "t"}
			if test.problem == "" {
				_, faults := newResolver(t, s).Resolve(requestW)
				assertResolved(t, faults)
				return
			}
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", problemOfW(6, "steps[1].session", test.problem))
		})
	}
}

// bindings.feature, "A process's references read its own params and
// inputs".
func TestAProcesssReferencesReadItsOwnParamsAndInputs(t *testing.T) {
	t.Parallel()
	const homeP = "/home/.agister/processes/p.yaml"
	at := func(line int, place string) resolve.Origin {
		return resolve.Origin{Path: homeP, Line: line, Place: place}
	}
	process := func(reads map[string]resolve.Read) resolve.Process {
		read := func(where string, otherwise resolve.Read, origin resolve.Origin) resolve.Read {
			if r, ok := reads[where]; ok {
				otherwise = r
			}
			otherwise.Origin = origin
			return otherwise
		}
		argument, environment := at(3, "inputs.rev.rev"), at(5, "environment.HEAD")
		revision := read("revision", input("rev"), at(7, "workspace.revision"))
		return resolve.Process{
			Name:        "p",
			Params:      []resolve.Param{{Name: "base", Default: true}},
			Inputs:      []resolve.Input{{Name: "rev", Arguments: []resolve.Binding{{Name: "rev", From: ptr(read("argument", param("base"), argument)), Origin: argument}}}},
			Environment: []resolve.Binding{{Name: "HEAD", From: ptr(read("environment", param("base"), environment)), Origin: environment}},
			Revision:    &revision,
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
		where          string
		reads          resolve.Read
		place, problem string
		line           int
	}{
		{"environment", param("head"), "environment.HEAD", `its process declares the param "head"`, 5},
		{"argument", param("head"), "inputs.rev.rev", `its process declares the param "head"`, 3},
		{"revision", input("head"), "workspace.revision", `its process declares the input "head"`, 7},
	} {
		t.Run(test.where, func(t *testing.T) {
			t.Parallel()
			s := withSteps(newSource(), reading("p"))
			s.processes["p"] = process(map[string]resolve.Read{test.where: test.reads})
			assertProblemsOf(t, s, requestW, resolve.KindProcess, "p",
				resolve.Problem{Origin: at(test.line, test.place), Message: test.problem})
		})
	}
}

func ptr[T any](v T) *T { return &v }
