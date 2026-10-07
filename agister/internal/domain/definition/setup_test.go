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

// ADR-025: a process's workspace.setup, whatever it holds, with a checkout
// or without, is obsolete: it is read with a warning that names ADR-025 and
// says it is ignored, and is no problem.
func TestSetupIsObsolete(t *testing.T) {
	t.Parallel()
	for name, workspace := range map[string]string{
		"a setup":            "  checkout: candidate_revision\n  setup: {command: ./s.sh, timeout: 2m}\n",
		"an invalid one":     "  checkout: candidate_revision\n  setup: {command: '', timeout: soon, shell: zsh}\n",
		"without a checkout": "  setup: {command: ./s.sh, timeout: 2m}\n",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			process, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess(workspace)))
			if err != nil || len(process.Obsolete) != 1 || process.Obsolete[0] != definition.ObsoleteSetup || !strings.Contains(definition.ObsoleteSetup, "is obsolete and ignored (ADR-025)") {
				t.Fatalf("obsolete %q, %v", process.Obsolete, err)
			}
		})
	}
	without, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess("  checkout: candidate_revision\n")))
	if err != nil || len(without.Obsolete) != 0 {
		t.Fatalf("without: %q, %v", without.Obsolete, err)
	}
}

// A policy's workspace block has no setup: it belongs to the process.
func TestPolicyDeclaresNoSetup(t *testing.T) {
	t.Parallel()
	_, err := definition.ParsePolicy(doc(definition.KindPolicy, "pol", `schema: agister.process-policy/v1alpha1
name: pol
workspace: {access: read-only, setup: {command: ./s.sh, timeout: 2m}}
`))
	if err == nil || !strings.Contains(err.Error(), "workspace.setup: unknown field") {
		t.Fatalf("err = %v", err)
	}
}

func TestWorkspaceSettingsAreValidated(t *testing.T) {
	t.Parallel()
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
			t.Parallel()
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
	t.Parallel()
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
			t.Parallel()
			setup, fromWorkspace := c.process.EffectiveSetup(c.workspace)
			if setup != c.want || fromWorkspace != c.fromWorkspace {
				t.Fatalf("setup %+v from workspace %v, want %+v %v", setup, fromWorkspace, c.want, c.fromWorkspace)
			}
		})
	}
}

// ADR-022 rules 1 and 5: the workspace settings say whether calls work in
// the caller's worktree, temporary unless set, and may declare a precheck,
// whose fields are a setup's, both required.
func TestWorkspaceModeAndPrecheck(t *testing.T) {
	t.Parallel()
	workspace, err := definition.ParseWorkspace(doc(definition.KindWorkspace, "workspace", `schema: agister.workspace/v1alpha1
mode: in-place
precheck:
  command: ./scripts/bound.sh
  timeout: 30s
`))
	if err != nil || workspace.Mode != definition.ModeInPlace || !workspace.InPlace() ||
		workspace.Precheck == nil || *workspace.Precheck != (definition.Setup{Command: "./scripts/bound.sh", Timeout: 30 * time.Second}) {
		t.Fatalf("workspace = %+v, %v", workspace, err)
	}
	temporary, err := definition.ParseWorkspace(doc(definition.KindWorkspace, "workspace", "schema: agister.workspace/v1alpha1\nmode: temporary\n"))
	if err != nil || temporary.InPlace() {
		t.Fatalf("temporary = %+v, %v", temporary, err)
	}
	unset, err := definition.ParseWorkspace(doc(definition.KindWorkspace, "workspace", "schema: agister.workspace/v1alpha1\n"))
	if err != nil || unset.Mode != "" || unset.InPlace() || unset.Precheck != nil {
		t.Fatalf("unset = %+v, %v", unset, err)
	}
	if (*definition.Workspace)(nil).InPlace() {
		t.Fatal("no workspace settings work in-place")
	}
	cases := map[string]struct{ text, want string }{
		"bad mode":            {"schema: agister.workspace/v1alpha1\nmode: shared\n", `mode: must be "in-place" or "temporary"`},
		"precheck no timeout": {"schema: agister.workspace/v1alpha1\nprecheck: {command: ./p.sh}\n", "precheck.timeout: is required"},
		"precheck no command": {"schema: agister.workspace/v1alpha1\nprecheck: {timeout: 1m}\n", "precheck.command: is required"},
		"precheck bad field":  {"schema: agister.workspace/v1alpha1\nprecheck: {command: ./p.sh, timeout: 1m, shell: zsh}\n", "precheck.shell: unknown field"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseWorkspace(doc(definition.KindWorkspace, "workspace", c.text))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}
