package archtest

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// How data is kept outside the app, in files and their formats, is the
// language of the outer edges only (LAB-186). An edge is a format's reader
// or writer, a renderer such as pages, an adapter, or a composition root;
// it may know a format. The core, the components with the app's logic,
// speaks its own types: it imports no format library, no file system and
// no package that parses a format, and tags none of its fields with a
// format's names. A change of a format changes its reader and writer, and
// no core component.

// edges are what tell how data is kept: the format libraries, the file
// system, and the module's own parser of the settings files.
var edges = []string{
	"encoding/json", "encoding/xml", "encoding/csv", "encoding/gob",
	"gopkg.in/yaml.v3", "github.com/BurntSushi/toml",
	"io/fs", "os",
	"internal/domain/definition",
}

// formatTags are the struct tag keys that name a field in a format.
var formatTags = []string{"json", "yaml", "toml", "xml"}

// core reports whether a package holds the app's logic. definition sits
// under domain but parses the settings files: it is an edge, whatever its
// path.
func core(pkg string) bool {
	return under(pkg, "internal/app") || pkg == "internal/contract" ||
		under(pkg, "internal/domain") && pkg != "internal/domain/definition"
}

// coupling is today's coupling of the core to the edges, each entry by the
// issue that removes it. The list only shrinks: an entry the code no longer
// needs fails the test until it is removed, and no entry is added.
var coupling = map[string]string{
	"internal/app imports internal/domain/definition": "LAB-188: takes the settings files' shape",
	"internal/app imports io/fs":                      "LAB-188: reads the examples' files at init",
	"internal/app imports encoding/json":              "LAB-188, LAB-189: the output schema's bytes, the record's view and the join's collection",
	"internal/app tags its fields":                    "LAB-189, LAB-192: the join's collection and the probe cache",
	"internal/contract imports encoding/json":         "LAB-189: carries the record and the output as stored",
	"internal/contract tags its fields":               "LAB-192: its types are the CLI's --json output",
	"internal/domain/run imports encoding/json":       "LAB-189: is the run record's file shape",
	"internal/domain/run tags its fields":             "LAB-189: is the run record's file shape",
}

// couplings lists, sorted, each core package's import of an edge and each
// core package that tags its fields with a format, given the import graph
// and the packages with tagged fields.
func couplings(imports map[string][]string, tagged []string) []string {
	var found []string
	for pkg, imported := range imports {
		if !core(pkg) {
			continue
		}
		for _, dep := range imported {
			if slices.Contains(edges, dep) {
				found = append(found, pkg+" imports "+dep)
			}
		}
	}
	for _, pkg := range tagged {
		if core(pkg) {
			found = append(found, pkg+" tags its fields")
		}
	}
	slices.Sort(found)
	return found
}

// findings compares the couplings found with the ones allowed: one not
// allowed is a finding, and so is one allowed that is no longer found.
func findings(found []string, allowed map[string]string) []string {
	var out []string
	for _, c := range found {
		if _, ok := allowed[c]; !ok {
			out = append(out, c+": only a format's reader or writer, an edge, may know how data is kept")
		}
	}
	for c, issue := range allowed {
		if !slices.Contains(found, c) {
			out = append(out, fmt.Sprintf("%s (%s) is gone: remove it from the allowed coupling", c, issue))
		}
	}
	slices.Sort(out)
	return out
}

// taggedPackages lists the packages, of the ones given, whose non-test
// files tag a struct field with a format's names.
func taggedPackages(t *testing.T, pkgs []string) []string {
	t.Helper()
	var tagged []string
	for _, pkg := range pkgs {
		files, err := filepath.Glob(filepath.Join("../..", pkg, "*.go"))
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, path := range files {
			if strings.HasSuffix(path, "_test.go") {
				continue
			}
			file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
			if err != nil {
				t.Fatal(err)
			}
			ast.Inspect(file, func(node ast.Node) bool {
				field, ok := node.(*ast.Field)
				if !ok || field.Tag == nil {
					return true
				}
				tag, err := strconv.Unquote(field.Tag.Value)
				if err != nil {
					t.Fatalf("%s: %v", path, err)
				}
				for _, key := range formatTags {
					if _, ok := reflect.StructTag(tag).Lookup(key); ok {
						found = true
					}
				}
				return true
			})
		}
		if found {
			tagged = append(tagged, pkg)
		}
	}
	return tagged
}

// Contract test: the module's real import graph, from go list, and its
// real source files.
func TestOnlyTheEdgesKnowHowDataIsKept(t *testing.T) {
	t.Parallel()
	imports := graph(t)
	var pkgs []string
	for pkg := range imports {
		if core(pkg) {
			pkgs = append(pkgs, pkg)
		}
	}
	for _, finding := range findings(couplings(imports, taggedPackages(t, pkgs)), coupling) {
		t.Error(finding)
	}
}

// readerFile is the file of internal/app that parses settings documents:
// the package's typed reader and its parsing helpers (LAB-188). It is the
// one file of the package that imports the module's parser of the settings
// files: every other file takes from it, in the package's own names, what
// a document parses to and each name and function of the parser it uses.
// So the parser's move behind an edge changes one file of the package.
const readerFile = "reader.go"

// parserImports lists, sorted, each non-test file of dir other than the one
// excepted that imports the module's parser of the settings files, once,
// whatever name it imports it by: the parser's own, another, none or the
// blank one.
func parserImports(t *testing.T, dir, except string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") || name == except {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), filepath.Join(dir, name), nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, spec := range file.Imports {
			path, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				t.Fatalf("%s: %v", name, err)
			}
			if path == module+"/internal/domain/definition" {
				found = append(found, name)
			}
		}
	}
	slices.Sort(found)
	return slices.Compact(found)
}

