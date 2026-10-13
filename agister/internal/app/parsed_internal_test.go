package app

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// naming are the parsed settings of process p, which names verify:repo,
// and that verification as given, within a service whose
// max_verify_attempts is 3.
func naming(verify definition.Verify) parsedSettings {
	timeout := time.Minute
	return parsedSettings{
		service: &serviceSettings{ceilings: policy.Ceilings{MaxTimeout: time.Hour, MaxAttempts: 1, MaxVerifyAttempts: 3, Permissions: []string{"read", "write", "exec"}}},
		agents:  map[string]definition.Agent{"a": {Name: "a", Runtime: "rt", Effort: "high"}},
		mappings: map[string]runtimeMapping{"rt": {name: "rt", adapter: "claude-code", efforts: []string{"high"},
			offer: enforce.Offer{Primitives: []enforce.Primitive{{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}}}}}},
		processes: map[string]definition.Process{"p": {Name: "p", Output: definition.Output{Format: "json", Schema: "s"},
			Values: []definition.Value{{Name: "v", Source: "param"}}, Session: definition.SessionResumable, Revision: "v", VerifyName: "repo",
			Limits: definition.Limits{Timeout: &timeout, Allow: []string{"read"}, AllowSet: true}}},
		schemas:  map[string]bool{"s": true},
		verifies: map[string]definition.Verification{"repo": {Name: "repo", Verify: verify}},
	}
}

// problemsOf are the problems settings finds in the parsed settings.
func problemsOf(parsed parsedSettings) []string {
	var got []string
	for _, problem := range settings.Check(parsed.bundle(), settings.Mechanisms{Sources: []string{"param"}, Adapters: []string{"claude-code"}}) {
		got = append(got, problem.String())
	}
	return got
}

// ADR-010 rule 3: the checks that depend on a verification's values are
// made on the named one's, as on an inline block's.
func TestANamedVerificationIsCheckedWithTheProcessThatNamesIt(t *testing.T) {
	t.Parallel()
	fine := definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: 3, Instruction: "Fix it."}
	cases := []struct {
		name   string
		change func(*parsedSettings)
		want   string // the one problem; empty for none
	}{
		{"within the limits", func(*parsedSettings) {}, ""},
		{"timeout above the process's", func(p *parsedSettings) {
			v := p.verifies["repo"]
			v.Verify.Timeout = 2 * time.Minute
			p.verifies["repo"] = v
		}, "process p: verify.timeout 2m0s exceeds the effective timeout 1m0s"},
		{"attempts above the service ceiling", func(p *parsedSettings) {
			v := p.verifies["repo"]
			v.Verify.MaxAttempts = 4
			p.verifies["repo"] = v
		}, "process p: verify.max_attempts 4 exceeds the service limit max_verify_attempts 3"},
		{"repairs in a fresh-only process", func(p *parsedSettings) {
			process := p.processes["p"]
			process.Session = definition.SessionFresh
			p.processes["p"] = process
		}, "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"},
		// Rule 4: the other checks of the process run, without verify values.
		{"no such verification", func(p *parsedSettings) {
			p.verifies = nil
			process := p.processes["p"]
			process.Session = definition.SessionFresh
			p.processes["p"] = process
		}, ""},
		{"no such verification, another problem", func(p *parsedSettings) {
			p.verifies = nil
			delete(p.schemas, "s")
		}, `process p: output schema "s" does not exist`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			parsed := naming(fine)
			c.change(&parsed)
			got := problemsOf(parsed)
			if c.want == "" && len(got) != 0 || c.want != "" && (len(got) != 1 || got[0] != c.want) {
				t.Fatalf("problems = %q, want %q", got, c.want)
			}
		})
	}
}

func TestResolvedLeavesAnInlineVerifyAndTheParsedSettingsAsTheyAre(t *testing.T) {
	t.Parallel()
	parsed := naming(definition.Verify{Command: "true", Timeout: time.Minute, MaxAttempts: 1, Instruction: "Fix it."})
	if got := parsed.resolved("p").Verify; got == nil || got.Command != "true" || parsed.processes["p"].Verify != nil {
		t.Fatalf("resolved verify %+v, the parsed one's %+v", got, parsed.processes["p"].Verify)
	}
	inline := &definition.Verify{Command: "inline"}
	parsed.processes["q"] = definition.Process{Name: "q", Verify: inline}
	if got := parsed.resolved("q").Verify; got != inline {
		t.Fatalf("inline verify = %+v", got)
	}
}

// ADR-030 rules 2 and 3: a process that sets no session is fresh-only, so
// one that repairs has the problem a fresh-only one has.
func TestAProcessThatSetsNoSessionIsFreshOnly(t *testing.T) {
	t.Parallel()
	const repairs = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
	for session, want := range map[string][]string{
		definition.SessionFresh:     {repairs},
		definition.SessionResumable: nil,
		"":                          {repairs},
	} {
		parsed := naming(definition.Verify{Command: "go test ./...", Timeout: time.Minute, MaxAttempts: 3, Instruction: "Fix it."})
		process := parsed.processes["p"]
		process.Session = session
		parsed.processes["p"] = process
		if got := problemsOf(parsed); !reflect.DeepEqual(got, want) {
			t.Errorf("session %q: problems = %q, want %q", session, got, want)
		}
	}
}
