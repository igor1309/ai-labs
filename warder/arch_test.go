// Package warder keeps the module's architecture rules: the package graph,
// the interfaces beside their consumers, and the test markers. Components
// are packages under internal/, cmd/warder is the only composition root,
// and every other package is this one, the module root.
package warder

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/testdiscipline"
)

// Every package is the module root or under internal/ or cmd/, a package
// under internal/ imports no other package of the module and no logger,
// only a package under cmd/ imports one under internal/, and nothing
// imports a package under cmd/. Every package go list finds is checked, test files included,
// so a new package needs no edit here.
//
// Contract test: the module's real import graph, from go list.
func TestThePackageGraphKeepsComponentsApart(t *testing.T) {
	t.Parallel()
	module := listModule(t, ".")
	if !slices.ContainsFunc(module.packages, func(pkg listedPackage) bool { return module.within(pkg.ImportPath, "internal") }) {
		t.Fatal("go list found no package under internal/")
	}

	problems, err := graphProblems(module)
	if err != nil {
		t.Fatal(err)
	}
	for _, problem := range problems {
		t.Error(problem)
	}
}

// Every interface of the module's non-test files is named in the file
// that declares it, beside its consumer, and in no other non-test file.
//
// Contract test: the module's real packages, loaded through go list.
func TestInterfacesAreDeclaredBesideTheirConsumers(t *testing.T) {
	t.Parallel()
	checked, problems := interfaceProblems(listModule(t, "."))
	if checked == 0 {
		t.Fatal("found no interface to check")
	}
	for _, problem := range problems {
		t.Error(problem)
	}
}