func TestOnlyTheReadersFileOfTheAppImportsTheParser(t *testing.T) {
	t.Parallel()
	for _, name := range parserImports(t, "../app", readerFile) {
		t.Errorf("internal/app/%s imports internal/domain/definition: only %s imports the parser, and every other file of the package takes what it uses of it from there", name, readerFile)
	}
}

func TestAFileOtherThanTheReadersThatImportsTheParserIsFound(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	const parserPath = module + "/internal/domain/definition"
	imported := func(specs ...string) string {
		source := "package app\n\nimport (\n\t\"context\"\n"
		for _, spec := range specs {
			source += "\t" + spec + "\n"
		}
		return source + ")\n"
	}
	files := map[string]string{
		// None of these is a finding: the reader's file, which imports the
		// parser; a test file; a file of another language; a file that
		// imports the document vocabulary only; and one that imports
		// other packages, whose paths only hold the parser's.
		readerFile:        imported(`"` + parserPath + `"`),
		"imports_test.go": imported(`"` + parserPath + `"`),
		"imports.md":      "import \"" + parserPath + "\"\n",
		"moves.go":        imported(`"` + module + `/internal/domain/document"`),
		"near.go":         imported(`"`+parserPath+`s"`, `"example.com/other/internal/domain/definition"`),
		// Each of these imports the parser, under each name a file can
		// give it.
		"named.go":       imported(`"` + parserPath + `"`),
		"renamed.go":     imported(`settings "` + parserPath + `"`),
		"unqualified.go": imported(`. "` + parserPath + `"`),
		"blank.go":       imported(`_ "` + parserPath + `"`),
		"twice.go":       imported(`"`+parserPath+`"`, `settings "`+parserPath+`"`),
		"alone.go":       "package app\n\nimport \"" + parserPath + "\"\n\nconst promptInput = definition.PromptInput\n",
	}
	for name, source := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	want := []string{"alone.go", "blank.go", "named.go", "renamed.go", "twice.go", "unqualified.go"}
	if got := parserImports(t, dir, readerFile); !slices.Equal(got, want) {
		t.Errorf("files other than the reader's that import the parser = %q, want %q", got, want)
	}
}

// throughReader are the files of internal/app that take every settings
// document from the package's typed reader (LAB-188): they ask no
// definitions port for one. That they parse none either is every file's
// rule but the reader's, which parserImports keeps.
var throughReader = []string{"resolve.go", "check.go", "definitions.go"}

// portReads are the methods of a definitions port that give a document.
var portReads = []string{"Read", "ReadListed"}

// bypasses lists, sorted, each use in the files given of a reading method
// of a definitions port, which the reader calls for them. Syntax tells no
// type, so a reading method is found by its name, on whatever holds the
// port.
func bypasses(t *testing.T, dir string, names []string) []string {
	t.Helper()
	var found []string
	for _, name := range names {
		file, err := parser.ParseFile(token.NewFileSet(), filepath.Join(dir, name), nil, parser.SkipObjectResolution)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(node ast.Node) bool {
			if selector, ok := node.(*ast.SelectorExpr); ok && slices.Contains(portReads, selector.Sel.Name) {
				found = append(found, name+": "+types.ExprString(selector))
			}
			return true
		})
	}
	slices.Sort(found)
	return found
}

func TestTheResolverTheCheckerTheListsAndInspectTakeEveryDocumentFromTheReader(t *testing.T) {
	t.Parallel()
	for _, bypass := range bypasses(t, "../app", throughReader) {
		t.Errorf("internal/app/%s: the file takes its documents from the package's reader, and asks no definitions port for one", bypass)
	}
}

func TestAFileThatGoesAroundTheReaderIsFound(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	const header = "package app\n\nimport \"" + module + "/internal/domain/definition\"\n"
	files := map[string]string{
		// None of these goes around the reader: the port's list, the port
		// handed on, the port's own declaration, a document from the
		// reader, and another package's read of a file. A Parse function
		// is no finding here: parserImports finds the import it needs, in
		// every file of the package but the reader's.
		"through.go": header + `
type definitions interface {
	Read(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	List(ctx context.Context, kind document.Kind) ([]string, error)
}

func (r *Resolver) resolve(ctx context.Context, name string) (definition.Process, error) {
	if _, err := r.definitions.List(ctx, document.KindVerify); err != nil {
		return definition.Process{}, err
	}
	frozen := Snapshot(ctx, r.definitions)
	process, _, err := newDocumentReader(frozen).Process(ctx, name)
	if _, err := fs.ReadFile(r.examples, name); err != nil {
		return definition.Process{}, err
	}
	if _, err := definition.ParseProcess(document.Document{}); err != nil {
		return definition.Process{}, err
	}
	return process, err
}
`,
		"reads.go": header + `
func (r *Resolver) read(ctx context.Context, name string) (definition.Process, error) {
	if _, err := r.definitions.Read(ctx, document.KindProcess, name); err != nil {
		return definition.Process{}, err
	}
	if _, err := r.definitions.ReadListed(ctx, document.KindProcess, name); err != nil {
		return definition.Process{}, err
	}
	held := r.definitions
	read := held.Read
	_, err := read(ctx, document.KindProcess, name)
	return definition.Process{}, err
}
`,
	}
	var names []string
	for name, source := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	want := []string{
		"reads.go: held.Read",
		"reads.go: r.definitions.Read",
		"reads.go: r.definitions.ReadListed",
	}
	if got := bypasses(t, dir, names); !slices.Equal(got, want) {
		t.Errorf("ways around the reader = %q, want %q", got, want)
	}
}

