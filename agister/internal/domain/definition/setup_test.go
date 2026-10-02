package definition_test

import (
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// settingUpProcess is a process whose workspace block is the one given,
// indented under workspace:.
func settingUpProcess(workspace string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Implement it.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
output:
  format: text
workspace:
` + workspace
}

const setupBlock = `  checkout: candidate_revision
  setup:
    command: ./scripts/link-config.sh
    timeout: 2m
`

func TestSetupIsParsedAsDeclared(t *testing.T) {
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess(setupBlock)))
	if err != nil {
		t.Fatal(err)
	}
	want := definition.Setup{Command: "./scripts/link-config.sh", Timeout: 2 * time.Minute}
	if process.Setup == nil || *process.Setup != want {
		t.Fatalf("setup = %+v", process.Setup)
	}
}

// ADR-012 rule 1: both fields are required, there is no default, and a
// setup prepares only a checkout.
func TestSetupProblems(t *testing.T) {
	cases := map[string]struct{ workspace, want string }{
		"no command":         {"  checkout: candidate_revision\n  setup: {timeout: 2m}\n", "workspace.setup.command: is required"},
		"no timeout":         {"  checkout: candidate_revision\n  setup: {command: ./s.sh}\n", "workspace.setup.timeout: is required"},
		"empty command":      {"  checkout: candidate_revision\n  setup: {command: '', timeout: 2m}\n", "workspace.setup.command: must not be empty"},
		"bad timeout":        {"  checkout: candidate_revision\n  setup: {command: ./s.sh, timeout: soon}\n", `workspace.setup.timeout: invalid duration "soon"`},
		"unknown field":      {"  checkout: candidate_revision\n  setup: {command: ./s.sh, timeout: 2m, shell: zsh}\n", "workspace.setup.shell: unknown field"},
		"without a checkout": {"  setup: {command: ./s.sh, timeout: 2m}\n", "workspace.setup: requires workspace.checkout"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess(c.workspace)))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}

// A policy's workspace block has no setup: it belongs to the process.
func TestPolicyDeclaresNoSetup(t *testing.T) {
	_, err := definition.ParsePolicy(doc(definition.KindPolicy, "pol", `schema: agister.process-policy/v1alpha1
name: pol
workspace: {access: read-only, setup: {command: ./s.sh, timeout: 2m}}
`))
	if err == nil || !strings.Contains(err.Error(), "workspace.setup: unknown field") {
		t.Fatalf("err = %v", err)
	}
}

func TestWorkspaceSettingsAreValidated(t *testing.T) {
	workspace, err := definition.ParseWorkspace(doc(definition.KindWorkspace, "workspace", `schema: agister.workspace/v1alpha1
setup:
  command: ./scripts/link-config.sh
  timeout: 2m
`))
	if err != nil || workspace.Setup == nil || *workspace.Setup != (definition.Setup{Command: "./scripts/link-config.sh", Timeout: 2 * time.Minute}) {
		t.Fatalf("workspace = %+v, %v", workspace, err)
	}
	// A document without a setup declares no default.
	if workspace, err := definition.ParseWorkspace(doc(definition.KindWorkspace, "workspace", "schema: agister.workspace/v1alpha1\n")); err != nil || workspace.Setup != nil {
		t.Fatalf("no setup = %+v, %v", workspace, err)
	}
	cases := map[string]struct{ text, want string }{
		"wrong schema":  {"schema: agister.process/v1alpha1\n", `schema: must be "agister.workspace/v1alpha1"`},
		"no schema":     {"setup: {command: ./s.sh, timeout: 2m}\n", `schema: must be "agister.workspace/v1alpha1"`},
		"unknown field": {"schema: agister.workspace/v1alpha1\ncheckout: rev\n", "checkout: unknown field"},
		"no timeout":    {"schema: agister.workspace/v1alpha1\nsetup: {command: ./s.sh}\n", "setup.timeout: is required"},
		"no command":    {"schema: agister.workspace/v1alpha1\nsetup: {timeout: 2m}\n", "setup.command: is required"},
		"empty":         {"", "empty document"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := definition.ParseWorkspace(doc(definition.KindWorkspace, "workspace", c.text))
			if err == nil || !strings.Contains(err.Error(), c.want) || !strings.HasPrefix(err.Error(), "workspace settings is invalid") {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}

// ADR-012 rule 2: the workspace's setup applies to a process with a
// checkout and none of its own; its own replaces it whole; without a
// checkout there is none.
func TestEffectiveSetup(t *testing.T) {
	own := &definition.Setup{Command: "./own.sh", Timeout: time.Minute}
	workspace := &definition.Workspace{Setup: &definition.Setup{Command: "./default.sh", Timeout: 2 * time.Minute}}
	cases := map[string]struct {
		process       definition.Process
		workspace     *definition.Workspace
		want          *definition.Setup
		fromWorkspace bool
	}{
		"default":            {definition.Process{Checkout: "rev"}, workspace, workspace.Setup, true},
		"own over default":   {definition.Process{Checkout: "rev", Setup: own}, workspace, own, false},
		"own alone":          {definition.Process{Checkout: "rev", Setup: own}, nil, own, false},
		"no workspace":       {definition.Process{Checkout: "rev"}, nil, nil, false},
		"workspace no setup": {definition.Process{Checkout: "rev"}, &definition.Workspace{}, nil, false},
		"no checkout":        {definition.Process{}, workspace, nil, false},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			setup, fromWorkspace := c.process.EffectiveSetup(c.workspace)
			if setup != c.want || fromWorkspace != c.fromWorkspace {
				t.Fatalf("setup %+v from workspace %v, want %+v %v", setup, fromWorkspace, c.want, c.fromWorkspace)
			}
		})
	}
}
