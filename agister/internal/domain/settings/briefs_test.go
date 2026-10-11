package settings_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// ADR-026 rule 8: a brief form the settings lack is a problem of the
// process or the workflow whose input names it, as a missing prompt or
// schema is.
func TestNamingABriefTheSettingsLackIsAProblemOfWhatNamesIt(t *testing.T) {
	t.Parallel()
	b := bundle()
	p := b.Processes["p"]
	p.Values = []definition.Value{{Name: "v", Source: "param"},
		{Name: "brief", Source: definition.FileSource, Args: map[string]string{"path": "brief.md"}, Forms: []string{"goal", "step"}}}
	b.Processes["p"] = p
	b.Workflows = map[string]definition.Workflow{"w": {Name: "w",
		Values: []definition.Value{{Name: "goal", Source: definition.FileSource, Args: map[string]string{"path": "goal.md"}, Forms: []string{"goal"}}},
		FanOut: []definition.Node{{Name: "n", Process: "p", Agent: "a"}}, Join: definition.Node{Name: "j", Process: "p", Agent: "a"}}}
	b.Briefs = map[string]bool{"step": true}
	// Only a file value names forms: the settings offer the file source.
	files := settings.Mechanisms{Sources: []string{"param", definition.FileSource}, Adapters: mechanisms.Adapters}

	// The workflow's other problems are not the briefs'.
	briefProblems := func() []string {
		var got []string
		for _, problem := range settings.Check(b, files) {
			if strings.HasSuffix(problem.String(), "does not exist") {
				got = append(got, problem.String())
			}
		}
		return got
	}
	if got, want := briefProblems(), []string{`process p: input brief: brief "goal" does not exist`, `workflow w: input goal: brief "goal" does not exist`}; !reflect.DeepEqual(got, want) {
		t.Fatalf("problems = %q, want %q", got, want)
	}
	b.Briefs["goal"] = true
	if got := briefProblems(); got != nil {
		t.Fatalf("with the briefs: problems = %q", got)
	}
}