// Every test of the module, in every package from its root, keeps gokit's
// test discipline.
func TestTheModulesTestsKeepTheirMarkers(t *testing.T) {
	t.Parallel()
	findings, err := markerFindings(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, finding := range findings {
		t.Error(finding)
	}
}

// The graph rules accept the module root, components that import only the
// standard library and a composition root that imports them and logs,
// tests included.
//
// Contract test: a fixture module's real import graph, from go list.
func TestTheGraphCheckAcceptsComponentsApart(t *testing.T) {
	t.Parallel()
	root := writeModule(t, map[string]string{
		"internal/a/a.go": `package a

import "strings"

func A() string { return strings.ToUpper("a") }
`,
		"internal/a/a_test.go": `package a_test

import (
	"testing"

	"example.com/fixture/internal/a"
)

func TestA(t *testing.T) {
	t.Parallel()
	_ = a.A()
}
`,
		"internal/b/b.go": `package b

func B() {}
`,
		"cmd/app/main.go": `package main

import (
	"log/slog"

	"example.com/fixture/internal/a"
	"example.com/fixture/internal/b"
)

func main() {
	_ = a.A()
	b.B()
	slog.Info("done")
}
`,
		"fixture.go": `package fixture

func F() {}
`,
	})

	problems, err := graphProblems(listModule(t, root))
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 0 {
		t.Errorf("got problems\n%s\nwant none", strings.Join(problems, "\n"))
	}
}

// The graph rules report, at its first file, a package that is neither the
// module root nor under internal/ or cmd/, a name that only starts like
// internal included; and, at the import, a component that imports another
// package of the module, from a test file too; a component that imports a
// logger, log/slog or log; a package outside cmd/ that
// imports a component; and any import of a package under cmd/.
//
// Contract test: a fixture module's real import graph, from go list.
func TestTheGraphCheckReportsEdgesOutsideTheRules(t *testing.T) {
	t.Parallel()
	root := writeModule(t, map[string]string{
		"internal/a/a.go": `package a

import "example.com/fixture/internal/b"

func A() { b.B() }
`,
		"internal/a/a_test.go": `package a

import (
	"testing"

	"example.com/fixture/internal/c"
)

func TestA(t *testing.T) {
	t.Parallel()
	c.C()
}
`,
		"internal/b/b.go": `package b

import "log/slog"

func B() { slog.Info("b") }
`,
		"internal/d/d.go": `package d

import "log"

func D() { log.Print("d") }
`,
		"internal/c/c.go": `package c

import "example.com/fixture/cmd/tool"

func C() { tool.T() }
`,
		"cmd/tool/tool.go": `package tool

func T() {}
`,
		"pkg/x/x.go": `package x

import "example.com/fixture/internal/b"

func X() { b.B() }
`,
		"internalx/z/z.go": `package z

func Z() {}
`,
		"fixture.go": `package fixture

import "example.com/fixture/cmd/tool"

func F() { tool.T() }
`,
		"cmd/app/main.go": `package main

import "example.com/fixture/internal/b"

func main() { b.B() }
`,
	})

	problems, err := graphProblems(listModule(t, root))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"fixture.go:3: . imports cmd/tool: nothing imports a package under cmd/",
		"internal/a/a.go:3: internal/a imports internal/b: a package under internal/ imports no other package of the module",
		"internal/a/a_test.go:6: internal/a imports internal/c: a package under internal/ imports no other package of the module",
		"internal/b/b.go:3: internal/b imports log/slog: nothing under internal/ logs; logging is a decorator in cmd/",
		"internal/c/c.go:3: internal/c imports cmd/tool: nothing imports a package under cmd/",
		"internal/d/d.go:3: internal/d imports log: nothing under internal/ logs; logging is a decorator in cmd/",
		"internalx/z/z.go:1: internalx/z is neither the module root nor under internal/ or cmd/: every package is one of them",
		"pkg/x/x.go:1: pkg/x is neither the module root nor under internal/ or cmd/: every package is one of them",
		"pkg/x/x.go:3: pkg/x imports internal/b: only a package under cmd/ imports a package under internal/",
	}
	if !slices.Equal(problems, want) {
		t.Errorf("got problems\n%s\nwant\n%s", strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// The interface rules accept interfaces beside their consumers, whether
// declared by a literal, as a type defined over another interface of the
// module or another package, or as an alias of one; named in test files
// elsewhere; and a name that only looks like one: another package's own
// Store, a local type and a parameter that shadow it.
//
// Contract test: a fixture module's real packages, loaded through go list.
func TestTheInterfaceCheckAcceptsInterfacesBesideTheirConsumers(t *testing.T) {
	t.Parallel()
	root := writeModule(t, map[string]string{
		"internal/store/store.go": `package store

type Store interface{ Get() string }

type Service struct{ store Store }

func New(store Store) *Service { return &Service{store: store} }
`,
		"internal/store/shadow.go": `package store

func shadowed() int {
	type Store int
	var n Store
	return int(n)
}

func parameter(Store string) string { return Store }
`,
		"internal/store/forms.go": `package store

import "io"

type Writer io.Writer

type Base interface{ Get() string }

type Derived Base

type Output = io.Writer

type Getter = Base

func forms(w Writer, d Derived, o Output, g Getter) {
	_, _ = w.Write(nil)
	_ = d.Get()
	_, _ = o.Write(nil)
	_ = g.Get()
}
`,
		"internal/store/store_test.go": `package store

type stubStore struct{}

func (stubStore) Get() string { return "" }

var _ Store = stubStore{}

var _ Getter = stubStore{}

var _ Derived = stubStore{}
`,
		"internal/sink/sink.go": `package sink

type Store interface{ Put(string) }

func Save(store Store) { store.Put("record") }
`,
	})

	checked, problems := interfaceProblems(listModule(t, root))
	if checked != 7 {
		t.Errorf("checked %d interfaces, want 7", checked)
	}
	if len(problems) != 0 {
		t.Errorf("got problems\n%s\nwant none", strings.Join(problems, "\n"))
	}
}

// The interface rules report an interface its file does not use, and each
// other non-test file that names one, in its package or another, through
// a renamed or a dot import; whether it is declared by a literal, as a
// type defined over another interface of the module or another package,
// or as an alias of one.
//
// Contract test: a fixture module's real packages, loaded through go list.
func TestTheInterfaceCheckReportsMisplacedInterfaces(t *testing.T) {
	t.Parallel()
	root := writeModule(t, map[string]string{
		"internal/store/interfaces.go": `package store

type Store interface{ Get() string }

type Clock interface{ Now() int }
`,
		"internal/store/service.go": `package store

type Service struct{ store Store }

var _ Reader
`,
		"internal/store/forms.go": `package store

import "io"

type Sink io.Writer

type Reader = io.Reader

type Base interface{ Get() string }

type Derived Base

type Alias = Base

func forms(r Reader, d Derived) {
	_, _ = r.Read(nil)
	_ = d.Get()
}
`,
		"internal/store/local.go": `package store

type Local interface{ Do() }

func run(local Local) { local.Do() }
`,
		"cmd/app/dot.go": `package main

import . "example.com/fixture/internal/store"

func use(local Local) {}

func main() {}
`,
		"cmd/app/renamed.go": `package main

import base "example.com/fixture/internal/store"

var _ base.Clock

var _ base.Derived
`,
	})

	checked, problems := interfaceProblems(listModule(t, root))
	if checked != 8 {
		t.Errorf("checked %d interfaces, want 8", checked)
	}
	want := []string{
		"cmd/app/dot.go:5: interface Local, declared in internal/store/local.go, is named here: declare it in its consumer's file",
		"cmd/app/renamed.go:5: interface Clock, declared in internal/store/interfaces.go, is named here: declare it in its consumer's file",
		"cmd/app/renamed.go:7: interface Derived, declared in internal/store/forms.go, is named here: declare it in its consumer's file",
		"internal/store/forms.go:13: interface Alias is named nowhere else in its file: declare it beside its consumer",
		"internal/store/forms.go:5: interface Sink is named nowhere else in its file: declare it beside its consumer",
		"internal/store/interfaces.go:3: interface Store is named nowhere else in its file: declare it beside its consumer",
		"internal/store/interfaces.go:5: interface Clock is named nowhere else in its file: declare it beside its consumer",
		"internal/store/service.go:3: interface Store, declared in internal/store/interfaces.go, is named here: declare it in its consumer's file",
		"internal/store/service.go:5: interface Reader, declared in internal/store/forms.go, is named here: declare it in its consumer's file",
	}
	if !slices.Equal(problems, want) {
		t.Errorf("got problems\n%s\nwant\n%s", strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// The marker check reaches a test in any package below the root it is
// given, with the standard library's machinery.
func TestTheMarkerCheckSearchesEveryPackage(t *testing.T) {
	t.Parallel()
	root := writeModule(t, map[string]string{
		"internal/a/a_test.go": `package a

import (
	"testing"
	"time"
)

func TestWaits(t *testing.T) {
	t.Parallel()
	<-time.After(time.Millisecond)
}
`,
	})

	findings, err := markerFindings(root)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{`internal/a/a_test.go:8: TestWaits uses time.After and has no "Contract test:" line in its doc comment`}
	if !slices.Equal(findings, want) {
		t.Errorf("got findings\n%s\nwant\n%s", strings.Join(findings, "\n"), strings.Join(want, "\n"))
	}
}

// writeModule writes the files, by path from the root, of a module
// example.com/fixture in a new directory, and returns its root.
func writeModule(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module example.com/fixture\n\ngo 1.24\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for name, content := range files {
		path := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// markerFindings is what the module's tests under root owe gokit's test
// discipline. warder's packages offer no machinery of their own yet: one
// that starts a process or a real timer adds its names to the standard
// library's here.
func markerFindings(root string) ([]string, error) {
	return testdiscipline.Findings(root, testdiscipline.StandardMachinery())
}

// listedPackage is what the rules read of a package go list reports.
type listedPackage struct {
	ImportPath   string
	Dir          string
	Export       string
	Module       *struct{ Path, Dir string }
	GoFiles      []string
	CgoFiles     []string
	TestGoFiles  []string
	XTestGoFiles []string
}

// listedModule is the module go list finds at a directory: its path, its
// root, and its packages with every package they import, each after the
// packages it imports, with the export data of its compiled form.
type listedModule struct {
	path, dir string
	packages  []listedPackage
}

// listModule lists the module at dir with go list, which the test ends
// when it ends.
func listModule(t *testing.T, dir string) listedModule {
	t.Helper()
	command := exec.CommandContext(t.Context(), "go", "list", "-deps", "-export",
		"-json=ImportPath,Dir,Export,Module,GoFiles,CgoFiles,TestGoFiles,XTestGoFiles", "./...")
	command.Dir = dir
	out, err := command.Output()
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			t.Fatalf("go list in %s: %v\n%s", dir, err, exit.Stderr)
		}
		t.Fatalf("go list in %s: %v", dir, err)
	}
	var module listedModule
	decoder := json.NewDecoder(bytes.NewReader(out))
	for {
		var pkg listedPackage
		if err := decoder.Decode(&pkg); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			t.Fatalf("go list in %s: %v", dir, err)
		}
		module.packages = append(module.packages, pkg)
	}
	// The last package is one of the module's own: every other is listed
	// before the packages that import it.
	if n := len(module.packages); n == 0 || module.packages[n-1].Module == nil {
		t.Fatalf("go list in %s found no package of a module", dir)
	}
	last := module.packages[len(module.packages)-1].Module
	module.path, module.dir = last.Path, last.Dir
	return module
}

// contains is whether a package is the module's own.
func (m listedModule) contains(path string) bool {
	return path == m.path || strings.HasPrefix(path, m.path+"/")
}

// within is whether a package is under the module's top-level directory.
func (m listedModule) within(path, top string) bool {
	return path == m.path+"/"+top || strings.HasPrefix(path, m.path+"/"+top+"/")
}

// name is a package of the module by its directory from the root.
func (m listedModule) name(path string) string {
	if path == m.path {
		return "."
	}
	return strings.TrimPrefix(path, m.path+"/")
}

// position is a place in the module's files as "<file from root>:<line>".
func (m listedModule) position(fset *token.FileSet, pos token.Pos) string {
	position := fset.Position(pos)
	return fmt.Sprintf("%s:%d", m.file(position.Filename), position.Line)
}

// file is a file of the module by its path from the root.
func (m listedModule) file(path string) string {
	if relative, err := filepath.Rel(m.dir, path); err == nil {
		return filepath.ToSlash(relative)
	}
	return path
}

// graphProblems checks where each of the module's packages is and every
// import of them, their test files included, against the package graph's
// rules, and returns each package and edge outside them as
// "<file>:<line>: <problem>", sorted. A misplaced package is reported at
// the package clause of its first file.
func graphProblems(module listedModule) ([]string, error) {
	fset := token.NewFileSet()
	var problems []string
	for _, pkg := range module.packages {
		if !module.contains(pkg.ImportPath) {
			continue
		}
		names := slices.Concat(pkg.GoFiles, pkg.CgoFiles, pkg.TestGoFiles, pkg.XTestGoFiles)
		placement := module.placementProblem(pkg.ImportPath)
		if placement != "" && len(names) == 0 {
			problems = append(problems, fmt.Sprintf("%s: %s", module.name(pkg.ImportPath), placement))
		}
		for i, name := range names {
			file, err := parser.ParseFile(fset, filepath.Join(pkg.Dir, name), nil, parser.ImportsOnly)
			if err != nil {
				return nil, err
			}
			if placement != "" && i == 0 {
				problems = append(problems, fmt.Sprintf("%s: %s", module.position(fset, file.Package), placement))
			}
			for _, spec := range file.Imports {
				imported, err := strconv.Unquote(spec.Path.Value)
				if err != nil {
					return nil, err
				}
				if problem := module.edgeProblem(pkg.ImportPath, imported); problem != "" {
					problems = append(problems, fmt.Sprintf("%s: %s", module.position(fset, spec.Pos()), problem))
				}
			}
		}
	}
	slices.Sort(problems)
	return problems, nil
}

// placementProblem is what is wrong with where a package of the module is,
// or "" for nothing: every package is the module root, the architecture
// test's own, or under internal/ or cmd/.
func (m listedModule) placementProblem(path string) string {
	if path == m.path || m.within(path, "internal") || m.within(path, "cmd") {
		return ""
	}
	return m.name(path) + " is neither the module root nor under internal/ or cmd/: every package is one of them"
}

// edgeProblem is what is wrong with one package of the module importing
// another, or a component importing a logger, or "" for nothing. A
// package's external tests importing it is no edge.
func (m listedModule) edgeProblem(from, to string) string {
	if m.within(from, "internal") && (to == "log/slog" || to == "log") {
		return fmt.Sprintf("%s imports %s: nothing under internal/ logs; logging is a decorator in cmd/", m.name(from), to)
	}
	if from == to || !m.contains(to) {
		return ""
	}
	edge := fmt.Sprintf("%s imports %s", m.name(from), m.name(to))
	switch {
	case m.within(to, "cmd"):
		return edge + ": nothing imports a package under cmd/"
	case m.within(from, "internal"):
		return edge + ": a package under internal/ imports no other package of the module"
	case m.within(to, "internal") && !m.within(from, "cmd"):
		return edge + ": only a package under cmd/ imports a package under internal/"
	}
	return ""
}

// interfaceProblems type-checks the non-test files of the module's
// packages and checks each interface they declare at package level: it is
// named in the file that declares it, beside its consumer, and in no other
// non-test file. An interface is a type whose resolved type is one, so a
// type defined over another interface or an alias of one is checked like
// an interface literal. Names are resolved by their types, so a dot or
// renamed import is followed and a shadowing name is not taken for the
// interface.
// What cannot be resolved is a problem, never a pass. It returns how many
// interfaces it checked and the problems as "<file>:<line>: <problem>",
// sorted.
func interfaceProblems(module listedModule) (int, []string) {
	fset := token.NewFileSet()
	var problems []string
	exports := map[string]string{}
	for _, pkg := range module.packages {
		if pkg.Export != "" {
			exports[pkg.ImportPath] = pkg.Export
		}
	}
	compiled := importer.ForCompiler(fset, "gc", func(path string) (io.ReadCloser, error) {
		export, ok := exports[path]
		if !ok {
			return nil, fmt.Errorf("go list gave no export data for %s", path)
		}
		return os.Open(export)
	})
	// The module's packages are checked from their source, so that every
	// name of one resolves to the same object; go list lists each before
	// the packages that import it.
	checked := map[string]*types.Package{}
	imports := importerFunc(func(path string) (*types.Package, error) {
		if pkg, ok := checked[path]; ok {
			return pkg, nil
		}
		if module.contains(path) {
			return nil, fmt.Errorf("%s is not checked before the packages that import it", path)
		}
		return compiled.Import(path)
	})
	info := &types.Info{Defs: map[*ast.Ident]types.Object{}, Uses: map[*ast.Ident]types.Object{}}
	var files []*ast.File
	for _, pkg := range module.packages {
		if !module.contains(pkg.ImportPath) {
			continue
		}
		if len(pkg.CgoFiles) > 0 {
			problems = append(problems, fmt.Sprintf("%s: uses cgo, whose names this check cannot resolve", module.file(filepath.Join(pkg.Dir, pkg.CgoFiles[0]))))
			continue
		}
		var syntax []*ast.File
		for _, name := range pkg.GoFiles {
			file, err := parser.ParseFile(fset, filepath.Join(pkg.Dir, name), nil, 0)
			if err != nil {
				problems = append(problems, fmt.Sprintf("%s: cannot parse: %v", module.file(filepath.Join(pkg.Dir, name)), err))
				continue
			}
			syntax = append(syntax, file)
		}
		config := types.Config{
			Importer: imports,
			Error: func(err error) {
				if typeErr, ok := err.(types.Error); ok {
					problems = append(problems, fmt.Sprintf("%s: cannot resolve: %s", module.position(fset, typeErr.Pos), typeErr.Msg))
					return
				}
				problems = append(problems, fmt.Sprintf("%s: cannot resolve: %v", module.name(pkg.ImportPath), err))
			},
		}
		typed, _ := config.Check(pkg.ImportPath, fset, syntax, info)
		checked[pkg.ImportPath] = typed
		files = append(files, syntax...)
	}

	declared := map[types.Object]string{} // each interface's file
	for _, file := range files {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				typeSpec := spec.(*ast.TypeSpec)
				object, ok := info.Defs[typeSpec.Name].(*types.TypeName)
				if !ok || !types.IsInterface(object.Type()) {
					continue
				}
				declared[object] = fset.Position(typeSpec.Pos()).Filename
			}
		}
	}
	besideConsumer := map[types.Object]bool{}
	for ident, object := range info.Uses {
		file, ok := declared[object]
		if !ok {
			continue
		}
		if here := fset.Position(ident.Pos()).Filename; here == file {
			besideConsumer[object] = true
		} else {
			problems = append(problems, fmt.Sprintf("%s: interface %s, declared in %s, is named here: declare it in its consumer's file", module.position(fset, ident.Pos()), object.Name(), module.file(file)))
		}
	}
	for object := range declared {
		if !besideConsumer[object] {
			problems = append(problems, fmt.Sprintf("%s: interface %s is named nowhere else in its file: declare it beside its consumer", module.position(fset, object.Pos()), object.Name()))
		}
	}
	slices.Sort(problems)
	return len(declared), problems
}

// importerFunc is a function that imports a package by its path.
type importerFunc func(path string) (*types.Package, error)

func (f importerFunc) Import(path string) (*types.Package, error) { return f(path) }
