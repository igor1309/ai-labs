package resolve_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// onRuntime is s holding the agent "a" on runtime, of a wrapper that can
// do everything but where facts says otherwise.
func onRuntime(s *source, runtime resolve.Runtime, facts ...func(*resolve.Facts)) *source {
	runtime.Name = "r"
	runtime.Contract = resolve.Name{Value: able}
	if len(facts) > 0 {
		lacking := s.facts[able]
		for _, f := range facts {
			f(&lacking)
		}
		runtime.Contract.Value = "lacking/1"
		s.facts["lacking/1"] = lacking
	}
	s.agents["a"] = resolve.Agent{Name: "a", Runtime: resolve.Name{Value: "r"}}
	s.runtimes["r"] = runtime
	return s
}

// options are the options of names, each granting what grants gives it.
func options(grants map[string][]string, names ...string) []resolve.Option {
	var options []resolve.Option
	for _, name := range names {
		options = append(options, resolve.Option{Name: name, Grants: grants[name]})
	}
	return options
}

// planning.feature, "A step is planned from its permissions and its
// mapping".
func TestAStepIsPlannedFromItsPermissionsAndItsMapping(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		required, allowed, base []string
		selects                 string
		offers                  []resolve.Option
		want                    resolve.Plan
	}{
		"no options": {
			required: []string{"read"}, allowed: []string{"read"}, base: []string{"read", "net"},
			want: resolve.Plan{Allowed: []string{"read"}, Granted: []string{"read", "net"}, Extra: []string{"net"}},
		},
		"any, fewest beyond the allowed": {
			required: []string{"read"}, allowed: []string{"read"}, selects: "any",
			offers: options(map[string][]string{"all": {"read", "write", "net"}, "look": {"read"}}, "all", "look"),
			want:   resolve.Plan{Options: []string{"look"}, Allowed: []string{"read"}, Granted: []string{"read"}},
		},
		"any, the first of a tie": {
			required: []string{"read"}, allowed: []string{"read"}, selects: "any",
			offers: options(map[string][]string{"see": {"read", "host"}, "look": {"read", "host"}}, "see", "look"),
			want:   resolve.Plan{Options: []string{"see"}, Allowed: []string{"read"}, Granted: []string{"read", "host"}, Extra: []string{"host"}},
		},
		"any, what is allowed and not required withheld": {
			required: []string{"read"}, allowed: []string{"write"}, selects: "any",
			offers: options(map[string][]string{"look": {"read"}, "edit": {"write"}}, "look", "edit"),
			want:   resolve.Plan{Options: []string{"look"}, Allowed: []string{"write", "read"}, Granted: []string{"read"}, Withheld: []string{"write"}},
		},
		"one, the first that gives what is required": {
			required: []string{"read"}, allowed: []string{"write"}, selects: "one",
			offers: options(map[string][]string{"ro": {"read"}, "rw": {"read", "write"}}, "ro", "rw"),
			want:   resolve.Plan{Options: []string{"ro"}, Allowed: []string{"write", "read"}, Granted: []string{"read"}, Withheld: []string{"write"}},
		},
		"any, an option for each required permission": {
			required: []string{"write", "net"}, allowed: []string{"write", "net"}, selects: "any",
			offers: options(map[string][]string{"edit": {"write"}, "fetch": {"net"}}, "edit", "fetch"),
			want:   resolve.Plan{Options: []string{"edit", "fetch"}, Allowed: []string{"write", "net"}, Granted: []string{"write", "net"}},
		},
		"any, none for a permission already granted": {
			required: []string{"write", "net"}, allowed: []string{"write", "net"}, selects: "any",
			offers: options(map[string][]string{"both": {"write", "net"}, "fetch": {"net"}}, "both", "fetch"),
			want:   resolve.Plan{Options: []string{"both"}, Allowed: []string{"write", "net"}, Granted: []string{"write", "net"}},
		},
		"one, fewest beyond the allowed of those giving the same": {
			required: []string{"read"}, allowed: []string{"read"}, selects: "one",
			offers: options(map[string][]string{"all": {"read", "write", "net"}, "look": {"read"}}, "all", "look"),
			want:   resolve.Plan{Options: []string{"look"}, Allowed: []string{"read"}, Granted: []string{"read"}},
		},
		"one, the first of a tie": {
			required: []string{"read"}, allowed: []string{"read"}, selects: "one",
			offers: options(map[string][]string{"see": {"read", "host"}, "look": {"read", "host"}}, "see", "look"),
			want:   resolve.Plan{Options: []string{"see"}, Allowed: []string{"read"}, Granted: []string{"read", "host"}, Extra: []string{"host"}},
		},
		"one, beyond the allowed where it must": {
			required: []string{"write"}, allowed: []string{"write"}, selects: "one",
			offers: options(map[string][]string{"ro": {"read"}, "rw": {"read", "write"}}, "ro", "rw"),
			want:   resolve.Plan{Options: []string{"rw"}, Allowed: []string{"write"}, Granted: []string{"read", "write"}, Extra: []string{"read"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := onRuntime(newSource(), resolve.Runtime{Grants: test.base, Select: test.selects, Options: test.offers})
			s.processes["p"] = resolve.Process{Name: "p", Require: test.required, Allow: test.allowed}

			got, faults := newResolver(t, s).Resolve(resolve.Step("p", "a"))

			assertResolved(t, faults)
			want := test.want
			want.Place, want.Process, want.Agent, want.Runtime = "steps[0]", "p", "a", "r"
			want.Required = test.required
			if !reflect.DeepEqual(got.Plans, []resolve.Plan{want}) {
				t.Errorf("plans\n got %+v\nwant %+v", got.Plans, []resolve.Plan{want})
			}
		})
	}
}

