package settings_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// bound is the bundle with process j, which receives a collection, and
// workflow w: fan-out node one on process p, bound to agent, and the join
// merge on j.
func bound(agent string) settings.Bundle {
	b := bundle()
	b.Processes["j"] = settings.Process{Name: "j",
		Values: []settings.Value{{Name: "gathered", Source: collection}}, Limits: reading("j")}
	b.Workflows = map[string]settings.Workflow{"w": {
		Name:   "w",
		FanOut: []settings.Node{{Name: "one", Process: "p", Agent: agent}},
		Join:   settings.Node{Name: "merge", Process: "j", Agent: "a"},
	}}
	return b
}

// collection is the input source through which a join receives the
// collection.
const collection = "workflow.collection"

// joining are the mechanisms with the collection a join receives.
var joining = settings.Mechanisms{Sources: []string{"param", collection}, Adapters: []string{"claude-code"}}

func problemsOf(b settings.Bundle) []string {
	var got []string
	for _, problem := range settings.Check(b, joining) {
		got = append(got, problem.String())
	}
	return got
}

// ADR-030 rule 5: a node binds its process to an agent. A process names
// none, and has no problem for it, whether a node binds it or none does; a
// node that names an agent the settings lack is a problem of its workflow,
// which names the node. A node that names no agent does not reach here: its
// workflow does not parse.
func TestANodeBindsItsProcessToAnAgent(t *testing.T) {
	t.Parallel()
	onJoin := bound("a")
	workflow := onJoin.Workflows["w"]
	workflow.Join.Agent = "ghost"
	onJoin.Workflows["w"] = workflow
	for name, c := range map[string]struct {
		bundle settings.Bundle
		want   []string
	}{
		"a node binds its process to an agent":      {bound("a"), nil},
		"a process no node binds":                   {bundle(), nil},
		"a node names an agent the settings lack":   {bound("ghost"), []string{`workflow w: fan-out node one: agent "ghost" does not exist`}},
		"the join names an agent the settings lack": {onJoin, []string{`workflow w: join node merge: agent "ghost" does not exist`}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := problemsOf(c.bundle); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}

// A process answers for its own session, whether or not a node binds it
// (ADR-030 rule 3): a fresh-only one that repairs has its own problem. One
// that sets no session comes to settings fresh-only (rule 2).
func TestAProcessAnswersForItsOwnSession(t *testing.T) {
	t.Parallel()
	const repairs = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
	for resumable, want := range map[bool][]string{
		false: {repairs},
		true:  nil,
	} {
		b := bundle()
		b.Service.Ceilings.MaxVerifyAttempts = 3
		p := b.Processes["p"]
		p.Resumable, p.Limits.Pinned = resumable, true
		p.Limits.Verify = &policy.Verify{Timeout: time.Minute, MaxAttempts: 3}
		b.Processes["p"] = p
		if got := problemsOf(b); !reflect.DeepEqual(got, want) {
			t.Errorf("resumable %t: problems = %q, want %q", resumable, got, want)
		}
	}
}

// onC is bound("c") with agent c, a's twin, on the runtime mapping given,
// whose one primitive is the only one a call uses.
func onC(mapping settings.Mapping) settings.Bundle {
	b := bound("c")
	mapping.Adapter, mapping.Efforts, mapping.Offer.One = "claude-code", []string{"high"}, true
	b.Mappings[mapping.Name] = mapping
	b.Agents["c"] = settings.Agent{Name: "c", Runtime: mapping.Name, Effort: "high"}
	return b
}

// wide is a runtime mapping whose one primitive also grants exec, which
// process p does not allow.
func wide() settings.Mapping {
	return settings.Mapping{Name: "wide", Offer: offering(enforce.Primitive{Name: "Shell", Grants: []string{"read", "exec"}, Verified: []string{"1."}})}
}

// plain is a runtime mapping whose one primitive grants what process p
// allows.
func plain() settings.Mapping {
	return settings.Mapping{Name: "plain", Offer: offering(enforce.Primitive{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}})}
}

// split is a runtime mapping that runs process p on version 2 and not on
// version 1, where its one verified primitive also grants exec.
func split() settings.Mapping {
	return settings.Mapping{Name: "split", Offer: offering(
		enforce.Primitive{Name: "Read", Grants: []string{"read"}, Verified: []string{"2."}},
		enforce.Primitive{Name: "Shell", Grants: []string{"read", "exec"}, Verified: []string{"1."}},
	)}
}

// repairing gives the bundle's process p a verification that repairs, and
// a session resumable or fresh-only.
func repairing(b settings.Bundle, resumable bool) settings.Bundle {
	b.Service.Ceilings.MaxVerifyAttempts = 3
	p := b.Processes["p"]
	p.Resumable, p.Limits.Pinned = resumable, true
	p.Limits.Verify = &policy.Verify{Timeout: time.Minute, MaxAttempts: 3}
	b.Processes["p"] = p
	return b
}

// ADR-030 rule 8: a process that cannot be planned on the runtime of the
// agent a node binds it to is a problem of the workflow, which names the
// node, and not of the process, which names no agent (rule 2).
func TestABindingThatCannotBePlannedIsAProblemOfItsWorkflow(t *testing.T) {
	t.Parallel()
	const refused = "cannot run on agent c's runtime wide: cannot enforce the effective permissions: Shell also grants exec"
	onJoin := onC(wide())
	workflow := onJoin.Workflows["w"]
	workflow.FanOut[0].Agent, workflow.Join.Agent = "a", "c"
	onJoin.Workflows["w"] = workflow
	// Workflow v binds the same process to the agent that runs it.
	beside := onC(wide())
	beside.Workflows["v"] = bound("a").Workflows["w"]
	for name, c := range map[string]struct {
		bundle settings.Bundle
		want   []string
	}{
		"a fan-out node":                    {onC(wide()), []string{"workflow w: fan-out node one: process p: " + refused}},
		"the join":                          {onJoin, []string{"workflow w: join node merge: process j: " + refused}},
		"another workflow binds it to a":    {beside, []string{"workflow w: fan-out node one: process p: " + refused}},
		"a version of the runtime plans it": {onC(split()), nil},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := problemsOf(c.bundle); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}

// ADR-030 rules 1 and 3: an agent holds no session, so a binding adds
// nothing to what the process says of its own: a process that repairs or
// recovers in a session it may not resume has its problem once, as the
// process's, and no workflow that binds it has one.
func TestABindingAddsNothingToItsProcesssSession(t *testing.T) {
	t.Parallel()
	recovering := func(resumable bool) settings.Bundle {
		b := repairing(onC(plain()), resumable)
		p := b.Processes["p"]
		resumes := 1
		p.Limits.Verify = nil
		p.Limits.Stale.MaxResumes, p.Limits.Stale.Instruction = &resumes, "Go on."
		b.Processes["p"] = p
		return b
	}
	const (
		repairs  = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
		recovers = "process p: stale.recover.max_resumes 1 recovers in the call's session, but process p is fresh-only"
	)
	for name, c := range map[string]struct {
		bundle settings.Bundle
		want   []string
	}{
		"it repairs, fresh-only":          {repairing(onC(plain()), false), []string{repairs}},
		"it recovers, fresh-only":         {recovering(false), []string{recovers}},
		"it repairs, resumable":           {repairing(onC(plain()), true), nil},
		"it recovers, resumable":          {recovering(true), nil},
		"it neither repairs nor recovers": {onC(plain()), nil},
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
// every binding to the agent is planned on it, and is the workflow's
// problem. Process q names no agent, so its problem is its node's (ADR-030
// rule 2).
func TestABindingIsPlannedOnTheInstalledVersion(t *testing.T) {
	t.Parallel()
	b := onC(split())
	b.Processes["q"] = settings.Process{Name: "q", Limits: reading("q")}
	workflow := b.Workflows["w"]
	workflow.FanOut = append(workflow.FanOut, settings.Node{Name: "two", Process: "q", Agent: "c"})
	b.Workflows["w"] = workflow
	if got := problemsOf(b); got != nil {
		t.Fatalf("before the version is known: problems = %q", got)
	}
	const refused = "cannot run on agent c's runtime split version 1.4: cannot enforce the effective permissions: Shell also grants exec (not verified for version 1.4: Read)"
	want := []settings.Problem{
		{Subject: "workflow w", Message: "fan-out node one: process p: " + refused},
		{Subject: "workflow w", Message: "fan-out node two: process q: " + refused},
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
// session. One that cannot refuses each node that binds a process that
// repairs to an agent on it: a problem of the workflow, which names the
// node. Workflow v binds the process to agent a: the problem is that
// workflow's, as the process names no agent (ADR-030 rule 2).
func TestABindingToARuntimeThatCannotResumeIsAProblemOfItsWorkflow(t *testing.T) {
	t.Parallel()
	b := repairing(onC(plain()), true)
	b.Workflows["v"] = bound("a").Workflows["w"]
	if got := problemsOf(b); got != nil {
		t.Fatalf("before the runtime is asked: problems = %q", got)
	}
	const repairs = "verify.max_attempts 3 repairs in the call's session, but runtime "
	if got, want := settings.ResumeProblems(b, b.Agents["c"]), []settings.Problem{{Subject: "workflow w", Message: "fan-out node one: process p: " + repairs + "plain cannot resume sessions"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("agent c: problems = %+v, want %+v", got, want)
	}
	if got, want := settings.ResumeProblems(b, b.Agents["a"]), []settings.Problem{{Subject: "workflow v", Message: "fan-out node one: process p: " + repairs + "rt cannot resume sessions"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("agent a: problems = %+v, want %+v", got, want)
	}
}

// ADR-030 rule 8: only the runtime can say whether it enforces a cost
// limit. One that cannot refuses each node that binds a process that sets
// one to an agent on it: a problem of the workflow, which names the node,
// as a call of it is refused. Workflow v binds the process to agent a:
// the problem is that workflow's, as the process names no agent (ADR-030
// rule 2).
func TestABindingToARuntimeThatCannotEnforceACostLimitIsAProblemOfItsWorkflow(t *testing.T) {
	t.Parallel()
	b := onC(plain())
	b.Workflows["v"] = bound("a").Workflows["w"]
	p := b.Processes["p"]
	limit := 2.0
	p.Limits.MaxCostUSD = &limit
	b.Processes["p"] = p
	if got := problemsOf(b); got != nil {
		t.Fatalf("before the runtime is asked: problems = %q", got)
	}
	if got, want := settings.CostProblems(b, b.Agents["c"]), []settings.Problem{{Subject: "workflow w", Message: "fan-out node one: process p: runtime plain cannot enforce the cost limit 2"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("agent c: problems = %+v, want %+v", got, want)
	}
	if got, want := settings.CostProblems(b, b.Agents["a"]), []settings.Problem{{Subject: "workflow v", Message: "fan-out node one: process p: runtime rt cannot enforce the cost limit 2"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("agent a: problems = %+v, want %+v", got, want)
	}
	if got := settings.CostProblems(bound("c"), b.Agents["c"]); got != nil {
		t.Fatalf("no cost limit: problems = %+v", got)
	}
}

// The rule a call and check share: a call under a cost limit runs only on
// a runtime that enforces one.
func TestACostLimitNeedsARuntimeThatEnforcesIt(t *testing.T) {
	t.Parallel()
	limit := 0.5
	for name, c := range map[string]struct {
		limit    *float64
		enforces bool
		want     string
	}{
		"a limit the runtime enforces":       {&limit, true, ""},
		"a limit the runtime cannot":         {&limit, false, "runtime rt cannot enforce the cost limit 0.5"},
		"no limit, on a runtime that cannot": {nil, false, ""},
	} {
		if got := settings.CostRefusal(policy.Effective{MaxCostUSD: c.limit}, "rt", c.enforces); got != c.want {
			t.Errorf("%s: refusal %q, want %q", name, got, c.want)
		}
	}
}

// writable is bound(agent) with process p allowing write beside read, and
// requiring what is given, on a runtime mapping rt that grants read on
// versions 1 and 2, and write on version 2 alone.
func writable(agent string, require ...string) settings.Bundle {
	b := bound(agent)
	p := b.Processes["p"]
	p.Limits.Allow, p.Limits.Require = []string{"read", "write"}, require
	b.Processes["p"] = p
	rt := b.Mappings["rt"]
	rt.Offer = offering(
		enforce.Primitive{Name: "Read", Grants: []string{"read"}, Verified: []string{"1.", "2."}},
		enforce.Primitive{Name: "Write", Grants: []string{"write"}, Verified: []string{"2."}},
	)
	b.Mappings["rt"] = rt
	return b
}

// ADR-030 rules 7 and 8: every node of every workflow is planned as its
// call would be, on the agent it binds its process to (a node that names
// none does not parse): the permissions allowed and not required that the
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
	onC.Agents["c"] = settings.Agent{Name: "c", Runtime: "rt", Effort: "high"}
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
