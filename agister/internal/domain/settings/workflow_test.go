package settings_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// calling is the bundle with workflow w made one call (ADR-030 rule 6):
// node work, which binds process to agent.
func calling(b settings.Bundle, process, agent string) settings.Bundle {
	b.Workflows = map[string]settings.Workflow{"w": {Name: "w", Call: &settings.Node{Name: "work", Process: process, Agent: agent}}}
	return b
}

// ADR-030 rule 6: a workflow of one call passes and joins nothing; its
// node binds a process that exists, is work and does not take the
// collection, to an agent that exists, on which the process can run. Each
// problem names the call node.
func TestAWorkflowOfOneCallIsCheckedAsItsNode(t *testing.T) {
	t.Parallel()
	based := calling(bundle(), "p", "a")
	based.Bases = map[string][]string{"p": {"q"}}
	for name, c := range map[string]struct {
		bundle settings.Bundle
		want   []string
	}{
		"it binds a process to an agent": {calling(bundle(), "p", "a"), nil},
		"its agent does not exist":       {calling(bundle(), "p", "ghost"), []string{`workflow w: call node work: agent "ghost" does not exist`}},
		"its process does not exist":     {calling(bundle(), "nothing", "a"), []string{`workflow w: call node work: process "nothing" does not exist`}},
		"its process is a base":          {based, []string{"workflow w: call node work: process p is a base of q, not work (ADR-030 rule 9): bind a process that extends it"}},
		"its process takes the collection": {calling(bound("a"), "j", "a"),
			[]string{"workflow w: call node work: process j takes the collection (input gathered), which only a join receives"}},
		// On its runtime: an agent holds no session to refuse it by.
		"its process cannot run on its agent": {calling(onC(wide()), "p", "c"),
			[]string{"workflow w: call node work: process p: cannot run on agent c's runtime wide: cannot enforce the effective permissions: Shell also grants exec"}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := problemsOf(c.bundle); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}