// exported lists, sorted, the exported names the non-test files of dir
// declare at package level: a type or an alias, a constant, a variable or a
// function. A method is its type's, and no name of the package.
func exported(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	add := func(idents ...*ast.Ident) {
		for _, ident := range idents {
			if ident.IsExported() {
				names = append(names, ident.Name)
			}
		}
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), filepath.Join(dir, name), nil, parser.SkipObjectResolution)
		if err != nil {
			t.Fatal(err)
		}
		for _, decl := range file.Decls {
			switch decl := decl.(type) {
			case *ast.FuncDecl:
				if decl.Recv == nil {
					add(decl.Name)
				}
			case *ast.GenDecl:
				for _, spec := range decl.Specs {
					switch spec := spec.(type) {
					case *ast.TypeSpec:
						add(spec.Name)
					case *ast.ValueSpec:
						add(spec.Names...)
					}
				}
			}
		}
	}
	slices.Sort(names)
	return names
}

// importedValidName identifies the core rule by import path and lexical
// object identity, so both guards exclude unrelated and shadowed names.
func importedValidName(t *testing.T, file *ast.File) func(ast.Expr) bool {
	t.Helper()
	var imports []string
	for _, spec := range file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			t.Fatal(err)
		}
		if path == module+"/internal/domain/document" {
			importName := "document"
			if spec.Name != nil {
				importName = spec.Name.Name
			}
			imports = append(imports, importName)
		}
	}
	return func(expr ast.Expr) bool {
		switch expr := ast.Unparen(expr).(type) {
		case *ast.SelectorExpr:
			pkg, ok := expr.X.(*ast.Ident)
			return ok && pkg.Obj == nil && slices.Contains(imports, pkg.Name) && expr.Sel.Name == "ValidName"
		case *ast.Ident:
			return expr.Obj == nil && expr.Name == "ValidName" && slices.Contains(imports, ".")
		}
		return false
	}
}

// validNameSources scans non-test Go files recursively so adapter subpackages
// obey the same source rules as definition and app.
func validNameSources(t *testing.T, dir string, inspect func(string, *ast.File)) {
	t.Helper()
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			return err
		}
		name, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		inspect(name, file)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// validNameReturnedCalls applies a source rule: a return result must not be
// a call to the imported document.ValidName. Local forwarding is checked by
// validNameUnchangedResults; conditions and call arguments remain allowed.
func validNameReturnedCalls(t *testing.T, dir string) []string {
	t.Helper()
	var found []string
	validNameSources(t, dir, func(name string, file *ast.File) {
		isValidName := importedValidName(t, file)
		ast.Inspect(file, func(node ast.Node) bool {
			if returned, ok := node.(*ast.ReturnStmt); ok {
				for _, result := range returned.Results {
					if call, ok := ast.Unparen(result).(*ast.CallExpr); ok && isValidName(call.Fun) {
						found = append(found, name+": return "+types.ExprString(result))
					}
				}
			}
			return true
		})
	})
	slices.Sort(found)
	return found
}

// validNameUnchangedResults follows the imported rule's unchanged result through
// straight-line declarations, assignments, copies and named results in each
// function declaration or literal. Import and lexical identity distinguish
// unrelated and shadowed names. Unrelated straight-line statements preserve the
// results; unsupported statements and potentially mutating calls stop the analysis.
// It performs no control-flow joins, loop, pointer or field tracking, or
// interprocedural analysis, and proves no semantic equivalence.
func validNameUnchangedResults(t *testing.T, dir string) []string {
	t.Helper()
	var found []string
	validNameSources(t, dir, func(name string, file *ast.File) {
		isValidName := importedValidName(t, file)
		ast.Inspect(file, func(node ast.Node) bool {
			var typ *ast.FuncType
			var body *ast.BlockStmt
			switch node := node.(type) {
			case *ast.FuncDecl:
				typ, body = node.Type, node.Body
			case *ast.FuncLit:
				typ, body = node.Type, node.Body
			default:
				return true
			}
			for _, result := range unchangedValidNameResults(typ, body, isValidName) {
				found = append(found, name+": return "+result)
			}
			return true
		})
	})
	slices.Sort(found)
	return found
}

