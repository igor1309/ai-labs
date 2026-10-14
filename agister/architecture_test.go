// Package agister_test checks what the module as a whole promises: the
// dependency rule of its architecture (ADR-001, rule 1) and the marker and
// parallelism of its tests (ADR-009).
package agister_test

import (
	"os/exec"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/testdiscipline"
)

const module = "github.com/igor1309/ai-labs/agister"

// isolated are the groups whose packages import no other package of the
// module, inside their group or outside it (ADR-001, rule 1).
var isolated = []string{"cli", "settings", "core"}

// breaches lists, sorted, every import edge of imports, a package's
// imports by its path from the module's root, that breaks rule 1.
func breaches(imports map[string][]string) []string {
	var found []string
	for pkg, imported := range imports {
		if !slices.ContainsFunc(isolated, func(group string) bool { return under(pkg, group) }) {
			continue
		}
		for _, dep := range imported {
			own := strings.TrimPrefix(dep, module+"/")
			if own != pkg && (dep == module || own != dep) {
				found = append(found, pkg+" imports "+own)
			}
		}
	}
	slices.Sort(found)
	return found
}

func under(pkg, group string) bool { return pkg == group || strings.HasPrefix(pkg, group+"/") }

func TestBreachesFindsAnIsolatedPackageImportingTheModule(t *testing.T) {
	t.Parallel()
	got := breaches(map[string][]string{
		"settings/check":     {"fmt", module + "/settings/resolve"},
		"settings/resolve":   {module + "/settings/resolve"},
		"core/session":       {module + "/core/watch", module + "/runtime/codex"},
		"cli":                {module + "/settings/check"},
		"cmd/agister":        {module + "/settings/check", module + "/core/session"},
		"runtime/codex":      {module + "/git"},
		"settings/documents": {"gopkg.in/yaml.v3"},
		"settingsx":          {module + "/core/watch"},
	})
	want := []string{
		"cli imports settings/check",
		"core/session imports core/watch",
		"core/session imports runtime/codex",
		"settings/check imports settings/resolve",
	}
	if !slices.Equal(got, want) {
		t.Errorf("breaches\n got %q\nwant %q", got, want)
	}
}

// Every package of cli, settings and core, its tests included, imports no
// other package of the module (ADR-001, rule 1).
//
// Contract test: the module's real import graph, from go list.
func TestTheIsolatedGroupsImportNothingOfTheModule(t *testing.T) {
	t.Parallel()
	command := exec.Command("go", "list", "-f",
		`{{.ImportPath}} {{join .Imports " "}} {{join .TestImports " "}} {{join .XTestImports " "}}`, "./...")
	out, err := command.Output()
	if err != nil {
		t.Fatal(err)
	}
	imports := map[string][]string{}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		pkg := strings.TrimPrefix(fields[0], module+"/")
		imports[pkg] = fields[1:]
	}
	if _, ok := imports["settings/documents"]; !ok {
		t.Fatalf("go list did not list settings/documents: %q", out)
	}
	for _, breach := range breaches(imports) {
		t.Error(breach)
	}
}

// The module's tests keep ADR-009's marker and parallelism, by the rules
// testdiscipline.Findings documents.
func TestTestsKeepTheMarkerAndTheParallelism(t *testing.T) {
	t.Parallel()
	findings, err := testdiscipline.Findings(".", testdiscipline.StandardMachinery())
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) > 0 {
		t.Error(strings.Join(findings, "\n"))
	}
}
