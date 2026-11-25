package main

import (
	"os/exec"
	"slices"
	"strings"
	"testing"
)

// Contract test: Go reports the command and generator's actual import edges.
func TestFolderIndexPackageImports(t *testing.T) {
	t.Parallel()

	const module = "github.com/igor1309/ai-labs/audelin/feed/"
	want := map[string][]string{
		module + "folderindex":              nil,
		module + "cmd/audelin-folder-index": {module + "folderindex"},
	}
	cmd := exec.Command("go", "list", "-f", `{{.ImportPath}} {{join .Imports " "}}`, "./folderindex", "./cmd/audelin-folder-index")
	cmd.Dir = "../.."
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, output)
	}
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		path := fields[0]
		var imports []string
		for _, dep := range fields[1:] {
			if strings.HasPrefix(dep, module) {
				imports = append(imports, dep)
			}
		}
		if expected, ok := want[path]; !ok || !slices.Equal(imports, expected) {
			t.Errorf("%s imports feed packages %v, want %v", path, imports, expected)
		}
		delete(want, path)
	}
	if len(want) != 0 {
		t.Errorf("go list omitted packages: %v", want)
	}
}