func unchangedValidNameResults(typ *ast.FuncType, body *ast.BlockStmt, isValidName func(ast.Expr) bool) []string {
	if body == nil || typ.Results == nil {
		return nil
	}
	values := make(map[*ast.Object]bool)
	value := func(expr ast.Expr) bool {
		switch expr := ast.Unparen(expr).(type) {
		case *ast.Ident:
			return expr.Obj != nil && values[expr.Obj]
		case *ast.CallExpr:
			return isValidName(expr.Fun)
		}
		return false
	}
	localExpression := func(expr ast.Expr) bool {
		local := true
		ast.Inspect(expr, func(node ast.Node) bool {
			if _, ok := node.(*ast.FuncLit); ok {
				return false
			}
			if call, ok := node.(*ast.CallExpr); ok && !isValidName(call.Fun) {
				local = false
			}
			return local
		})
		return local
	}
	assign := func(names []*ast.Ident, exprs []ast.Expr) bool {
		if len(exprs) != 0 && len(names) != len(exprs) {
			return false
		}
		// Evaluate all right-hand sides before updating any object: a parallel
		// assignment reads the old values, including when it swaps locals.
		next := make([]bool, len(names))
		for i, expr := range exprs {
			if !localExpression(expr) {
				return false
			}
			next[i] = value(expr)
		}
		for i, name := range names {
			if name.Name == "_" {
				continue
			}
			if name.Obj == nil {
				return false
			}
			values[name.Obj] = next[i]
		}
		return true
	}
	for i, stmt := range body.List {
		switch stmt := stmt.(type) {
		case *ast.DeclStmt:
			decl, ok := stmt.Decl.(*ast.GenDecl)
			if !ok || (decl.Tok != token.VAR && decl.Tok != token.CONST) {
				return nil
			}
			for _, spec := range decl.Specs {
				declared := spec.(*ast.ValueSpec)
				if !assign(declared.Names, declared.Values) {
					return nil
				}
			}
		case *ast.AssignStmt:
			var names []*ast.Ident
			for _, expr := range stmt.Lhs {
				name, ok := ast.Unparen(expr).(*ast.Ident)
				if !ok {
					return nil
				}
				names = append(names, name)
			}
			if stmt.Tok != token.ASSIGN && stmt.Tok != token.DEFINE {
				for _, name := range names {
					if name.Obj == nil || values[name.Obj] {
						return nil
					}
				}
				for _, expr := range stmt.Rhs {
					if !localExpression(expr) {
						return nil
					}
				}
				continue
			}
			if !assign(names, stmt.Rhs) {
				return nil
			}
		case *ast.ExprStmt:
			if !localExpression(stmt.X) {
				return nil
			}
		case *ast.EmptyStmt:
		case *ast.ReturnStmt:
			if i != len(body.List)-1 {
				return nil
			}
			results := stmt.Results
			if len(results) == 0 {
				for _, field := range typ.Results.List {
					for _, name := range field.Names {
						results = append(results, name)
					}
				}
			}
			var found []string
			for _, result := range results {
				if !localExpression(result) {
					return nil
				}
				// Direct returned calls have their own rule, including inside
				// branches. Here only a tracked local or named result forwards.
				if _, ok := ast.Unparen(result).(*ast.Ident); ok && value(result) {
					found = append(found, types.ExprString(result))
				}
			}
			return found
		default:
			return nil
		}
	}
	return nil
}

// validNameFunctionValues lists uses of the imported document.ValidName that
// are not the function of a direct call. Import and object identity keep
// unrelated selectors and shadowed package names out of the rule.
func validNameFunctionValues(t *testing.T, dir string) []string {
	t.Helper()
	var found []string
	validNameSources(t, dir, func(name string, file *ast.File) {
		isValidName := importedValidName(t, file)
		exempt := map[ast.Expr]bool{}
		ast.Inspect(file, func(node ast.Node) bool {
			switch node := node.(type) {
			case *ast.CallExpr:
				exempt[ast.Unparen(node.Fun)] = true
			case *ast.SelectorExpr:
				// A selector's member is not a dot-imported identifier.
				exempt[node.Sel] = true
			}
			return true
		})
		ast.Inspect(file, func(node ast.Node) bool {
			var expr ast.Expr
			switch node := node.(type) {
			case *ast.SelectorExpr:
				expr = node
			case *ast.Ident:
				expr = node
			}
			if expr != nil && !exempt[expr] && isValidName(expr) {
				found = append(found, name+": "+types.ExprString(expr))
			}
			return true
		})
	})
	slices.Sort(found)
	return found
}

// redeclared lists, sorted, the exported names of the package in of that
// the package in dir declares too.
func redeclared(t *testing.T, dir, of string) []string {
	t.Helper()
	theirs := exported(t, of)
	var found []string
	for _, name := range exported(t, dir) {
		if slices.Contains(theirs, name) {
			found = append(found, name)
		}
	}
	slices.Sort(found)
	return slices.Compact(found)
}

