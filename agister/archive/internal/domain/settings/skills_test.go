package settings_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// ADR-021 rule 4: a skill the settings lack is a problem of the agent or
// the process that names it.
func TestNamingASkillTheSettingsLackIsAProblemOfWhatNamesIt(t *testing.T) {
	t.Parallel()
	b := bundle()
	a := b.Agents["a"]
	a.Skills = []string{"style", "review"}
	b.Agents["a"] = a
	p := b.Processes["p"]
	p.Skills = []string{"review", "tests"}
	b.Processes["p"] = p
	b.Skills = map[string]bool{"review": true}

	var got []string
	for _, problem := range settings.Check(b, mechanisms) {
		got = append(got, problem.String())
	}
	if want := []string{`agent a: skill "style" does not exist`, `process p: skill "tests" does not exist`}; !reflect.DeepEqual(got, want) {
		t.Fatalf("problems = %q, want %q", got, want)
	}
	b.Skills["style"], b.Skills["tests"] = true, true
	if problems := settings.Check(b, mechanisms); len(problems) != 0 {
		t.Fatalf("with the skills: problems = %v", problems)
	}
}

// The problem is the agent's whatever else is wrong with it: one whose
// runtime mapping is missing still names a skill the settings lack.
func TestAnAgentWithoutItsMappingStillLacksItsSkill(t *testing.T) {
	t.Parallel()
	b := bundle()
	a := b.Agents["a"]
	a.Runtime, a.Skills = "missing", []string{"style"}
	b.Agents["a"] = a

	var got []string
	for _, problem := range settings.Check(b, mechanisms) {
		got = append(got, problem.String())
	}
	if want := []string{`agent a: skill "style" does not exist`, `agent a: runtime mapping "missing" does not exist`}; !reflect.DeepEqual(got, want) {
		t.Fatalf("problems = %q, want %q", got, want)
	}
}
