package app

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
	"github.com/igor1309/ai-labs/agister/internal/domain/settings"
)

// naming are the parsed settings of process p, which is resumable and
// names verify:repo, and that verification as given, within a service
// whose max_verify_attempts is 3.
func naming(verify verifyValues) parsedSettings {
	timeout := time.Minute
	return parsedSettings{
		service: &serviceSettings{ceilings: policy.Ceilings{MaxTimeout: time.Hour, MaxAttempts: 1, MaxVerifyAttempts: 3, Permissions: []string{"read", "write", "exec"}}},
		agents:  map[string]agentProfile{"a": {name: "a", runtime: "rt", effort: "high"}},
		mappings: map[string]runtimeMapping{"rt": {name: "rt", adapter: "claude-code", efforts: []string{"high"},
			offer: enforce.Offer{Primitives: []enforce.Primitive{{Name: "Read", Grants: []string{"read"}, Verified: []string{"1."}}}}}},
		processes: map[string]declaredProcess{"p": {name: "p", output: processOutput{format: "json", schema: "s"},
			values: []declaredValue{{name: "v", source: "param"}}, resumable: true, revision: "v", verifyName: "repo",
			limits: policy.Declared{Process: "p", Timeout: &timeout, Allow: []string{"read"}, Pinned: true}}},
		schemas:  map[string]bool{"s": true},
		verifies: map[string]declaredVerification{"repo": {name: "repo", verify: verify}},
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
	fine := verifyValues{command: "go test ./...", timeout: time.Minute, maxAttempts: 3, instruction: "Fix it."}
	cases := []struct {
		name   string
		change func(*parsedSettings)
		want   string // the one problem; empty for none
	}{
		{"within the limits", func(*parsedSettings) {}, ""},
		{"timeout above the process's", func(p *parsedSettings) {
			v := p.verifies["repo"]
			v.verify.timeout = 2 * time.Minute
			p.verifies["repo"] = v
		}, "process p: verify.timeout 2m0s exceeds the effective timeout 1m0s"},
		{"attempts above the service ceiling", func(p *parsedSettings) {
			v := p.verifies["repo"]
			v.verify.maxAttempts = 4
			p.verifies["repo"] = v
		}, "process p: verify.max_attempts 4 exceeds the service limit max_verify_attempts 3"},
		{"repairs in a fresh-only process", func(p *parsedSettings) {
			process := p.processes["p"]
			process.resumable = false
			p.processes["p"] = process
		}, "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"},
		// Rule 4: the other checks of the process run, without verify values.
		{"no such verification", func(p *parsedSettings) {
			p.verifies = nil
			process := p.processes["p"]
			process.resumable = false
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
	want := verifyValues{command: "true", timeout: time.Minute, maxAttempts: 1, instruction: "Fix it."}
	parsed := naming(want)
	if got := parsed.resolved("p").verify; got == nil || !reflect.DeepEqual(*got, want) || parsed.processes["p"].verify != nil {
		t.Fatalf("resolved verify %+v, the parsed one's %+v", got, parsed.processes["p"].verify)
	}
	inline := &verifyValues{command: "inline"}
	parsed.processes["q"] = declaredProcess{name: "q", verify: inline}
	if got := parsed.resolved("q").verify; got != inline {
		t.Fatalf("inline verify = %+v", got)
	}
}

// ADR-030 rule 3: a process whose session may not be resumed cannot
// repair, and one whose session may be has no such problem.
func TestAProcessThatRepairsMustBeResumable(t *testing.T) {
	t.Parallel()
	const repairs = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
	for resumable, want := range map[bool][]string{
		false: {repairs},
		true:  nil,
	} {
		parsed := naming(verifyValues{command: "go test ./...", timeout: time.Minute, maxAttempts: 3, instruction: "Fix it."})
		process := parsed.processes["p"]
		process.resumable = resumable
		parsed.processes["p"] = process
		if got := problemsOf(parsed); !reflect.DeepEqual(got, want) {
			t.Errorf("resumable %t: problems = %q, want %q", resumable, got, want)
		}
	}
}
