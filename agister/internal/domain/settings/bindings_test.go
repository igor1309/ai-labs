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