// The document vocabulary has one home, internal/domain/document. The
// parser names it there: a name of it declared in the parser's package
// again, as an alias, a constant, a variable or a function,
// lets a user reach the vocabulary through the parser.
func TestTheParserDeclaresNoneOfTheDocumentVocabulary(t *testing.T) {
	t.Parallel()
	guard := func(t *testing.T, dir, documentDir string) []string {
		var findings []string
		for _, name := range redeclared(t, dir, documentDir) {
			findings = append(findings, fmt.Sprintf("internal/domain/definition declares %s: document vocabulary belongs to internal/domain/document, and its users name it there directly", name))
		}
		for _, use := range validNameReturnedCalls(t, dir) {
			findings = append(findings, fmt.Sprintf("internal/domain/definition/%s: return results must not call document.ValidName", use))
		}
		for _, use := range validNameUnchangedResults(t, dir) {
			findings = append(findings, fmt.Sprintf("internal/domain/definition/%s: return results must not forward document.ValidName unchanged", use))
		}
		for _, use := range validNameFunctionValues(t, dir) {
			findings = append(findings, fmt.Sprintf("internal/domain/definition/%s: callers call document.ValidName directly, never take it as a function value", use))
		}
		return findings
	}
	for _, finding := range guard(t, "../domain/definition", "../domain/document") {
		t.Error(finding)
	}
	documentImport := "import " + strconv.Quote(module+"/internal/domain/document") + "\n"
	cases := []struct {
		name, source string
		want         []string
	}{
		{
			name:   "vocabulary declaration",
			source: "func ValidName(name string) bool { return false }\n",
			want:   []string{"internal/domain/definition declares ValidName: document vocabulary belongs to internal/domain/document, and its users name it there directly"},
		},
		{
			name:   "directly returned call",
			source: documentImport + "func check(name string) bool { return document.ValidName(name) }\n",
			want:   []string{"internal/domain/definition/forward.go: return document.ValidName(name): return results must not call document.ValidName"},
		},
		{
			name:   "unchanged local result",
			source: documentImport + "func check(name string) bool { valid := document.ValidName(name); return valid }\n",
			want:   []string{"internal/domain/definition/forward.go: return valid: return results must not forward document.ValidName unchanged"},
		},
		{
			name:   "unchanged named result",
			source: documentImport + "func check(name string) (valid bool) { valid = document.ValidName(name); return }\n",
			want:   []string{"internal/domain/definition/forward.go: return valid: return results must not forward document.ValidName unchanged"},
		},
		{
			name:   "function value",
			source: documentImport + "var check = document.ValidName\n",
			want:   []string{"internal/domain/definition/forward.go: document.ValidName: callers call document.ValidName directly, never take it as a function value"},
		},
		{
			name:   "clean",
			source: documentImport + "func check(name string) bool { return name != \"\" && document.ValidName(name) }\n",
		},
		{
			name:   "changed local result",
			source: documentImport + "func check(name string) bool { valid := document.ValidName(name); valid = !valid; return valid }\n",
		},
		{
			name:   "changed named result",
			source: documentImport + "func check(name string) (valid bool) { valid = document.ValidName(name); valid = false; return }\n",
		},
	}
	for _, statement := range []struct{ name, source string }{
		{"const declaration", "const other = true;"},
		{"var declaration", "var other = true;"},
		{"expression statement", "document.ValidName(name);"},
		{"untracked assignment", "name = \"agent\";"},
		{"untracked compound assignment", "name += \"agent\";"},
		{"empty statement", ";"},
	} {
		for _, result := range []struct{ name, signature, assignment, returned string }{
			{"local", "bool", "valid := document.ValidName(name);", "return valid"},
			{"named explicit", "(valid bool)", "valid = document.ValidName(name);", "return valid"},
			{"named bare", "(valid bool)", "valid = document.ValidName(name);", "return"},
		} {
			for _, position := range []string{"before", "after"} {
				body := statement.source + result.assignment
				if position == "after" {
					body = result.assignment + statement.source
				}
				for _, changed := range []bool{false, true} {
					c := struct {
						name, source string
						want         []string
					}{name: statement.name + " " + position + " " + result.name}
					change := ""
					if changed {
						c.name += " changed"
						change = "valid = !valid;"
					} else {
						c.want = []string{"internal/domain/definition/forward.go: return valid: return results must not forward document.ValidName unchanged"}
					}
					c.source = documentImport + fmt.Sprintf("func check(name string) %s { %s%s%s }\n", result.signature, body, change, result.returned)
					cases = append(cases, c)
				}
			}
		}
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			for name, source := range map[string]string{
				"document/document.go":  "package document\nfunc ValidName(name string) bool { return false }\n",
				"definition/forward.go": "package definition\n" + c.source,
			} {
				path := filepath.Join(root, name)
				if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if got := guard(t, filepath.Join(root, "definition"), filepath.Join(root, "document")); !slices.Equal(got, c.want) {
				t.Errorf("parser vocabulary guard findings = %q, want %q", got, c.want)
			}
		})
	}
}

func TestAppAndAdaptersDeclareNoReturnedValidNameCall(t *testing.T) {
	t.Parallel()
	for _, dir := range []string{"../app", "../adapters"} {
		for _, use := range validNameReturnedCalls(t, dir) {
			t.Errorf("%s/%s: return results must not call document.ValidName", dir, use)
		}
		for _, use := range validNameUnchangedResults(t, dir) {
			t.Errorf("%s/%s: return results must not forward document.ValidName unchanged", dir, use)
		}
	}
}

func TestValidNameFunctionValuesAreRejected(t *testing.T) {
	t.Parallel()
	for _, dir := range []string{"../domain/definition", "../app", "../adapters"} {
		for _, use := range validNameFunctionValues(t, dir) {
			t.Errorf("%s/%s: callers call document.ValidName directly, never take it as a function value", dir, use)
		}
	}
	for _, pkg := range []string{"definition", "app", "fsdefs"} {
		t.Run(pkg, func(t *testing.T) {
			t.Parallel()
			for _, imported := range []struct {
				name, alias, rule string
			}{
				{"default", "", "document.ValidName"},
				{"renamed", "vocabulary ", "vocabulary.ValidName"},
				{"dot", ". ", "ValidName"},
			} {
				t.Run(imported.name, func(t *testing.T) {
					t.Parallel()
					for _, c := range []struct {
						name, source string
						reject       bool
					}{
						{"package alias", `var check = RULE`, true},
						{"initialized alias", `func check(name string) bool { validate := RULE; return validate(name) }`, true},
						{"separately assigned", `func check(name string) bool { var validate func(string) bool; validate = RULE; return validate(name) }`, true},
						{"copy", `func check(name string) bool { validate := (RULE); copied := validate; return copied(name) }`, true},
						{"reassignment", `func check(name string) bool { validate := RULE; validate = other.ValidName; return validate(name) }`, true},
						{"assigned after initialization", `func check(name string) bool { validate := other.ValidName; validate = RULE; return validate(name) }`, true},
						{"literal alias", `var check = func(name string) bool { validate := RULE; return validate(name) }`, true},
						{"literal capture", `func check(name string) bool { validate := RULE; return func() bool { return validate(name) }() }`, true},
						{"literal return", `var check = func() func(string) bool { return RULE }`, true},
						{"field assignment", `func store(checker *Checker) { checker.ValidName = RULE }`, true},
						{"function argument", `func accept(fn func(string) bool) {}; func pass() { accept(RULE) }`, true},
						{"direct calls", `func check(name string) bool { return name != "" && RULE(name) && ((RULE))((name)) }`, false},
						{"literal direct call", `var check = func(name string) bool { return RULE(name) }`, false},
						{"unrelated selector", `var unrelated = other.ValidName`, false},
						{"shadowed selectors", `func shadowed(document, vocabulary Checker) { _ = document.ValidName; _ = vocabulary.ValidName }`, false},
						{"shadowed identifier", `func shadowed(ValidName func(string) bool) { _ = ValidName }`, false},
					} {
						t.Run(c.name, func(t *testing.T) {
							t.Parallel()
							dir := t.TempDir()
							name := "helpers.go"
							if pkg == "fsdefs" {
								name = filepath.Join("fsdefs", name)
								if err := os.MkdirAll(filepath.Join(dir, "fsdefs"), 0o700); err != nil {
									t.Fatal(err)
								}
							}
							source := "package " + pkg + "\nimport (\n" + imported.alias + strconv.Quote(module+"/internal/domain/document") +
								"\nother \"example.com/other/internal/domain/document\"\n)\ntype Checker struct { ValidName func(string) bool }\n" +
								strings.ReplaceAll(c.source, "RULE", imported.rule)
							if err := os.WriteFile(filepath.Join(dir, name), []byte(source), 0o600); err != nil {
								t.Fatal(err)
							}
							var want []string
							if c.reject {
								want = []string{name + ": " + imported.rule}
							}
							if got := validNameFunctionValues(t, dir); !slices.Equal(got, want) {
								t.Errorf("document.ValidName function values = %q, want %q", got, want)
							}
						})
					}
				})
			}
		})
	}
}

