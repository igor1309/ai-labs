package policy_test

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

var service = definition.Service{
	MaxTimeout:  time.Hour,
	MaxAttempts: 1,
	Permissions: []string{"repository.read", "repository.search", "repository.diff", "repository.history.read", "repository.write", "repository.history.write", "process.execute", "network"},
}

func researchPolicy(t *testing.T) definition.Policy {
	data, err := os.ReadFile("../../../../research/agister/research/verger/policies/static-review.yaml")
	if err != nil {
		t.Fatal(err)
	}
	pol, err := definition.ParsePolicy(definition.Document{Source: definition.Source{Name: "static-review"}, Bytes: data})
	if err != nil {
		t.Fatal(err)
	}
	return pol
}

func process(t *testing.T, extra string) definition.Process {
	p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "review"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: review
type: process
uses: agent:reviewer
policy: process-policy:static-review
input:
  instruction: Review.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
workspace:
  checkout: candidate_revision
output:
  format: text
` + extra)})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestResearchStaticReviewComposes(t *testing.T) {
	pol := researchPolicy(t)
	effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(effective.Permissions, ",") != "repository.read,repository.diff,repository.search" ||
		effective.Access != "read-only" || effective.Scope != "candidate" || effective.Timeout != 20*time.Minute {
		t.Fatalf("effective = %+v", effective)
	}
}

func TestNarrowingIsEnforcedFieldByField(t *testing.T) {
	pol := researchPolicy(t)
	cases := map[string]string{
		"timeout: 30m": "timeout: 30m0s widens the policy's 20m0s",
		"tools: {allow: [repository.read, network]}":                    "tools.allow: adds network, which policy static-review does not allow",
		"workspace: {access: read-write, checkout: candidate_revision}": "workspace.access: read-write widens",
		"workspace: {scope: repository, checkout: candidate_revision}":  "scope cannot be overridden",
		"retry: {max_attempts: 3}":                                      "retry.max_attempts: 3 widens",
		"constraints:\n  agent.model_family: {not_equal: evidence.candidate(input.candidate_revision).provenance.writer.model_family, on_unsatisfied: fail}": "constraints can only be added",
		"tools: {allow: [teleport]}": `unknown permission "teleport"`,
	}
	for extra, want := range cases {
		var p definition.Process
		if strings.HasPrefix(extra, "workspace:") {
			p = mustProcessWithWorkspace(t, extra)
		} else {
			p = process(t, extra)
		}
		_, err := policy.Compose(service, &pol, p, policy.Caller{})
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", extra, err, want)
		}
	}
}

// mustProcessWithWorkspace replaces the base workspace block.
func mustProcessWithWorkspace(t *testing.T, workspace string) definition.Process {
	p, err := definition.ParseProcess(definition.Document{Source: definition.Source{Name: "review"}, Bytes: []byte(`
schema: agister.process/v1alpha1
name: review
type: process
uses: agent:reviewer
policy: process-policy:static-review
input:
  instruction: Review.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
output:
  format: text
` + workspace)})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestNarrowingInThePermittedDirection(t *testing.T) {
	pol := researchPolicy(t)
	effective, err := policy.Compose(service, &pol, process(t, `
timeout: 5m
tools: {allow: [repository.read]}
isolation: {deny: [repository.search]}
resources: [gpu]
`), policy.Caller{})
	if err != nil {
		t.Fatal(err)
	}
	if effective.Timeout != 5*time.Minute || strings.Join(effective.Permissions, ",") != "repository.read" || strings.Join(effective.Resources, ",") != "reviews,gpu" {
		t.Fatalf("effective = %+v", effective)
	}
}

func TestCallerMayOnlyShorten(t *testing.T) {
	pol := researchPolicy(t)
	short, long := 5*time.Minute, 2*time.Hour
	if effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{Timeout: &short}); err != nil || effective.Timeout != short {
		t.Fatalf("effective = %+v, %v", effective, err)
	}
	if _, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{Timeout: &long}); err == nil || !strings.Contains(err.Error(), "caller timeout 2h0m0s widens") {
		t.Fatalf("err = %v", err)
	}
}

func TestPolicyOutsideTheServiceIsInvalidNotClamped(t *testing.T) {
	pol := researchPolicy(t)
	long := 2 * time.Hour
	pol.Limits.Timeout = &long
	if _, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{}); err == nil || !strings.Contains(err.Error(), "policy static-review: timeout 2h0m0s exceeds the service limit 1h0m0s") {
		t.Fatalf("err = %v", err)
	}
}

func TestDenialsWinAndEveryProblemIsReported(t *testing.T) {
	pol := researchPolicy(t)
	pol.Limits.Allow = append(pol.Limits.Allow, "process.execute")
	effective, err := policy.Compose(service, &pol, process(t, ""), policy.Caller{})
	if err != nil || strings.Contains(strings.Join(effective.Permissions, ","), "process.execute") {
		t.Fatalf("a denied permission became effective: %+v, %v", effective, err)
	}
	_, err = policy.Compose(service, &pol, process(t, "timeout: 2h\ntools: {allow: [network]}\n"), policy.Caller{})
	if err == nil || !strings.Contains(err.Error(), "timeout") || !strings.Contains(err.Error(), "tools.allow") {
		t.Fatalf("err = %v", err)
	}
}
