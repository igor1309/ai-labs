package definition_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

func doc(kind definition.Kind, name, text string) definition.Document {
	return definition.Document{Source: definition.Source{Kind: kind, Name: name, Path: name}, Bytes: []byte(text)}
}

// Every shipped example parses.
func TestExamplesParse(t *testing.T) {
	settings := examples.Settings()
	err := fs.WalkDir(settings, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, _ := fs.ReadFile(settings, path)
		name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		kind := definition.Kind(filepath.Dir(path))
		var parseErr error
		switch kind {
		case ".":
			_, parseErr = definition.ParseService(doc(definition.KindService, "service", string(data)))
		case definition.KindAgent:
			_, parseErr = definition.ParseAgent(doc(kind, name, string(data)))
		case definition.KindProcess:
			_, parseErr = definition.ParseProcess(doc(kind, name, string(data)))
		case definition.KindPolicy:
			_, parseErr = definition.ParsePolicy(doc(kind, name, string(data)))
		case definition.KindRuntime:
			_, parseErr = definition.ParseMapping(doc(kind, name, string(data)))
		}
		if parseErr != nil {
			t.Errorf("%s: %v", path, parseErr)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// The research policy parses as written.
func TestResearchPolicyParsesInPlace(t *testing.T) {
	data, err := os.ReadFile("../../../../research/agister/research/verger/policies/static-review.yaml")
	if err != nil {
		t.Fatal(err)
	}
	policy, err := definition.ParsePolicy(doc(definition.KindPolicy, "static-review", string(data)))
	if err != nil {
		t.Fatal(err)
	}
	limits := policy.Limits
	if limits.Timeout.String() != "20m0s" || strings.Join(limits.Allow, ",") != "repository.read,repository.diff,repository.search" ||
		strings.Join(limits.Deny, ",") != "repository.write,repository.history.write,process.execute,network" ||
		limits.Access != "read-only" || limits.Scope != "candidate" {
		t.Fatalf("limits = %+v", limits)
	}
	// Without on_unknown, missing provenance fails: unknown is never satisfaction.
	if len(limits.Constraints) != 1 || limits.Constraints[0].CandidateInput != "candidate_revision" || limits.Constraints[0].OnUnknown != "fail" {
		t.Fatalf("constraints = %+v", limits.Constraints)
	}
}

func TestProcessParsing(t *testing.T) {
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", `
schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Do it.
  params:
    base: {default: main}
    focus: {}
  values:
    diff: {source: git.diff, base: "${param.base}", head: HEAD}
    focus: {source: param, name: focus}
workspace:
  checkout: diff
tools:
  require: [repository.read]
output:
  format: json
  schema: s
  require_valid: true
  result: {field: verdict, reject: [no]}
`))
	if err != nil {
		t.Fatal(err)
	}
	if process.Values[0].Name != "diff" || process.Values[1].Name != "focus" {
		t.Fatalf("value order not preserved: %+v", process.Values)
	}
	if bound := process.Values[0].Bind(map[string]string{"base": "trunk"}); bound["base"] != "trunk" || bound["head"] != "HEAD" {
		t.Fatalf("bound = %v", bound)
	}
	if process.Params[0].Default != "main" || process.Params[1].HasDefault || process.Require[0] != "repository.read" || process.Output.Reject[0] != "no" {
		t.Fatalf("process = %+v", process)
	}
}

func TestStrictParsingReportsEveryProblem(t *testing.T) {
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", `
schema: agister.process/v1alpha1
name: other
type: process
uses: reviewer
surprise: 1
timeout: soon
input:
  instruction: x
  values:
    v: {source: file, path: "${param.missing}"}
workspace:
  checkout: nothing
output:
  format: json
  schema: s
  require_valid: false
constraints:
  agent.model_family: {not_equal: task.claim, on_unsatisfied: fail}
`))
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, want := range []string{
		`surprise: unknown field`,
		`name: "other" does not match`,
		`uses: must be "agent:<name>"`,
		`timeout: invalid duration "soon"`,
		`refers to ${param.missing}`,
		`workspace.checkout: "nothing" is not an input value`,
		`output.require_valid: must be true`,
		`supported form: evidence.candidate`,
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("missing %q in:\n%v", want, err)
		}
	}
}

func TestMappingVerification(t *testing.T) {
	mapping, err := definition.ParseMapping(doc(definition.KindRuntime, "r", `
schema: agister.runtime/v1alpha1
name: r
adapter: a
contract: a/1
verified_versions: ["2.1."]
primitives:
  select: any
  items:
    X: {grants: [p.one, p.two]}
`))
	if err != nil {
		t.Fatal(err)
	}
	if !mapping.Verified("2.1.283") || mapping.Verified("2.2.0") || mapping.Verified("12.1.0") {
		t.Fatal("verified prefixes")
	}
	if unknown := mapping.UnknownPermissions([]string{"p.one"}); strings.Join(unknown, ",") != "p.two" {
		t.Fatalf("unknown = %v", unknown)
	}
}

func TestAgentRoundTrip(t *testing.T) {
	agent := definition.Agent{Name: "r", Runtime: "claude-code", Model: "opus", ModelFamily: "anthropic", Effort: "high"}
	parsed, err := definition.ParseAgent(doc(definition.KindAgent, "r", string(definition.FormatAgent(agent))))
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Name != "r" || parsed.Model != "opus" || parsed.ModelFamily != "anthropic" || parsed.Session != "fresh-only" {
		t.Fatalf("parsed = %+v", parsed)
	}
	if _, err := definition.ParseAgent(doc(definition.KindAgent, "r", "schema = \"agister.agent/v1alpha1\"\nname = \"r\"\nruntime = \"x\"\ncolour = \"red\"\n")); err == nil || !strings.Contains(err.Error(), "colour: unknown field") {
		t.Fatalf("err = %v", err)
	}
}
