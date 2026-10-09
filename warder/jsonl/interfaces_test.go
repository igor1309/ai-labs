package jsonl_test

import (
	"fmt"
	"go/ast"
	"go/token"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// The module's interfaces are declared beside their consumers: each is
// named in the file that declares it, and in no other non-test file.
func TestInterfacesAreDeclaredBesideTheirConsumers(t *testing.T) {
	t.Parallel()
	checked, problems, err := checkInterfaces(".")
	if err != nil {
		t.Fatal(err)
	}
	if checked == 0 {
		t.Fatal("found no interface to check")
	}
	for _, problem := range problems {
		t.Error(problem)
	}
}

// The checker accepts interfaces beside their consumers, in any package of
// the module, and ignores test files.
func TestTheInterfaceCheckerAcceptsInterfacesBesideTheirConsumers(t *testing.T) {
	t.Parallel()
	root := writeFixture(t, map[string]string{
		"go.mod": "module example.com/fixture\n",
		"service.go": `package fixture

type Store interface{ Get() string }

type Service struct{ store Store }

func New(store Store) *Service { return &Service{store: store} }
`,
		"record.go": `package fixture

type Record struct{ ID string }
`,
		"service_test.go": `package fixture

type stubStore struct{}

var _ Store = stubStore{}
`,
		"sink/sink.go": `package sink

import "example.com/fixture"

type Sink interface{ Put(fixture.Record) }

func Drain(sink Sink) {}
`,
	})

	checked, problems, err := checkInterfaces(root)
	if err != nil {
		t.Fatal(err)
	}
	if checked != 2 {
		t.Errorf("checked %d interfaces, want 2", checked)
	}
	if len(problems) != 0 {
		t.Errorf("got problems %q, want none", problems)
	}
}

// The checker reports an interface in a file without its consumer, and
// each other non-test file that names it, in its package or another.
func TestTheInterfaceCheckerReportsMisplacedInterfaces(t *testing.T) {
	t.Parallel()
	root := writeFixture(t, map[string]string{
		"go.mod": "module example.com/fixture\n",
		"interfaces.go": `package fixture

type Store interface{ Get() string }

type Clock interface{ Now() int }
`,
		"service.go": `package fixture

type Service struct{ store Store }
`,
		"local.go": `package fixture

type Local interface{ Do() }

func run(local Local) { local.Do() }
`,
		"other/other.go": `package other

import base "example.com/fixture"

func Use(local base.Local) {}
`,
	})

	checked, problems, err := checkInterfaces(root)
	if err != nil {
		t.Fatal(err)
	}
	if checked != 3 {
		t.Errorf("checked %d interfaces, want 3", checked)
	}
	want := []string{
		"interfaces.go:3: interface Store is named nowhere else in its file: declare it beside its consumer",
		"interfaces.go:5: interface Clock is named nowhere else in its file: declare it beside its consumer",
		"other/other.go:5: interface Local, declared in local.go, is named here: declare it in its consumer's file",
		"service.go:3: interface Store, declared in interfaces.go, is named here: declare it in its consumer's file",
	}
	slices.Sort(want)
	if !slices.Equal(problems, want) {
		t.Errorf("got problems\n%s\nwant\n%s", strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// checkInterfaces checks the interfaces declared in the non-test files of
// the module at root: each is named, beyond its own declaration, in the
// file that declares it, where its consumer is, and in no other non-test
// file. It returns how many interfaces it checked and the problems,
// sorted.
func checkInterfaces(root string) (int, []string, error) {
	module, err := modulePath(root)
	if err != nil {
		return 0, nil, err
	}
	fset, packages, err := parsePackages(root, false)
	if err != nil {
		return 0, nil, err
	}

	checked := 0
	var problems []string
	for _, pkg := range packages {
		importPath := module
		if pkg.dir != "." {
			importPath = module + "/" + pkg.dir
		}
		for _, file := range pkg.files {
			for _, spec := range interfaceSpecs(file.syntax) {
				checked++
				declaredAt := fset.Position(spec.Pos()).Line
				namedHere := false
				for _, other := range packages {
					for _, otherFile := range other.files {
						qualifier := ""
						if other != pkg {
							qualifier = importPath
						}
						at, ok := firstNaming(otherFile, spec.Name.Name, qualifier)
						switch {
						case !ok:
						case otherFile == file:
							namedHere = true
						default:
							problems = append(problems, fmt.Sprintf("%s:%d: interface %s, declared in %s, is named here: declare it in its consumer's file",
								otherFile.path, fset.Position(at).Line, spec.Name.Name, file.path))
						}
					}
				}
				if !namedHere {
					problems = append(problems, fmt.Sprintf("%s:%d: interface %s is named nowhere else in its file: declare it beside its consumer",
						file.path, declaredAt, spec.Name.Name))
				}
			}
		}
	}
	slices.Sort(problems)
	return checked, problems, nil
}

func modulePath(root string) (string, error) {
	content, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		return "", err
	}
	for line := range strings.SplitSeq(string(content), "\n") {
		if rest, ok := strings.CutPrefix(strings.TrimSpace(line), "module"); ok {
			if module := strings.Trim(strings.TrimSpace(rest), `"`); module != "" {
				return module, nil
			}
		}
	}
	return "", fmt.Errorf("%s: no module line", path.Join(filepath.ToSlash(root), "go.mod"))
}

// interfaceSpecs returns the interface types the file declares at its top
// level.
func interfaceSpecs(file *ast.File) []*ast.TypeSpec {
	var specs []*ast.TypeSpec
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.TYPE {
			continue
		}
		for _, spec := range gen.Specs {
			if spec, ok := spec.(*ast.TypeSpec); ok {
				if _, ok := spec.Type.(*ast.InterfaceType); ok {
					specs = append(specs, spec)
				}
			}
		}
	}
	return specs
}

// firstNaming finds the first place the file names the type: by its bare
// name in its own package (qualifier empty), or as a selector on an import
// of the qualifier's path from another. Declared names (of types, fields
// and functions) are not namings.
func firstNaming(file *goFile, name, qualifier string) (token.Pos, bool) {
	var at token.Pos
	var visit func(node ast.Node) bool
	inspect := func(node ast.Node) {
		if node != nil {
			ast.Inspect(node, visit)
		}
	}
	visit = func(node ast.Node) bool {
		if at.IsValid() {
			return false
		}
		switch node := node.(type) {
		case *ast.SelectorExpr:
			if x, ok := node.X.(*ast.Ident); ok && qualifier != "" && file.imports[x.Name] == qualifier && node.Sel.Name == name {
				at = node.Pos()
				return false
			}
			inspect(node.X)
			return false
		case *ast.Ident:
			if qualifier == "" && node.Name == name {
				at = node.Pos()
			}
			return false
		case *ast.TypeSpec:
			if node.TypeParams != nil {
				inspect(node.TypeParams)
			}
			inspect(node.Type)
			return false
		case *ast.Field:
			inspect(node.Type)
			return false
		case *ast.FuncDecl:
			if node.Recv != nil {
				inspect(node.Recv)
			}
			inspect(node.Type)
			if node.Body != nil {
				inspect(node.Body)
			}
			return false
		case *ast.ImportSpec:
			return false
		}
		return true
	}
	for _, decl := range file.syntax.Decls {
		inspect(decl)
	}
	return at, at.IsValid()
}
