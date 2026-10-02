package settings_test

import (
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

func timeout(d time.Duration) *time.Duration { return &d }

func bundle() settings.Bundle {
	return settings.Bundle{
		Service: &definition.Service{MaxTimeout: time.Hour, MaxAttempts: 1, Permissions: []string{"read", "write", "exec"}},
		Agents: map[string]definition.Agent{
			"a": {Name: "a", Runtime: "rt", Effort: "high", ModelFamily: "f"},
		},
		Mappings: map[string]definition.Mapping{
			"rt": {Name: "rt", Adapter: "claude-code", Efforts: []string{"high"}, Select: "any",
				Primitives: []definition.Primitive{{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}}}},
		},
		Policies: map[string]definition.Policy{
			"pol": {Name: "pol", Limits: definition.Limits{Timeout: timeout(time.Minute), Allow: []string{"read"}, AllowSet: true}},
		},
		Processes: map[string]definition.Process{
			"p": {Name: "p", Agent: "a", Policy: "pol", Output: definition.Output{Format: "json", Schema: "s"},
				Values: []definition.Value{{Name: "v", Source: "param"}}},
		},
		Schemas: map[string]bool{"s": true},
	}
}

var mechanisms = settings.Mechanisms{Sources: []string{"param"}, Adapters: []string{"claude-code"}}

func TestConsistentSettingsHaveNoProblems(t *testing.T) {
	if problems := settings.Check(bundle(), mechanisms); len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}
}

func TestEveryInconsistencyIsReported(t *testing.T) {
	b := bundle()
	b.Agents["b"] = definition.Agent{Name: "b", Runtime: "missing"}
	b.Agents["a"] = definition.Agent{Name: "a", Runtime: "rt", Effort: "max"}
	b.Mappings["rt2"] = definition.Mapping{Name: "rt2", Adapter: "gemini", Select: "any", Primitives: []definition.Primitive{{Name: "X", Grants: []string{"teleport"}}}}
	b.Policies["bad"] = definition.Policy{Name: "bad", Limits: definition.Limits{Allow: []string{"fly"}}}
	b.Processes["p"] = definition.Process{Name: "p", Agent: "a", Policy: "pol",
		Output: definition.Output{Format: "json", Schema: "gone"},
		Values: []definition.Value{{Name: "v", Source: "http.get"}}}
	b.Processes["q"] = definition.Process{Name: "q", Agent: "a", Policy: "nope", Output: definition.Output{Format: "text"}}
	b.Processes["r"] = definition.Process{Name: "r", Agent: "a", Output: definition.Output{Format: "text"},
		Limits: definition.Limits{Timeout: timeout(time.Minute), Allow: []string{"write"}, AllowSet: true}, Require: []string{"write"}}

	var got []string
	for _, p := range settings.Check(b, mechanisms) {
		got = append(got, p.String())
	}
	joined := strings.Join(got, "\n")
	for _, want := range []string{
		`agent a: effort "max" is not supported by rt`,
		`agent b: runtime mapping "missing" does not exist`,
		`policy bad: unknown permission "fly"`,
		`process p: input v: unknown source "http.get"`,
		`process p: output schema "gone" does not exist`,
		`process q: policy "nope" does not exist`,
		`process r: cannot run on agent a's runtime rt`,
		`runtime mapping rt2: unknown adapter "gemini"`,
		`runtime mapping rt2: grants permissions not in the vocabulary: teleport`,
		`runtime mapping rt2: verifies no primitive`,
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in:\n%s", want, joined)
		}
	}
}

func TestMissingServiceStopsEarly(t *testing.T) {
	b := bundle()
	b.Service = nil
	if problems := settings.Check(b, mechanisms); len(problems) != 1 || problems[0].Subject != "service" {
		t.Fatalf("problems = %v", problems)
	}
}