// planning.feature, "A required permission no plan gives refuses the
// step".
func TestARequiredPermissionNoPlanGivesRefusesTheStep(t *testing.T) {
	t.Parallel()
	grants := map[string][]string{"edit": {"write"}, "fetch": {"net"}}
	for name, runtime := range map[string]resolve.Runtime{
		"any": {Select: "any", Options: options(grants, "edit")},
		"one": {Select: "one", Options: options(grants, "edit", "fetch")},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := onRuntime(newSource(), runtime)
			s.processes["p"] = resolve.Process{Name: "p", Require: []string{"write", "net"}}
			s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{at(step("s", "p", "a"), 4)}}
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
				problemOfW(4, "steps[0]", `its runtime "r" grants the permission "net", as its process "p" requires`))
		})
	}
}

// at is item, on line of w's file.
func at(item resolve.Item, line int) resolve.Item {
	item.Origin = resolve.Origin{Path: homeW, Line: line}
	return item
}

// planning.feature, "Every step is planned, in branches a run may not
// take too"; each plan is its step's whole, of its own process, agent and
// runtime.
func TestEveryStepIsPlannedInBranchesARunMayNotTakeToo(t *testing.T) {
	t.Parallel()
	s := newSource()
	arm := step("b", "pb", "ab")
	arm.If = resolve.Condition{Reads: []resolve.Read{param("base")}}
	s.workflows["w"] = resolve.Workflow{Name: "w", Params: []resolve.Param{{Name: "base", Default: true}}, Steps: []resolve.Item{
		{Name: "both", Parallel: []resolve.Item{step("a", "pa", "aa")}},
		{Name: "pick", Branch: []resolve.Item{arm, {Name: "child", Workflow: resolve.Name{Value: "c"}}}},
		{Name: "loop", Repeat: &resolve.Repeat{Steps: []resolve.Item{step("d", "pd", "ad")}}},
	}}
	s.workflows["c"] = resolve.Workflow{Name: "c", Steps: []resolve.Item{step("e", "pe", "ae")}}
	// Each step's process requires and allows its own permission, which its
	// own runtime grants with an extra of its own, or an option, or withholds.
	s.processes["pa"] = resolve.Process{Name: "pa", Require: []string{"read"}}
	s.processes["pb"] = resolve.Process{Name: "pb", Require: []string{"write"}}
	s.processes["pd"] = resolve.Process{Name: "pd", Allow: []string{"net"}}
	s.processes["pe"] = resolve.Process{Name: "pe", Require: []string{"host"}}
	s.pair("aa", "ra")
	s.pair("ab", "rb")
	s.pair("ad", "rd")
	s.pair("ae", "re")
	s.runtimes["ra"] = resolve.Runtime{Name: "ra", Contract: resolve.Name{Value: able}, Grants: []string{"read", "tmp"}}
	s.runtimes["rb"] = resolve.Runtime{Name: "rb", Contract: resolve.Name{Value: able}, Select: "one",
		Options: options(map[string][]string{"ro": {"read"}, "rw": {"write"}}, "ro", "rw")}
	s.runtimes["re"] = resolve.Runtime{Name: "re", Contract: resolve.Name{Value: able}, Select: "any",
		Options: options(map[string][]string{"lan": {"host"}}, "lan")}

	got, faults := newResolver(t, s).Resolve(requestW)

	assertResolved(t, faults)
	want := []resolve.Plan{
		{Workflow: "w", Place: "steps[0].parallel[0]", Process: "pa", Agent: "aa", Runtime: "ra",
			Required: []string{"read"}, Allowed: []string{"read"}, Granted: []string{"read", "tmp"}, Extra: []string{"tmp"}},
		{Workflow: "w", Place: "steps[1].branch[0]", Process: "pb", Agent: "ab", Runtime: "rb", Options: []string{"rw"},
			Required: []string{"write"}, Allowed: []string{"write"}, Granted: []string{"write"}},
		{Workflow: "w", Place: "steps[2].repeat.steps[0]", Process: "pd", Agent: "ad", Runtime: "rd",
			Allowed: []string{"net"}, Withheld: []string{"net"}},
		{Workflow: "c", Place: "steps[0]", Process: "pe", Agent: "ae", Runtime: "re", Options: []string{"lan"},
			Required: []string{"host"}, Allowed: []string{"host"}, Granted: []string{"host"}},
	}
	if !reflect.DeepEqual(got.Plans, want) {
		t.Errorf("plans\n got %+v\nwant %+v", got.Plans, want)
	}
}

