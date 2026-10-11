// Package archtest checks the architecture's dependency rules (ADR-001).
package archtest

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

const module = "github.com/igor1309/ai-labs/agister"

// supervisor is the process supervisor, a runtime adapter that lives in
// gokit (ADR-019).
const supervisor = "github.com/igor1309/ai-labs/gokit/supervisor"

func packages(t *testing.T) map[string][]string {
	t.Helper()
	command := exec.Command("go", "list", "-f", `{{.ImportPath}} {{join .Imports " "}}`, "./...")
	command.Dir = "../.."
	out, err := command.Output()
	if err != nil {
		t.Fatal(err)
	}
	imports := map[string][]string{}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		pkg := strings.TrimPrefix(fields[0], module+"/")
		for _, imported := range fields[1:] {
			if strings.HasPrefix(imported, module+"/") {
				imports[pkg] = append(imports[pkg], strings.TrimPrefix(imported, module+"/"))
			} else if !strings.Contains(strings.Split(imported, "/")[0], ".") {
				continue // standard library
			} else {
				imports[pkg] = append(imports[pkg], imported)
			}
		}
		if _, ok := imports[pkg]; !ok {
			imports[pkg] = nil
		}
	}
	return imports
}

func under(pkg, prefix string) bool { return pkg == prefix || strings.HasPrefix(pkg, prefix+"/") }

// Contract test: the module's real import graph, from go list.
func TestDependencyRule(t *testing.T) {
	t.Parallel()
	for pkg, imported := range packages(t) {
		for _, dep := range imported {
			var allowed bool
			switch {
			case under(pkg, "internal/domain"):
				allowed = under(dep, "internal/domain") || dep == "gopkg.in/yaml.v3" || dep == "github.com/BurntSushi/toml"
			case pkg == "internal/contract":
				allowed = false
			case pkg == "internal/app":
				allowed = under(dep, "internal/domain") || dep == "internal/contract"
			case pkg == "internal/cli":
				allowed = dep == "internal/contract"
			case under(pkg, "internal/adapters"):
				allowed = under(dep, "internal/domain") || dep == "internal/app" || dep == "internal/contract" ||
					(under(pkg, "internal/adapters/runtime") && (under(dep, "internal/adapters/runtime") || under(dep, supervisor))) ||
					!strings.HasPrefix(dep, "internal/") && !strings.HasPrefix(dep, "cmd/") && dep != "examples" && !under(dep, supervisor)
			case pkg == "examples":
				allowed = false
			case pkg == "cmd/agister", pkg == "cmd/retire-implement-processes":
				allowed = true // a composition root
			default:
				allowed = true
			}
			if !allowed {
				t.Errorf("%s must not import %s", pkg, dep)
			}
		}
	}
}

// Only a composition root instantiates adapters: agister's, the
// retirement's, and the modules' construction functions it calls.
//
// Contract test: the module's real import graph, from go list.
func TestOnlyTheCompositionRootImportsAdapters(t *testing.T) {
	t.Parallel()
	for pkg, imported := range packages(t) {
		if pkg == "cmd/agister" || pkg == "cmd/retire-implement-processes" || pkg == "internal/composition/runtime" || pkg == "internal/composition/install" || under(pkg, "internal/adapters") {
			continue
		}
		for _, dep := range imported {
			if under(dep, "internal/adapters") || under(dep, supervisor) || dep == "examples" {
				t.Errorf("%s imports %s", pkg, dep)
			}
		}
	}
}

// A runtime adapter declares the process transport it takes in its own
// types (ADR-001 rule 13), and the composition root translates them to the
// supervisor's: no runtime adapter imports the supervisor. The test kit
// does, to read process references.
//
// Contract test: the module's real import graph, from go list.
func TestRuntimeAdaptersDoNotImportTheSupervisor(t *testing.T) {
	t.Parallel()
	for pkg, imported := range packages(t) {
		if !under(pkg, "internal/adapters/runtime") || under(pkg, "internal/adapters/runtime/runtimetest") {
			continue
		}
		if slices.ContainsFunc(imported, func(dep string) bool { return under(dep, supervisor) }) {
			t.Errorf("%s imports %s", pkg, supervisor)
		}
	}
}

// The code knows agent calls, not kinds of work.
func TestCodeKnowsNoKindOfWork(t *testing.T) {
	t.Parallel()
	root := "../.."
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		// Fake runtimes are test fixtures that emit example outputs.
		if strings.Contains(filepath.ToSlash(path), "/runtimetest/") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, word := range []string{"review", "verdict", "finding"} {
			if strings.Contains(strings.ToLower(string(data)), word) {
				t.Errorf("%s mentions %q", path, word)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// No interface is shared between components (ADR-001 rule 13): each use case
// declares the interfaces it calls beside itself. ports.go holds data only.
func TestSharedDataFileDeclaresNoInterface(t *testing.T) {
	t.Parallel()
	file, err := parser.ParseFile(token.NewFileSet(), "../app/ports.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	ast.Inspect(file, func(node ast.Node) bool {
		if spec, ok := node.(*ast.TypeSpec); ok {
			if _, isInterface := spec.Type.(*ast.InterfaceType); isInterface {
				t.Errorf("ports.go declares the interface %s; declare it beside the component that calls it", spec.Name.Name)
			}
		}
		return true
	})
}

// An interface is used only in the file that declares it. The one exception
// is a compile assertion, var _ X = ..., which names the interface a type
// promises to satisfy without depending on it.
func TestNoInterfaceIsNamedOutsideItsFile(t *testing.T) {
	t.Parallel()
	files, err := filepath.Glob("../app/*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("app files %v: %v", files, err)
	}
	fset := token.NewFileSet()
	parsed := map[string]*ast.File{}
	declaredIn := map[string]string{} // interface name -> file
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		parsed[path] = file
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok {
				continue
			}
			for _, spec := range gen.Specs {
				if typ, ok := spec.(*ast.TypeSpec); ok {
					if _, isInterface := typ.Type.(*ast.InterfaceType); isInterface {
						declaredIn[typ.Name.Name] = path
					}
				}
			}
		}
	}
	for path, file := range parsed {
		for _, use := range typeNames(file) {
			if home, ok := declaredIn[use.name]; ok && home != path {
				t.Errorf("%s names the interface %s, declared in %s; declare the interface the component needs beside it",
					fset.Position(use.pos), use.name, filepath.Base(home))
			}
		}
	}
}

type typeName struct {
	name string
	pos  token.Pos
}

// typeNames lists the names in a file's types and signatures, leaving out
// the compile assertions var _ X = ....
func typeNames(file *ast.File) []typeName {
	var found []typeName
	var inType func(ast.Expr)
	inType = func(expr ast.Expr) {
		if expr == nil {
			return
		}
		ast.Inspect(expr, func(node ast.Node) bool {
			switch n := node.(type) {
			case *ast.SelectorExpr:
				return false // a name in another package
			case *ast.Ident:
				found = append(found, typeName{n.Name, n.Pos()})
			}
			return true
		})
	}
	ast.Inspect(file, func(node ast.Node) bool {
		switch n := node.(type) {
		case *ast.ValueSpec:
			if len(n.Names) == 1 && n.Names[0].Name == "_" {
				return false
			}
			inType(n.Type)
		case *ast.TypeSpec:
			inType(n.Type)
			return false
		case *ast.Field:
			inType(n.Type)
		case *ast.TypeAssertExpr:
			inType(n.Type)
		case *ast.CompositeLit:
			inType(n.Type)
		}
		return true
	})
	return found
}