func TestReturnedValidNameCallsAreFound(t *testing.T) {
	t.Parallel()
	for _, pkg := range []string{"definition", "app", "fsdefs"} {
		t.Run(pkg, func(t *testing.T) {
			t.Parallel()
			for _, imported := range []struct{ name, alias, rule string }{
				{"default", "", "document.ValidName"},
				{"renamed", "vocabulary ", "vocabulary.ValidName"},
				{"dot", ". ", "ValidName"},
			} {
				t.Run(imported.name, func(t *testing.T) {
					t.Parallel()
					for _, c := range []struct {
						name, source string
						results      []string
					}{
						{"single-line wrapper", `func helper(name string) bool { return RULE(name) }`, []string{"RULE(name)"}},
						{"two-branch wrapper", `func helper(name string) bool { if name == "agent" { return RULE(name) }; return RULE(name) }`, []string{"RULE(name)", "RULE(name)"}},
						{"parenthesized", `func helper(name string) bool { return ((RULE)((name))) }`, []string{"((RULE)((name)))"}},
						{"multiple results", `func helper(name string) (bool, error) { return RULE(name), nil }`, []string{"RULE(name)"}},
						{"changed input", `func helper(name string) bool { return RULE("agent") }`, []string{`RULE("agent")`}},
						{"method", `func (c Checker) Check(name string) bool { return RULE(name) }`, []string{"RULE(name)"}},
						{"function literal", `var helper = func(name string) bool { return RULE(name) }`, []string{"RULE(name)"}},
						{"local function literal", `func check(name string) { helper := func() bool { return RULE(name) }; _ = helper }`, []string{"RULE(name)"}},
						{"condition", `func check(name string) string { if !RULE(name) { return "" }; return name }`, nil},
						{"local bool", `func check(name string) bool { valid := RULE(name); return valid }`, nil},
						{"named result", `func check(name string) (valid bool) { valid = RULE(name); return }`, nil},
						{"argument", `func consume(valid bool) bool { return valid }; func check(name string) bool { return consume(RULE(name)) }`, nil},
						{"expression", `func check(name string) bool { return name != "" && RULE(name) }`, nil},
						{"unrelated selector", `func check(name string) bool { return other.ValidName(name) }`, nil},
						{"unrelated import", `func check(name string) bool { return RULE(name) }`, nil},
						{"shadowed selectors", `func check(document, vocabulary Checker, name string) bool { if name == "agent" { return document.ValidName(name) }; return vocabulary.ValidName(name) }`, nil},
						{"shadowed identifier", `func check(ValidName func(string) bool, name string) bool { return ValidName(name) }`, nil},
						{"test file", `func helper(name string) bool { return RULE(name) }`, nil},
					} {
						t.Run(c.name, func(t *testing.T) {
							t.Parallel()
							root := t.TempDir()
							dir := filepath.Join(root, pkg)
							if pkg == "fsdefs" {
								dir = filepath.Join(root, "internal", "adapters", pkg)
							}
							if err := os.MkdirAll(dir, 0o700); err != nil {
								t.Fatal(err)
							}
							importPath := module + "/internal/domain/document"
							if c.name == "unrelated import" {
								importPath = "example.com/other/internal/domain/document"
							}
							source := "package " + pkg + "\nimport (\n" + imported.alias + strconv.Quote(importPath) +
								"\nother \"example.com/other/internal/domain/document\"\n)\ntype Checker struct { ValidName func(string) bool }\n" + strings.ReplaceAll(c.source, "RULE", imported.rule)
							name := "helpers.go"
							if c.name == "test file" {
								name = "helpers_test.go"
							}
							path := filepath.Join(dir, name)
							if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
								t.Fatal(err)
							}
							file, err := filepath.Rel(root, path)
							if err != nil {
								t.Fatal(err)
							}
							var want []string
							for _, result := range c.results {
								want = append(want, file+": return "+strings.ReplaceAll(result, "RULE", imported.rule))
							}
							if got := validNameReturnedCalls(t, root); !slices.Equal(got, want) {
								t.Errorf("returned document.ValidName calls = %q, want %q", got, want)
							}
						})
					}
				})
			}
		})
	}
}

