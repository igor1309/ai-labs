package definition_test

import (
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// settingUpProcess is a process whose workspace block is the one given,
// indented under workspace:.
func settingUpProcess(workspace string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
prompt: review
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

// ADR-025: a process's workspace.setup, whatever it holds, with a revision
// or without, is obsolete: it is read with a warning that names ADR-025 and
// says it is ignored, and is no problem.
func TestSetupIsObsolete(t *testing.T) {
	t.Parallel()
	for name, workspace := range map[string]string{
		"a setup":            "  revision: candidate_revision\n  setup: {command: ./s.sh, timeout: 2m}\n",
		"an invalid one":     "  revision: candidate_revision\n  setup: {command: '', timeout: soon, shell: zsh}\n",
		"without a revision": "  setup: {command: ./s.sh, timeout: 2m}\n",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			process, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess(workspace)))
			if err != nil || len(process.Obsolete) != 1 || process.Obsolete[0] != definition.ObsoleteSetup || !strings.Contains(definition.ObsoleteSetup, "is obsolete and ignored (ADR-025)") {
				t.Fatalf("obsolete %q, %v", process.Obsolete, err)
			}
		})
	}
	without, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess("  revision: candidate_revision\n")))
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

// ADR-025: workspace.checkout is now workspace.revision. A process that
// still declares it is invalid, and the problem names the new field, so
// the pin is not lost to a field read and ignored.
func TestCheckoutIsNowRevision(t *testing.T) {
	t.Parallel()
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess("  checkout: candidate_revision\n")))
	if err == nil || !strings.Contains(err.Error(), "workspace.checkout: is now workspace.revision (ADR-025)") {
		t.Fatalf("err = %v", err)
	}
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", settingUpProcess("  revision: candidate_revision\n")))
	if err != nil || process.Revision != "candidate_revision" {
		t.Fatalf("revision %q, %v", process.Revision, err)
	}
}