// planning.feature, "A step needs what its runtime can do"; on a runtime
// that can, the step is planned.
func TestAStepNeedsWhatItsRuntimeCanDo(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		need      func(*resolve.Process, *resolve.Item)
		cannot    func(*resolve.Facts)
		can, whom string
	}{
		"an output schema": {
			func(p *resolve.Process, _ *resolve.Item) { p.Schema = resolve.Name{Value: "sc"} },
			func(f *resolve.Facts) { f.Schema = false }, "checks output against a schema", `its process "p"`,
		},
		"a recovery": {
			func(p *resolve.Process, _ *resolve.Item) { p.Recovery = true },
			func(f *resolve.Facts) { f.Session = false }, "resumes a session", `its process "p"`,
		},
		"a session continued": {
			func(_ *resolve.Process, s *resolve.Item) { s.Session = ptr(session("first")) },
			func(f *resolve.Facts) { f.Session = false }, "resumes a session", "it",
		},
		"skills": {
			func(p *resolve.Process, _ *resolve.Item) { p.Skills = []resolve.Name{{Value: "k"}} },
			func(f *resolve.Facts) { f.Skills = false }, "takes skills", `its process "p"`,
		},
		"a limit on tool calls": {
			func(p *resolve.Process, _ *resolve.Item) { p.StaleToolCalls = true },
			func(f *resolve.Facts) { f.ToolCalls = false }, "reports tool calls", `its process "p"`,
		},
		"a limit on tool commands": {
			func(p *resolve.Process, _ *resolve.Item) { p.StaleToolCommands = true },
			func(f *resolve.Facts) { f.ToolCommands = false }, "reports tool commands", `its process "p"`,
		},
	} {
		// needing is s holding the workflow w of the step "first", then the
		// step "s", which needs what test names, on the runtime "r" of facts.
		needing := func(facts ...func(*resolve.Facts)) *source {
			s := onRuntime(newSource(), resolve.Runtime{}, facts...)
			s.other(resolve.KindSchema, "sc")
			s.other(resolve.KindSkill, "k")
			process, item := resolve.Process{Name: "p"}, at(step("s", "p", "a"), 5)
			test.need(&process, &item)
			s.processes["p"], s.processes["q"] = process, resolve.Process{Name: "q"}
			s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("first", "q", "a"), item}}
			return s
		}
		t.Run(name+", cannot", func(t *testing.T) {
			t.Parallel()
			assertProblemsOf(t, needing(test.cannot), requestW, resolve.KindWorkflow, "w",
				problemOfW(5, "steps[1]", `its runtime "r" `+test.can+", as "+test.whom+" needs"))
		})
		t.Run(name+", can", func(t *testing.T) {
			t.Parallel()
			got, faults := newResolver(t, needing()).Resolve(requestW)
			assertResolved(t, faults)
			var planned []string
			for _, plan := range got.Plans {
				planned = append(planned, plan.Place+" "+plan.Process)
			}
			if want := []string{"steps[0] q", "steps[1] p"}; !reflect.DeepEqual(planned, want) {
				t.Errorf("planned %q, want %q", planned, want)
			}
		})
	}
}