func TestUnchangedValidNameResultsAreRejected(t *testing.T) {
	t.Parallel()
	for _, pkg := range []string{"definition", "app", "fsdefs"} {
		t.Run(pkg, func(t *testing.T) {
			t.Parallel()
			for _, imported := range []struct{ name, alias, rule string }{
				{"default", "", "document.ValidName"},
				{"renamed", "vocabulary ", "vocabulary.ValidName"},
				{"dot", ". ", "ValidName"},
			} {
				t.Run(imported.name, func(t *testing.T) {
					t.Parallel()
					for _, c := range []struct {
						name, params, result, body string
						returned                   []string
					}{
						{"initialized", "name string", "bool", `valid := RULE(name); return valid`, []string{"valid"}},
						{"declared", "name string", "bool", `var valid = RULE(name); return valid`, []string{"valid"}},
						{"typed declaration", "name string", "bool", `var valid bool = RULE(name); return valid`, []string{"valid"}},
						{"assigned", "name string", "bool", `var valid bool; valid = RULE(name); return valid`, []string{"valid"}},
						{"reassigned to rule", "name string", "bool", `valid := false; valid = RULE(name); return valid`, []string{"valid"}},
						{"named explicit", "name string", "(valid bool)", `valid = RULE(name); return valid`, []string{"valid"}},
						{"named bare", "name string", "(valid bool)", `valid = RULE(name); return`, []string{"valid"}},
						{"copies", "name string", "bool", `valid := (RULE)((name)); var copied = valid; var last bool; last = copied; return (last)`, []string{"(last)"}},
						{"named copy", "name string", "(valid bool)", `local := RULE(name); valid = local; return`, []string{"valid"}},
						{"grouped declaration", "name string", "bool", `var (valid = RULE(name); copied = valid); return copied`, []string{"copied"}},
						{"multiple declarations", "name string", "bool", `var valid, other = RULE(name), false; _ = other; return valid`, []string{"valid"}},
						{"parallel copy", "name string", "bool", `valid := RULE(name); copied := false; valid, copied = false, valid; return copied`, []string{"copied"}},
						{"copy before change", "name string", "bool", `valid := RULE(name); copied := valid; valid = false; return copied`, []string{"copied"}},
						{"multiple explicit results", "name string", "(bool, error)", `valid := RULE(name); return valid, nil`, []string{"valid"}},
						{"multiple named results", "name string", "(valid bool, err error)", `valid = RULE(name); return`, []string{"valid"}},
						{"grouped named results", "name string", "(valid, copied bool)", `valid = RULE(name); copied = valid; return`, []string{"valid", "copied"}},
						{"fixed input", "name string", "bool", `valid := RULE("agent"); return valid`, []string{"valid"}},
						{"negated", "name string", "bool", `valid := RULE(name); return !valid`, nil},
						{"changed expression", "name string", "bool", `valid := RULE(name); return valid && name != ""`, nil},
						{"changed local", "name string", "bool", `valid := RULE(name); valid = false; return valid`, nil},
						{"changed named result", "name string", "(valid bool)", `valid = RULE(name); valid = !valid; return`, nil},
						{"changed copy", "name string", "bool", `valid := RULE(name); copied := !valid; return copied`, nil},
						{"parallel invalidation", "name string", "bool", `valid := RULE(name); other := false; valid, other = other, valid; return valid`, nil},
						{"ordinary local use", "name string", "string", `valid := RULE(name); if !valid { return "" }; return name`, nil},
						{"argument", "name string", "bool", `valid := RULE(name); return consume(valid)`, nil},
						{"unrelated selector", "name string", "bool", `valid := other.ValidName(name); return valid`, nil},
						{"unrelated import", "name string", "bool", `valid := RULE(name); return valid`, nil},
						{"shadowed packages", "document, vocabulary Checker, ValidName func(string) bool, name string", "bool", `valid := RULE(name); return valid`, nil},
						{"shadowed identifier", "ValidName func(string) bool, name string", "bool", `valid := ValidName(name); return valid`, nil},
						{"shadowed local", "name string", "bool", `valid := RULE(name); { valid := false; return valid }; return valid`, nil},
						{"captured result", "name string", "bool", `valid := RULE(name); helper := func() bool { return valid }; return helper()`, nil},
						{"independent literal", "name string", "bool", `valid := false; helper := func() bool { valid := RULE(name); return valid }; _ = helper; return valid`, []string{"valid"}},
						{"literal changes capture", "name string", "bool", `valid := RULE(name); ignored := func() bool { valid = false; return true }(); _ = ignored; return valid`, nil},
						{"return changes capture", "name string", "(bool, bool)", `valid := RULE(name); return func() bool { valid = false; return true }(), valid`, nil},
						{"deferred change", "name string", "(valid bool)", `valid = RULE(name); defer func() { valid = false }(); return`, nil},
						{"branch", "name string", "bool", `valid := false; if name != "" { valid = RULE(name) }; return valid`, nil},
						{"loop", "name string", "bool", `valid := false; for name != "" { valid = RULE(name); break }; return valid`, nil},
						{"field", "name string", "bool", `var c struct { valid bool }; c.valid = RULE(name); return c.valid`, nil},
						{"pointer", "name string", "bool", `valid := false; ptr := &valid; *ptr = RULE(name); return valid`, nil},
						{"interprocedural", "name string", "bool", `valid := RULE(name); copied := consume(valid); return copied`, nil},
						{"test file", "name string", "bool", `valid := RULE(name); return valid`, nil},
					} {
						t.Run(c.name, func(t *testing.T) {
							t.Parallel()
							root := t.TempDir()
							dir := filepath.Join(root, pkg)
							if pkg == "fsdefs" {
								dir = filepath.Join(root, "internal", "adapters", pkg)
							}
							if err := os.MkdirAll(dir, 0o700); err != nil {
								t.Fatal(err)
							}
							importPath := module + "/internal/domain/document"
							if c.name == "unrelated import" {
								importPath = "example.com/other/internal/domain/document"
							}
							source := "package " + pkg + "\nimport (\n" + imported.alias + strconv.Quote(importPath) +
								"\nother \"example.com/other/internal/domain/document\"\n)\ntype Checker struct { ValidName func(string) bool }\n"
							body := strings.ReplaceAll(c.body, "RULE", imported.rule)
							// The same body exercises declarations, package literals and
							// local literals, each with an independent value environment.
							source += fmt.Sprintf("func helper(%s) %s { %s }\nvar literal = func(%s) %s { %s }\nfunc owner() { local := func(%s) %s { %s }; _ = local }\n",
								c.params, c.result, body, c.params, c.result, body, c.params, c.result, body)
							name := "helpers.go"
							if c.name == "test file" {
								name = "helpers_test.go"
							}
							path := filepath.Join(dir, name)
							if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
								t.Fatal(err)
							}
							file, err := filepath.Rel(root, path)
							if err != nil {
								t.Fatal(err)
							}
							var want []string
							for range 3 {
								for _, result := range c.returned {
									want = append(want, file+": return "+result)
								}
							}
							slices.Sort(want)
							if got := validNameUnchangedResults(t, root); !slices.Equal(got, want) {
								t.Errorf("unchanged document.ValidName results = %q, want %q", got, want)
							}
						})
					}
				})
			}
		})
	}
}

