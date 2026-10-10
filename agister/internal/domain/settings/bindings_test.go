package settings_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// bound is the bundle with process j, which receives a collection, and
// workflow w: fan-out node one on process p, bound to agent, and the join
// merge on j.
func bound(agent string) settings.Bundle {
	b := bundle()
	b.Processes["j"] = definition.Process{Name: "j", Agent: "a", Output: definition.Output{Format: "text"},
		Values: []definition.Value{{Name: "gathered", Source: definition.CollectionSource}}, Limits: reading()}
	b.Workflows = map[string]definition.Workflow{"w": {
		Name:   "w",
		FanOut: []definition.Node{{Name: "one", Process: "p", Agent: agent}},
		Join:   definition.Node{Name: "merge", Process: "j"},
	}}
	return b
}

// joining are the mechanisms with the collection a join receives.
var joining = settings.Mechanisms{Sources: []string{"param", definition.CollectionSource}, Adapters: []string{"claude-code"}}

func problemsOf(b settings.Bundle) []string {
	var got []string
	for _, problem := range settings.Check(b, joining) {
		got = append(got, problem.String())
	}
	return got
}

// ADR-030 rule 5: a node binds its process to an agent. A process that
// names no agent has no problem for it, whether a node binds it or none
// does; a node that names an agent the settings lack, or binds such a
// process and names none, is a problem of its workflow, which names the
// node.
func TestANodeBindsItsProcessToAnAgent(t *testing.T) {
	t.Parallel()
	agentless := func(b settings.Bundle) settings.Bundle {
		p := b.Processes["p"]
		p.Agent = ""
		b.Processes["p"] = p
		return b
	}
	unbound := agentless(bundle())
	onJoin := bound("a")
	workflow := onJoin.Workflows["w"]
	workflow.Join.Agent = "ghost"
	onJoin.Workflows["w"] = workflow
	for name, c := range map[string]struct {
		bundle settings.Bundle
		want   []string
	}{
		"a node names its process's agent":                  {bound("a"), nil},
		"a process without an agent, which no node binds":   {unbound, nil},
		"a process without an agent, bound to one":          {agentless(bound("a")), nil},
		"a node names an agent the settings lack":           {bound("ghost"), []string{`workflow w: fan-out node one: agent "ghost" does not exist`}},
		"the join names an agent the settings lack":         {onJoin, []string{`workflow w: join node merge: agent "ghost" does not exist`}},
		"a node binds a process without an agent to no one": {agentless(bound("")), []string{"workflow w: fan-out node one: process p names no agent, and the node names none: name the node's agent (ADR-030 rule 5)"}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := problemsOf(c.bundle); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}

// A process that names no agent still answers for what it says itself: a
// fresh-only one that repairs has its own problem (ADR-030 rule 3). One
// that leaves its session to its agent is judged where a node binds it.
func TestAProcessWithoutAnAgentAnswersForItsOwnSession(t *testing.T) {
	t.Parallel()
	for session, want := range map[string][]string{
		definition.SessionFresh:     {"process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"},
		definition.SessionResumable: nil,
		"":                          nil,
	} {
		b := bundle()
		b.Service.MaxVerifyAttempts = 3
		p := b.Processes["p"]
		p.Agent, p.Session, p.Revision = "", session, "v"
		p.Verify = &definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: 3, Instruction: "Fix it."}
		b.Processes["p"] = p
		if got := problemsOf(b); !reflect.DeepEqual(got, want) {
			t.Errorf("session %q: problems = %q, want %q", session, got, want)
		}
	}
}

// onC is bound("c") with agent c, a's twin but for its session, on the
// runtime mapping given, whose one primitive is the only one a call uses.
func onC(session string, mapping definition.Mapping) settings.Bundle {
	b := bound("c")
	mapping.Adapter, mapping.Efforts, mapping.Select = "claude-code", []string{"high"}, "one"
	b.Mappings[mapping.Name] = mapping
	b.Agents["c"] = definition.Agent{Name: "c", Runtime: mapping.Name, Effort: "high", ModelFamily: "f", Session: session}
	return b
}

// wide is a runtime mapping whose one primitive also grants exec, which
// process p does not allow.
func wide() definition.Mapping {
	return definition.Mapping{Name: "wide", Primitives: []definition.Primitive{{Name: "Shell", Grants: []string{"read", "exec"}, Verified: []string{"1."}}}}
}

// plain is a runtime mapping whose one primitive grants what process p
// allows.
func plain() definition.Mapping {
	return definition.Mapping{Name: "plain", Primitives: []definition.Primitive{{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}}}}
}

// split is a runtime mapping that runs process p on version 2 and not on
// version 1, where its one verified primitive also grants exec.
func split() definition.Mapping {
	return definition.Mapping{Name: "split", Primitives: []definition.Primitive{
		{Name: "Read", Grants: []string{"read"}, Verified: []string{"2."}},
		{Name: "Shell", Grants: []string{"read", "exec"}, Verified: []string{"1."}},
	}}
}