// Before the runtime's version is known, a plan may use only primitives
// verified for some version.
func TestUnverifiedPrimitivesCannotSatisfyARequirement(t *testing.T) {
	b := bundle()
	rt := b.Mappings["rt"]
	rt.Primitives = append(rt.Primitives, definition.Primitive{Name: "Edit", Grants: []string{"write"}})
	b.Mappings["rt"] = rt
	b.Processes["w"] = definition.Process{Name: "w", Agent: "a", Output: definition.Output{Format: "text"},
		Limits: definition.Limits{Timeout: timeout(time.Minute), Allow: []string{"write"}, AllowSet: true}, Require: []string{"write"}}

	problems := settings.Check(b, mechanisms)
	if len(problems) != 1 || !strings.Contains(problems[0].String(), "process w: cannot run on agent a's runtime rt: ") ||
		!strings.Contains(problems[0].String(), "(not verified for version 1: Edit)") {
		t.Fatalf("problems = %v", problems)
	}
}

// A call runs on one version, so primitives verified for different versions
// cannot together satisfy a requirement.
func TestRequirementsNeedOneVersionThatCoversThem(t *testing.T) {
	b := bundle()
	b.Mappings["rt"] = definition.Mapping{Name: "rt", Adapter: "claude-code", Efforts: []string{"high"}, Select: "any",
		Primitives: []definition.Primitive{
			{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}},
			{Name: "Edit", Grants: []string{"write"}, Verified: []string{"2."}},
		}}
	b.Processes["w"] = definition.Process{Name: "w", Agent: "a", Output: definition.Output{Format: "text"},
		Limits: definition.Limits{Timeout: timeout(time.Minute), Allow: []string{"read", "write"}, AllowSet: true}, Require: []string{"read", "write"}}

	problems := settings.Check(b, mechanisms)
	if len(problems) != 1 || !strings.Contains(problems[0].String(), "process w: cannot run on agent a's runtime rt: ") ||
		!strings.Contains(problems[0].String(), "required permissions would be withheld") ||
		!strings.Contains(problems[0].String(), "not verified for version") {
		t.Fatalf("problems = %v", problems)
	}

	// One version that covers both is enough.
	rt := b.Mappings["rt"]
	rt.Primitives[1].Verified = []string{"1.", "2."}
	if problems := settings.Check(b, mechanisms); len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}
}

// A problem that names a mechanism the code does not provide, an adapter
// or an input source, is marked: settings written for a newer Agister
// name ones this code lacks. Other problems are not.
func TestProblemsNamingUnknownMechanismsAreMarked(t *testing.T) {
	b := bundle()
	b.Mappings["rt2"] = definition.Mapping{Name: "rt2", Adapter: "opencode", Select: "any", Primitives: []definition.Primitive{{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}}}}
	b.Processes["p"] = definition.Process{Name: "p", Agent: "a", Policy: "pol",
		Output: definition.Output{Format: "json", Schema: "gone"},
		Values: []definition.Value{{Name: "v", Source: "git.future"}}}
	b.Workflows = map[string]definition.Workflow{"w": {Name: "w", Values: []definition.Value{{Name: "v", Source: "git.future"}},
		FanOut: []definition.Node{{Name: "n", Process: "p"}}, Join: definition.Node{Name: "j", Process: "p"}}}

	unknown := map[string]bool{}
	for _, p := range settings.Check(b, mechanisms) {
		unknown[p.String()] = p.Unknown
	}
	for problem, want := range map[string]bool{
		`runtime mapping rt2: unknown adapter "opencode" (available: claude-code)`: true,
		`process p: input v: unknown source "git.future" (available: param)`:       true,
		`workflow w: input v: unknown source "git.future" (available: param)`:      true,
		`process p: output schema "gone" does not exist`:                           false,
	} {
		if got, ok := unknown[problem]; !ok || got != want {
			t.Errorf("%s: reported %t, marked %t, want marked %t; problems: %v", problem, ok, got, want, unknown)
		}
	}
}
