package settings_test

import (
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// ADR-011 rule 4: a prompt is part of the process that names it, so one
// the settings lack is a problem of that process.
func TestAProcessNamingAPromptTheSettingsLackHasAProblem(t *testing.T) {
	b := bundle()
	p := b.Processes["p"]
	p.Values = append(p.Values, definition.Value{Name: "rules", Source: definition.PromptSource, Args: map[string]string{"name": "review"}})
	b.Processes["p"] = p
	sources := settings.Mechanisms{Sources: []string{"param", definition.PromptSource}, Adapters: mechanisms.Adapters}

	var got []string
	for _, problem := range settings.Check(b, sources) {
		got = append(got, problem.String())
	}
	if want := `process p: input rules: prompt "review" does not exist`; len(got) != 1 || got[0] != want {
		t.Fatalf("problems = %q, want %q", got, want)
	}
	b.Prompts = map[string]bool{"review": true}
	if problems := settings.Check(b, sources); len(problems) != 0 {
		t.Fatalf("with the prompt: problems = %v", problems)
	}
}
