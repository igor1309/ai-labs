package settings_test

import (
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// ADR-014 rule 4: a prompt is part of the process that names it, so one
// the settings lack is a problem of that process.
func TestAProcessNamingAPromptTheSettingsLackHasAProblem(t *testing.T) {
	t.Parallel()
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

// ADR-019 rule 4: a prompt the settings lack is not a problem when the
// input naming it is optional; a required input naming the same prompt
// still is.
func TestAMissingOptionalPromptIsNoProblem(t *testing.T) {
	t.Parallel()
	b := bundle()
	p := b.Processes["p"]
	optional := definition.Value{Name: "go", Source: definition.PromptSource, Args: map[string]string{"name": "go_tests", "optional": "true"}}
	p.Values = append(p.Values, optional)
	b.Processes["p"] = p
	sources := settings.Mechanisms{Sources: []string{"param", definition.PromptSource}, Adapters: mechanisms.Adapters}
	if problems := settings.Check(b, sources); len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}

	p.Values = append(p.Values, definition.Value{Name: "rules", Source: definition.PromptSource, Args: map[string]string{"name": "go_tests"}})
	b.Processes["p"] = p
	var got []string
	for _, problem := range settings.Check(b, sources) {
		got = append(got, problem.String())
	}
	if want := `process p: input rules: prompt "go_tests" does not exist`; len(got) != 1 || got[0] != want {
		t.Fatalf("problems = %q, want %q", got, want)
	}
}