// repairing gives the bundle's process p a verification that repairs, and
// its own agent a session that may be resumed.
func repairing(b settings.Bundle, session string) settings.Bundle {
	b.Service.MaxVerifyAttempts = 3
	a := b.Agents["a"]
	a.Session = definition.SessionResumable
	b.Agents["a"] = a
	p := b.Processes["p"]
	p.Session, p.Revision = session, "v"
	p.Verify = &definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: 3, Instruction: "Fix it."}
	b.Processes["p"] = p
	return b
}

// ADR-030 rule 8: a process that cannot be planned on the runtime of the
// agent a node binds it to is a problem of the workflow, which names the
// node, and not of the process, which runs on its own agent. A node that
// names its process's own agent adds nothing to the process's problem.
func TestABindingThatCannotBePlannedIsAProblemOfItsWorkflow(t *testing.T) {
	t.Parallel()
	const refused = "cannot run on agent c's runtime wide: cannot enforce the effective permissions: Shell also grants exec"
	onJoin := onC(definition.SessionFresh, wide())
	workflow := onJoin.Workflows["w"]
	workflow.FanOut[0].Agent, workflow.Join.Agent = "", "c"
	onJoin.Workflows["w"] = workflow
	// Workflow v binds the same process to the agent that runs it.
	beside := onC(definition.SessionFresh, wide())
	beside.Workflows["v"] = bound("a").Workflows["w"]
	own := onC(definition.SessionFresh, wide())
	p := own.Processes["p"]
	p.Agent = "c"
	own.Processes["p"] = p
	for name, c := range map[string]struct {
		bundle settings.Bundle
		want   []string
	}{
		"a fan-out node":                    {onC(definition.SessionFresh, wide()), []string{"workflow w: fan-out node one: process p: " + refused}},
		"the join":                          {onJoin, []string{"workflow w: join node merge: process j: " + refused}},
		"another workflow binds it to a":    {beside, []string{"workflow w: fan-out node one: process p: " + refused}},
		"a version of the runtime plans it": {onC(definition.SessionFresh, split()), nil},
		"the process's own agent":           {own, []string{"process p: " + refused}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := problemsOf(c.bundle); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}

// ADR-030 rules 3 and 8: a process that leaves its session to its agent
// and repairs or recovers in it cannot run on a fresh-only agent a node
// binds it to: a problem of the workflow, which names the node. One that
// sets session answers for it itself, whatever agent a node binds.
func TestABindingToAFreshOnlyAgentIsAProblemOfItsWorkflow(t *testing.T) {
	t.Parallel()
	recovering := repairing(onC(definition.SessionFresh, plain()), "")
	p := recovering.Processes["p"]
	resumes := 1
	p.Verify, p.Limits.Stale.Recover = nil, definition.Recover{MaxResumes: &resumes, Instruction: "Go on."}
	recovering.Processes["p"] = p
	for name, c := range map[string]struct {
		bundle settings.Bundle
		want   []string
	}{
		"it repairs": {repairing(onC(definition.SessionFresh, plain()), ""),
			[]string{"workflow w: fan-out node one: process p: verify.max_attempts 3 repairs in the call's session, but agent c is fresh-only"}},
		"it recovers": {recovering,
			[]string{"workflow w: fan-out node one: process p: stale.recover.max_resumes 1 recovers in the call's session, but agent c is fresh-only"}},
		"the node's agent is resumable": {repairing(onC(definition.SessionResumable, plain()), ""), nil},
		"the process says resumable":    {repairing(onC(definition.SessionFresh, plain()), definition.SessionResumable), nil},
		"the process says fresh-only": {repairing(onC(definition.SessionFresh, plain()), definition.SessionFresh),
			[]string{"process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"}},
		"it neither repairs nor recovers": {onC(definition.SessionFresh, plain()), nil},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := problemsOf(c.bundle); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}

// The runtime's installed version may plan less than some version does:
// a binding is planned on it as a process on its own agent is, and is the
// workflow's problem, which no agent lifts. A node that names its
// process's own agent adds nothing to the process's problem.
func TestABindingIsPlannedOnTheInstalledVersion(t *testing.T) {
	t.Parallel()
	b := onC(definition.SessionFresh, split())
	b.Processes["q"] = definition.Process{Name: "q", Agent: "c", Output: definition.Output{Format: "text"}, Limits: reading()}
	workflow := b.Workflows["w"]
	workflow.FanOut = append(workflow.FanOut, definition.Node{Name: "two", Process: "q", Agent: "c"})
	b.Workflows["w"] = workflow
	if got := problemsOf(b); got != nil {
		t.Fatalf("before the version is known: problems = %q", got)
	}
	const refused = "cannot run on agent c's runtime split version 1.4: cannot enforce the effective permissions: Shell also grants exec (not verified for version 1.4: Read)"
	want := []settings.Problem{
		{Subject: "process q", Message: refused, Agent: "c"},
		{Subject: "workflow w", Message: "fan-out node one: process p: " + refused},
	}
	if got := settings.PlanProblems(b, b.Agents["c"], "1.4"); !reflect.DeepEqual(got, want) {
		t.Fatalf("version 1.4: problems = %+v, want %+v", got, want)
	}
	if got := settings.PlanProblems(b, b.Agents["c"], "2.0"); got != nil {
		t.Fatalf("version 2.0: problems = %+v", got)
	}
	if got := settings.PlanProblems(b, b.Agents["a"], "1.4"); got != nil {
		t.Fatalf("agent a: problems = %+v", got)
	}
}

// ADR-030 rules 3 and 8: only the runtime can say whether it resumes a
// session. One that cannot refuses the process that repairs on its own
// agent, and each node that binds such a process to an agent on it: a
// problem of the workflow, which names the node.
func TestABindingToARuntimeThatCannotResumeIsAProblemOfItsWorkflow(t *testing.T) {
	t.Parallel()
	b := repairing(onC(definition.SessionResumable, plain()), "")
	if got := problemsOf(b); got != nil {
		t.Fatalf("before the runtime is asked: problems = %q", got)
	}
	const repairs = "verify.max_attempts 3 repairs in the call's session, but runtime "
	if got, want := settings.ResumeProblems(b, b.Agents["c"]), []settings.Problem{{Subject: "workflow w", Message: "fan-out node one: process p: " + repairs + "plain cannot resume sessions"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("agent c: problems = %+v, want %+v", got, want)
	}
	if got, want := settings.ResumeProblems(b, b.Agents["a"]), []settings.Problem{{Subject: "process p", Message: repairs + "rt cannot resume sessions", Agent: "a"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("agent a: problems = %+v, want %+v", got, want)
	}
}

// writable is bound(agent) with process p allowing write beside read, and
// requiring what is given, on a runtime mapping rt that grants read on
// versions 1 and 2, and write on version 2 alone.
func writable(agent string, require ...string) settings.Bundle {
	b := bound(agent)
	p := b.Processes["p"]
	p.Limits.Allow, p.Require = []string{"read", "write"}, require
	b.Processes["p"] = p
	rt := b.Mappings["rt"]
	rt.Primitives = []definition.Primitive{
		{Name: "Read", Grants: []string{"read"}, Verified: []string{"1.", "2."}},
		{Name: "Write", Grants: []string{"write"}, Verified: []string{"2."}},
	}
	b.Mappings["rt"] = rt
	return b
}

// ADR-030 rules 7 and 8: every node of every workflow is planned as its
// call would be, on the agent it binds its process to, its process's own
// where it names none: the permissions allowed and not required that the
// plan does not give, and the required ones it would withhold. A runtime
// whose installed version is known is planned on it; any other on the
// version it verifies that withholds the fewest required permissions.
func TestEveryBindingIsPlanned(t *testing.T) {
	t.Parallel()
	merge := settings.BindingPlan{Workflow: "w", Node: "merge", Label: "join node merge", Process: "j", Agent: "a", Runtime: "rt", Version: "1"}
	one := func(agent, version string, withheld, required []string) []settings.BindingPlan {
		return []settings.BindingPlan{
			{Workflow: "w", Node: "one", Label: "fan-out node one", Process: "p", Agent: agent, Runtime: "rt", Version: version, Withheld: withheld, Required: required},
			merge,
		}
	}
	// Agent c is a's twin, which a node binds p to.
	onC := writable("c", "write")
	onC.Agents["c"] = definition.Agent{Name: "c", Runtime: "rt", Effort: "high", ModelFamily: "f"}
	installed := func(version string) map[string]string { return map[string]string{"a": version} }
	for name, c := range map[string]struct {
		bundle    settings.Bundle
		installed map[string]string
		want      []settings.BindingPlan
	}{
		"allowed, not required, withheld on the installed version": {writable("a"), installed("1.4"),
			[]settings.BindingPlan{{Workflow: "w", Node: "one", Label: "fan-out node one", Process: "p", Agent: "a", Runtime: "rt", Version: "1.4", Withheld: []string{"write"}}, {Workflow: "w", Node: "merge", Label: "join node merge", Process: "j", Agent: "a", Runtime: "rt", Version: "1.4"}}},
		"required, withheld on the installed version": {writable("a", "write"), installed("1.4"),
			[]settings.BindingPlan{{Workflow: "w", Node: "one", Label: "fan-out node one", Process: "p", Agent: "a", Runtime: "rt", Version: "1.4", Required: []string{"write"}}, {Workflow: "w", Node: "merge", Label: "join node merge", Process: "j", Agent: "a", Runtime: "rt", Version: "1.4"}}},
		"required, given on a version the runtime verifies": {writable("a", "write"), nil, one("a", "2", nil, nil)},
		"a node that names no agent binds its process's":    {writable("", "write"), nil, one("a", "2", nil, nil)},
		"a node that binds another agent":                   {onC, map[string]string{"c": "1.4"}, one("c", "1.4", nil, []string{"write"})},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := settings.BindingPlans(c.bundle, c.installed); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("plans = %+v\nwant %+v", got, c.want)
			}
		})
	}
}
