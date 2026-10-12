package settings_test

import (
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

func timeout(d time.Duration) *time.Duration { return &d }

// reading are the limits of process, which reads, for a minute.
func reading(process string) policy.Declared {
	return policy.Declared{Process: process, Timeout: timeout(time.Minute), Allow: []string{"read"}}
}

// allowing are the limits of process, which may use allow, for a minute.
func allowing(process string, allow ...string) policy.Declared {
	return policy.Declared{Process: process, Timeout: timeout(time.Minute), Allow: allow}
}

// offering is the offer of any of primitives.
func offering(primitives ...enforce.Primitive) enforce.Offer {
	return enforce.Offer{Primitives: primitives}
}

func bundle() settings.Bundle {
	return settings.Bundle{
		Service: &settings.Service{Ceilings: policy.Ceilings{MaxTimeout: time.Hour, MaxAttempts: 1, Permissions: []string{"read", "write", "exec"}}},
		Agents: map[string]settings.Agent{
			"a": {Name: "a", Runtime: "rt", Effort: "high"},
		},
		Mappings: map[string]settings.Mapping{
			"rt": {Name: "rt", Adapter: "claude-code", Efforts: []string{"high"},
				Offer: offering(enforce.Primitive{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}})},
		},
		Processes: map[string]settings.Process{
			"p": {Name: "p", Schema: "s", Values: []settings.Value{{Name: "v", Source: "param"}}, Limits: reading("p")},
		},
		Schemas: map[string]bool{"s": true},
	}
}

var mechanisms = settings.Mechanisms{Sources: []string{"param"}, Adapters: []string{"claude-code"}}

func TestConsistentSettingsHaveNoProblems(t *testing.T) {
	t.Parallel()
	if problems := settings.Check(bundle(), mechanisms); len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}
}

func TestEveryInconsistencyIsReported(t *testing.T) {
	t.Parallel()
	b := bundle()
	b.Agents["b"] = settings.Agent{Name: "b", Runtime: "missing"}
	b.Agents["a"] = settings.Agent{Name: "a", Runtime: "rt", Effort: "max"}
	b.Mappings["rt2"] = settings.Mapping{Name: "rt2", Adapter: "gemini", Offer: offering(enforce.Primitive{Name: "X", Grants: []string{"teleport"}})}
	b.Processes["p"] = settings.Process{Name: "p", Schema: "gone",
		Values: []settings.Value{{Name: "v", Source: "http.get"}}, Limits: reading("p")}
	b.Processes["q"] = settings.Process{Name: "q", Limits: allowing("q", "fly")}
	r := allowing("r", "write")
	r.Require = []string{"write"}
	b.Processes["r"] = settings.Process{Name: "r", Limits: r}
	b = calling(b, "r", "a")

	var got []string
	for _, p := range settings.Check(b, mechanisms) {
		got = append(got, p.String())
	}
	joined := strings.Join(got, "\n")
	for _, want := range []string{
		`agent a: effort "max" is not supported by rt`,
		`agent b: runtime mapping "missing" does not exist`,
		`process p: input v: unknown source "http.get"`,
		`process p: output schema "gone" does not exist`,
		`process q: tools.allow: unknown permission "fly"`,
		`workflow w: call node work: process r: cannot run on agent a's runtime rt`,
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
	t.Parallel()
	b := bundle()
	b.Service = nil
	if problems := settings.Check(b, mechanisms); len(problems) != 1 || problems[0].Subject != "service" {
		t.Fatalf("problems = %v", problems)
	}
}

// Before the runtime's version is known, a plan may use only primitives
// verified for some version.
func TestUnverifiedPrimitivesCannotSatisfyARequirement(t *testing.T) {
	t.Parallel()
	b := bundle()
	rt := b.Mappings["rt"]
	rt.Offer.Primitives = append(rt.Offer.Primitives, enforce.Primitive{Name: "Edit", Grants: []string{"write"}})
	b.Mappings["rt"] = rt
	q := allowing("q", "write")
	q.Require = []string{"write"}
	b.Processes["q"] = settings.Process{Name: "q", Limits: q}
	b = calling(b, "q", "a")

	problems := settings.Check(b, mechanisms)
	if len(problems) != 1 || !strings.Contains(problems[0].String(), "workflow w: call node work: process q: cannot run on agent a's runtime rt: ") ||
		!strings.Contains(problems[0].String(), "(not verified for version 1: Edit)") {
		t.Fatalf("problems = %v", problems)
	}
}

// A call runs on one version, so primitives verified for different versions
// cannot together satisfy a requirement.
func TestRequirementsNeedOneVersionThatCoversThem(t *testing.T) {
	t.Parallel()
	b := bundle()
	b.Mappings["rt"] = settings.Mapping{Name: "rt", Adapter: "claude-code", Efforts: []string{"high"},
		Offer: offering(
			enforce.Primitive{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}},
			enforce.Primitive{Name: "Edit", Grants: []string{"write"}, Verified: []string{"2."}},
		)}
	q := allowing("q", "read", "write")
	q.Require = []string{"read", "write"}
	b.Processes["q"] = settings.Process{Name: "q", Limits: q}
	b = calling(b, "q", "a")

	problems := settings.Check(b, mechanisms)
	if len(problems) != 1 || !strings.Contains(problems[0].String(), "workflow w: call node work: process q: cannot run on agent a's runtime rt: ") ||
		!strings.Contains(problems[0].String(), "required permissions would be withheld") ||
		!strings.Contains(problems[0].String(), "not verified for version") {
		t.Fatalf("problems = %v", problems)
	}

	// One version that covers both is enough.
	rt := b.Mappings["rt"]
	rt.Offer.Primitives[1].Verified = []string{"1.", "2."}
	if problems := settings.Check(b, mechanisms); len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}
}

// A problem that names a mechanism the code does not provide, an adapter
// or an input source, is marked: settings written for a newer Agister
// name ones this code lacks. Other problems are not.
func TestProblemsNamingUnknownMechanismsAreMarked(t *testing.T) {
	t.Parallel()
	b := bundle()
	b.Mappings["rt2"] = settings.Mapping{Name: "rt2", Adapter: "opencode", Offer: offering(enforce.Primitive{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}})}
	b.Processes["p"] = settings.Process{Name: "p", Schema: "gone",
		Values: []settings.Value{{Name: "v", Source: "git.future"}}, Limits: reading("p")}
	b.Workflows = map[string]settings.Workflow{"w": {Name: "w", Values: []settings.Value{{Name: "v", Source: "git.future"}},
		FanOut: []settings.Node{{Name: "n", Process: "p", Agent: "a"}}, Join: settings.Node{Name: "j", Process: "p", Agent: "a"}}}

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
