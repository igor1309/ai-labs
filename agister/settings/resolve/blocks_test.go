package resolve_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

const repoBlocks = "/repo/.agister/blocks.yaml"

// block is the block of the document of kind and name, on line of the
// repository's blocks.
func block(kind resolve.Kind, name string, line int) resolve.Block {
	return resolve.Block{Kind: kind, Name: name, Reason: "it writes to main", Origin: resolve.Origin{Path: repoBlocks, Line: line}}
}

// withPrompt is s holding the step "s" of the process "p", naming the
// prompt "pr", on the agent "a" of the runtime "r", as the workflow "w".
func withPrompt(s *source) *source {
	s.processes["p"] = resolve.Process{Name: "p", Prompt: resolve.Name{Value: "pr"}}
	s.other(resolve.KindPrompt, "pr")
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{step("s", "p", "a")}}
	s.pair("a", "r")
	return s
}

// blocks.feature, "A request that reaches a blocked document is refused,
// naming the block".
func TestARequestThatReachesABlockedDocumentIsRefusedNamingTheBlock(t *testing.T) {
	t.Parallel()
	s := withPrompt(newSource())
	blocked := block(resolve.KindProcess, "p", 1)
	s.blocks = []resolve.Block{blocked}

	got, faults := newResolver(t, s).Resolve(requestW)

	assertFaults(t, got, faults, resolve.Fault{
		Chain: []resolve.Link{
			{Kind: resolve.KindWorkflow, Name: "w"},
			{Kind: resolve.KindProcess, Name: "p", Place: "steps[0].process"},
		},
		Block: &blocked,
	})
	if asked := s.asked[ref(resolve.KindProcess, "p")] + s.asked[ref(resolve.KindPrompt, "pr")]; asked > 0 {
		t.Errorf("asked for the blocked process or its prompt %d times", asked)
	}
}

// blocks.feature, "A block on any document the request reaches refuses
// it".
func TestABlockOnAnyDocumentTheRequestReachesRefusesIt(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		request resolve.Request
		blocked resolve.Reference
	}{
		{requestW, ref(resolve.KindWorkflow, "w")},
		{resolve.Step("p", "a"), ref(resolve.KindProcess, "p")},
		{resolve.Step("p", "a"), ref(resolve.KindAgent, "a")},
		{resolve.Step("p", "a"), ref(resolve.KindRuntime, "r")},
		{resolve.Step("p", "a"), ref(resolve.KindPrompt, "pr")},
		{resolve.Document(resolve.KindAgent, "a"), ref(resolve.KindAgent, "a")},
	} {
		t.Run(string(test.blocked.Kind), func(t *testing.T) {
			t.Parallel()
			s := withPrompt(newSource())
			s.blocks = []resolve.Block{block(test.blocked.Kind, test.blocked.Name, 1)}

			got, faults := newResolver(t, s).Resolve(test.request)

			if len(faults) != 1 || faults[0].Block == nil || len(faults[0].Problems) > 0 {
				t.Fatalf("faults %+v, want one block", faults)
			}
			chain := faults[0].Chain
			if last := chain[len(chain)-1]; last.Kind != test.blocked.Kind || last.Name != test.blocked.Name {
				t.Errorf("blocked %v, want %v", last, test.blocked)
			}
			if !reflect.DeepEqual(got, resolve.Resolved{}) {
				t.Errorf("refused, yet resolved %+v", got)
			}
		})
	}
}

// blocks.feature, "A block on a document the request does not reach
// refuses nothing".
func TestABlockOnADocumentTheRequestDoesNotReachRefusesNothing(t *testing.T) {
	t.Parallel()
	s := withPrompt(newSource())
	s.processes["other"] = resolve.Process{Name: "other"}
	s.blocks = []resolve.Block{block(resolve.KindProcess, "other", 1)}

	got, faults := newResolver(t, s).Resolve(requestW)

	assertResolved(t, faults)
	if got.Warnings != nil {
		t.Errorf("warnings %+v, want none", got.Warnings)
	}
}

// blocks.feature, "A block naming no document is a warning".
func TestABlockNamingNoDocumentIsAWarning(t *testing.T) {
	t.Parallel()
	s := withPrompt(newSource())
	s.blocks = []resolve.Block{block(resolve.KindAgent, "gone", 2)}

	got, faults := newResolver(t, s).Resolve(requestW)

	assertResolved(t, faults)
	want := []resolve.Problem{{Path: repoBlocks, Line: 2, Message: `it blocks the agent "gone", which no layer holds`}}
	if !reflect.DeepEqual(got.Warnings, want) {
		t.Errorf("warnings\n got %+v\nwant %+v", got.Warnings, want)
	}
}

// blocks.feature, "A refusal gives no warning": neither a plan's extra nor
// a block naming no document.
func TestARefusalGivesNoWarning(t *testing.T) {
	t.Parallel()
	s := withPrompt(newSource())
	s.processes["p"] = resolve.Process{
		Name: "p", Prompt: resolve.Name{Value: "pr"}, Params: []resolve.Param{{Name: "x"}}, Allow: []string{"read"},
	}
	s.runtimes["r"] = resolve.Runtime{Name: "r", Contract: resolve.Name{Value: able}, Grants: []string{"read", "net"}}
	s.blocks = []resolve.Block{block(resolve.KindAgent, "gone", 2)}
	item := step("s", "p", "a")
	item.Inputs = []resolve.Binding{from("x", param("head"), 4)}
	s.workflows["w"] = resolve.Workflow{Name: "w", Steps: []resolve.Item{item}}

	got, faults := newResolver(t, s).Resolve(requestW)

	assertFaults(t, got, faults, resolve.Fault{
		Chain:    []resolve.Link{{Kind: resolve.KindWorkflow, Name: "w"}},
		Problems: []resolve.Problem{problemOfW(4, "steps[0].inputs.x", `its workflow declares the param "head"`)},
	})
}