// planning.feature, "An agent gives what its runtime takes"; one that
// gives what the facts of its runtime take resolves.
func TestAnAgentGivesWhatItsRuntimeTakes(t *testing.T) {
	t.Parallel()
	const homeA = "/home/.agister/agents/a.yaml"
	origin := resolve.Origin{Path: homeA, Line: 3}
	model := func(f *resolve.Facts) { f.Model = false }
	efforts := func(f *resolve.Facts) { f.Efforts = []string{"low", "high"} }
	for name, test := range map[string]struct {
		agent          func(*resolve.Agent)
		facts          func(*resolve.Facts)
		place, problem string
	}{
		"a model, of a runtime taking one": {
			agent: func(a *resolve.Agent) { a.Model = resolve.Name{Value: "m", Origin: origin} },
			facts: func(f *resolve.Facts) { f.Model = true },
		},
		"a model, of a runtime taking none": {
			agent: func(a *resolve.Agent) { a.Model = resolve.Name{Value: "m", Origin: origin} },
			facts: model, place: "model", problem: `its runtime "r" takes a model`,
		},
		"an effort its runtime accepts": {
			agent: func(a *resolve.Agent) { a.Effort = resolve.Name{Value: "high", Origin: origin} },
			facts: efforts,
		},
		"an effort its runtime does not accept": {
			agent: func(a *resolve.Agent) { a.Effort = resolve.Name{Value: "highest", Origin: origin} },
			facts: efforts, place: "effort", problem: `its runtime "r" takes the effort "highest"`,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := onRuntime(newSource(), resolve.Runtime{}, test.facts)
			agent := s.agents["a"]
			test.agent(&agent)
			s.agents["a"] = agent
			request := resolve.Document(resolve.KindAgent, "a")
			if test.problem == "" {
				got, faults := newResolver(t, s).Resolve(request)
				assertResolved(t, faults)
				if !reflect.DeepEqual(got.Agents["a"], agent) {
					t.Errorf("agent\n got %+v\nwant %+v", got.Agents["a"], agent)
				}
				return
			}
			assertProblemsOf(t, s, request, resolve.KindAgent, "a",
				resolve.Problem{Path: homeA, Line: 3, Place: test.place, Message: test.problem})
		})
	}
}

// planning.feature, "A runtime is of a contract a wrapper takes".
func TestARuntimeIsOfAContractAWrapperTakes(t *testing.T) {
	t.Parallel()
	const homeR = "/home/.agister/runtimes/r.yaml"
	s := newSource()
	s.runtimes["r"] = resolve.Runtime{Name: "r", Contract: resolve.Name{Value: "nobody/1", Origin: resolve.Origin{Path: homeR, Line: 2}}}
	assertProblemsOf(t, s, resolve.Document(resolve.KindRuntime, "r"), resolve.KindRuntime, "r",
		resolve.Problem{Path: homeR, Line: 2, Place: "contract", Message: `a runtime wrapper takes the contract "nobody/1"`})
}

// planning.feature, "A step requested alone its runtime cannot do refuses
// the request".
func TestAStepRequestedAloneItsRuntimeCannotDoRefusesTheRequest(t *testing.T) {
	t.Parallel()
	s := onRuntime(newSource(), resolve.Runtime{}, func(f *resolve.Facts) { f.Schema = false })
	s.processes["p"] = resolve.Process{Name: "p", Schema: resolve.Name{Value: "sc"}}
	s.other(resolve.KindSchema, "sc")

	got, faults := newResolver(t, s).Resolve(resolve.Step("p", "a"))

	assertFaults(t, got, faults, resolve.Fault{Problems: []resolve.Problem{
		{Place: "steps[0]", Message: `its runtime "r" checks output against a schema, as its process "p" needs`},
	}})
}
