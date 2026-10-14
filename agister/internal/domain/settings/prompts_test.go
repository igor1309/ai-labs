package settings_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// ADR-028 rule 8, after ADR-014 rule 4: a process's prompt and each of its
// guidance prompts are part of it, so one no layer has is a problem of the
// process, whether its prompt or its guidance names it.
func TestAProcessNamingAPromptTheSettingsLackHasAProblem(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		prompts map[string]bool
		want    []string
	}{
		"every prompt there": {map[string]bool{"review": true, "style": true, "testing": true}, nil},
		"the prompt missing": {map[string]bool{"style": true, "testing": true}, []string{`process p: prompt "review" does not exist`}},
		"a guidance prompt missing": {map[string]bool{"review": true, "testing": true},
			[]string{`process p: guidance: prompt "style" does not exist`}},
		"none there": {nil, []string{
			`process p: prompt "review" does not exist`,
			`process p: guidance: prompt "style" does not exist`,
			`process p: guidance: prompt "testing" does not exist`,
		}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			b := bundle()
			p := b.Processes["p"]
			p.Prompt, p.Guidance = "review", []string{"style", "testing"}
			b.Processes["p"] = p
			b.Prompts = c.prompts

			var got []string
			for _, problem := range settings.Check(b, mechanisms) {
				got = append(got, problem.String())
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}
