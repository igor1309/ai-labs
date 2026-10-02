package runtime

import (
	"os/exec"
	"strings"
	"testing"
)

// Inspect transitive production dependencies, including platform-specific
// supervisor files selected by the Go tool, so adding an indirect shared
// dependency cannot quietly recouple a wrapper to the application.
func TestRuntimeModulesImportOnlyTheStandardLibrary(t *testing.T) {
	const module = "github.com/igor1309/ai-labs/agister"
	for _, name := range []string{"codex", "claudecode", "pi", "opencode", "supervisor"} {
		t.Run(name, func(t *testing.T) {
			pkg := module + "/internal/adapters/runtime/" + name
			command := exec.Command("go", "list", "-deps", "-f", "{{if not .Standard}}{{.ImportPath}}{{end}}", pkg)
			output, err := command.CombinedOutput()
			if err != nil {
				t.Fatalf("go list: %v\n%s", err, output)
			}
			for _, dependency := range strings.Fields(string(output)) {
				if dependency != pkg {
					t.Errorf("%s depends on %s; runtime modules must use only the standard library", pkg, dependency)
				}
			}
		})
	}
}