func TestAVocabularyNameTheParserDeclaresIsFound(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for name, source := range map[string]string{
		"document/document.go": `package document

type Kind string

const (
	KindAgent   Kind = "agents"
	KindProcess Kind = "processes"
)

type Source struct{}

type Document struct{}

var ErrNotFound error

func Composed(kind Kind) bool { return false }

func ValidName(name string) bool { return false }
`,
		"definition/alias.go": `package definition

type Kind = document.Kind
`,
		"definition/values.go": `package definition

const (
	KindAgent   = document.KindAgent
	KindProcess = document.KindProcess
)

var ErrNotFound = document.ErrNotFound
`,
		"definition/forward.go": `package definition

import "` + module + `/internal/domain/document"

func Composed(kind document.Kind) bool { return document.Composed(kind) }

func ValidName(name string) bool { return document.ValidName(name) }
`,
		// Methods, local types, unexported names and test files do not
		// expose document vocabulary through the parser's package.
		"definition/own.go": `package definition

type Process struct{}
func (p Process) Document() document.Document { return document.Document{} }
func ParseProcess() { type Source struct{} }
type source struct{}
`,
		"definition/alias_test.go": `package definition

type Source = document.Source
`,
	} {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	got := redeclared(t, filepath.Join(root, "definition"), filepath.Join(root, "document"))
	// Returned calls and function values have their own source-rule fixtures;
	// this assertion covers exported vocabulary declarations.
	want := []string{"Composed", "ErrNotFound", "Kind", "KindAgent", "KindProcess", "ValidName"}
	if !slices.Equal(got, want) {
		t.Errorf("vocabulary names the parser declares = %q, want %q", got, want)
	}
}

func TestACoreImportOfAFormatIsAFinding(t *testing.T) {
	t.Parallel()
	imports := map[string][]string{
		"internal/domain/prompt": {"strings", "gopkg.in/yaml.v3"},
		"internal/app":           {"internal/domain/definition", "encoding/json"},
	}
	got := findings(couplings(imports, nil), map[string]string{"internal/app imports encoding/json": "LAB-189"})
	want := []string{
		"internal/app imports internal/domain/definition: only a format's reader or writer, an edge, may know how data is kept",
		"internal/domain/prompt imports gopkg.in/yaml.v3: only a format's reader or writer, an edge, may know how data is kept",
	}
	if !slices.Equal(got, want) {
		t.Errorf("findings = %q, want %q", got, want)
	}
}

func TestACoreTypeTaggedWithAFormatIsAFinding(t *testing.T) {
	t.Parallel()
	got := findings(couplings(map[string][]string{}, []string{"internal/domain/settings"}), nil)
	want := []string{"internal/domain/settings tags its fields: only a format's reader or writer, an edge, may know how data is kept"}
	if !slices.Equal(got, want) {
		t.Errorf("findings = %q, want %q", got, want)
	}
}

func TestTheEdgesMayKnowFormats(t *testing.T) {
	t.Parallel()
	imports := map[string][]string{
		"internal/domain/definition": {"gopkg.in/yaml.v3", "github.com/BurntSushi/toml", "io/fs"},
		"internal/adapters/fsruns":   {"encoding/json", "os"},
		"internal/cli":               {"encoding/json"},
		"pages":                      {"gopkg.in/yaml.v3", "encoding/json", "internal/domain/definition"},
		"cmd/agister":                {"os", "internal/domain/definition"},
	}
	tagged := []string{"internal/adapters/fsruns", "pages"}
	if got := findings(couplings(imports, tagged), nil); len(got) > 0 {
		t.Errorf("findings = %q, want none", got)
	}
}

func TestAnAllowedCouplingThatIsGoneIsAFinding(t *testing.T) {
	t.Parallel()
	got := findings(nil, map[string]string{"internal/domain/run tags its fields": "LAB-189"})
	want := []string{"internal/domain/run tags its fields (LAB-189) is gone: remove it from the allowed coupling"}
	if !slices.Equal(got, want) {
		t.Errorf("findings = %q, want %q", got, want)
	}
}
