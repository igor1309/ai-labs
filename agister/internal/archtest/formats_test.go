package archtest

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
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

// validNameForwarders lists the names that forward document.ValidName,
// regardless of visibility or the document import's name. A direct call
// does not introduce another name for the rule.
func validNameForwarders(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), filepath.Join(dir, name), nil, 0)
		if err != nil {
			t.Fatal(err)
		}
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
		isValidName := func(expr ast.Expr) bool {
			switch expr := ast.Unparen(expr).(type) {
			case *ast.SelectorExpr:
				pkg, ok := expr.X.(*ast.Ident)
				return ok && pkg.Obj == nil && slices.Contains(imports, pkg.Name) && expr.Sel.Name == "ValidName"
			case *ast.Ident:
				return expr.Obj == nil && expr.Name == "ValidName" && slices.Contains(imports, ".")
			}
			return false
		}
		for _, decl := range file.Decls {
			switch decl := decl.(type) {
			case *ast.FuncDecl:
				if validNameWrapper(decl.Type, decl.Body, isValidName) {
					found = append(found, decl.Name.Name)
				}
			case *ast.GenDecl:
				for _, spec := range decl.Specs {
					value, ok := spec.(*ast.ValueSpec)
					if !ok {
						continue
					}
					for i, expr := range value.Values {
						forward := isValidName(expr)
						if function, ok := ast.Unparen(expr).(*ast.FuncLit); ok {
							forward = validNameWrapper(function.Type, function.Body, isValidName)
						}
						if forward {
							found = append(found, value.Names[i].Name)
						}
					}
				}
			}
		}
	}
	return found
}

// validNameWrapper follows unchanged parameters and the rule's result
// through straight-line locals and named results. Object identity keeps
// shadowed names distinct; other statements may add policy or change a
// result indirectly, so they are not treated as forwarding.
func validNameWrapper(typ *ast.FuncType, body *ast.BlockStmt, isValidName func(ast.Expr) bool) bool {
	if body == nil || typ.Results == nil || len(typ.Results.List) != 1 || len(typ.Results.List[0].Names) > 1 {
		return false
	}
	// Zero means an unknown or changed value, positive values identify
	// the original parameters, and -1 is the unchanged ValidName result.
	values := make(map[*ast.Object]int)
	params := 0
	for _, field := range typ.Params.List {
		for _, param := range field.Names {
			params++
			values[param.Obj] = params
		}
	}
	value := func(expr ast.Expr) int {
		switch expr := ast.Unparen(expr).(type) {
		case *ast.Ident:
			return values[expr.Obj]
		case *ast.CallExpr:
			if !isValidName(expr.Fun) || expr.Ellipsis.IsValid() || len(expr.Args) != params {
				return 0
			}
			for i, arg := range expr.Args {
				ident, ok := ast.Unparen(arg).(*ast.Ident)
				if !ok || ident.Obj == nil || values[ident.Obj] != i+1 {
					return 0
				}
			}
			return -1
		}
		return 0
	}
	assign := func(names []*ast.Ident, exprs []ast.Expr) bool {
		if len(exprs) != 0 && len(names) != len(exprs) {
			return false
		}
		next := make([]int, len(names))
		for i, expr := range exprs {
			pure := true
			ast.Inspect(expr, func(node ast.Node) bool {
				if call, ok := node.(*ast.CallExpr); ok && !isValidName(call.Fun) {
					pure = false
				}
				return pure
			})
			if !pure {
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
		case *ast.AssignStmt:
			if stmt.Tok != token.ASSIGN && stmt.Tok != token.DEFINE {
				return false
			}
			var names []*ast.Ident
			for _, lhs := range stmt.Lhs {
				name, ok := lhs.(*ast.Ident)
				if !ok {
					return false
				}
				names = append(names, name)
			}
			if !assign(names, stmt.Rhs) {
				return false
			}
		case *ast.DeclStmt:
			decl, ok := stmt.Decl.(*ast.GenDecl)
			if !ok || decl.Tok != token.VAR {
				return false
			}
			for _, spec := range decl.Specs {
				declared := spec.(*ast.ValueSpec)
				if !assign(declared.Names, declared.Values) {
					return false
				}
			}
		case *ast.ReturnStmt:
			if i != len(body.List)-1 {
				return false
			}
			if len(stmt.Results) == 1 {
				return value(stmt.Results[0]) == -1
			}
			named := typ.Results.List[0].Names
			return len(stmt.Results) == 0 && len(named) == 1 && values[named[0].Obj] == -1
		default:
			return false
		}
	}
	return false
}

// redeclared lists, sorted, the exported names of the package in of that
// the package in dir declares too, and any name forwarding ValidName.
func redeclared(t *testing.T, dir, of string) []string {
	t.Helper()
	theirs := exported(t, of)
	var found []string
	for _, name := range exported(t, dir) {
		if slices.Contains(theirs, name) {
			found = append(found, name)
		}
	}
	found = append(found, validNameForwarders(t, dir)...)
	slices.Sort(found)
	return slices.Compact(found)
}

// The document vocabulary has one home, internal/domain/document. The
// parser names it there: a name of it declared in the parser's package
// again, as an alias, a constant, a variable or a forwarding function,
// lets a user reach the vocabulary through the parser.
func TestTheParserDeclaresNoneOfTheDocumentVocabulary(t *testing.T) {
	t.Parallel()
	for _, name := range redeclared(t, "../domain/definition", "../domain/document") {
		t.Errorf("internal/domain/definition declares %s: document vocabulary belongs to internal/domain/document, and its users name it there directly", name)
	}
}

// App's callers name the core rule directly, so app declares no helper
// or variable that gives document.ValidName another name (LAB-245).
func TestAppDeclaresNoValidNameForwarder(t *testing.T) {
	t.Parallel()
	for _, name := range validNameForwarders(t, "../app") {
		t.Errorf("internal/app declares %s: callers name document.ValidName directly", name)
	}
}

func TestAValidNameForwarderInAppIsFound(t *testing.T) {
	t.Parallel()
	type fixture struct {
		name, declaration string
		want              []string
	}
	cases := []fixture{
		{
			name: "variables",
			declaration: `var helper = document.ValidName
var ExportedHelper = (document.ValidName)
var (other, grouped = false, document.ValidName)`,
			want: []string{"ExportedHelper", "grouped", "helper"},
		},
		{
			name:        "renamed import",
			declaration: `var helper = vocabulary.ValidName; func ExportedHelper(name string) bool { valid := vocabulary.ValidName(name); return valid }`,
			want:        []string{"ExportedHelper", "helper"},
		},
		{
			name:        "dot import",
			declaration: `var helper = ValidName; var ExportedHelper = func(name string) (valid bool) { valid = ValidName(name); return }`,
			want:        []string{"ExportedHelper", "helper"},
		},
		{
			name: "ordinary use",
			declaration: `var Accepted = document.ValidName("agent")
func ParseName(name string) string { valid := document.ValidName(name); if !valid { return "" }; return name }
func Required(name string) bool { return name != "" && document.ValidName(name) }
type Checker struct { ValidName func(string) bool }
func (document Checker) Shadowed(name string) bool { valid := document.ValidName(name); return valid }`,
		},
	}
	for _, wrapper := range []struct {
		name, result, body string
		forward            bool
	}{
		{"direct", "bool", "return document.ValidName(name)", true},
		{"local", "bool", "valid := document.ValidName(name); return valid", true},
		{"declared", "bool", "var valid = document.ValidName(name); return valid", true},
		{"assigned", "bool", "var valid bool; valid = document.ValidName(name); return valid", true},
		{"named explicit", "(valid bool)", "valid = document.ValidName(name); return valid", true},
		{"named bare", "(valid bool)", "valid = document.ValidName(name); return", true},
		{"copied", "bool", "valid := (document.ValidName)((name)); copied := valid; return (copied)", true},
		{"negated", "bool", "valid := document.ValidName(name); return !valid", false},
		{"reassigned", "bool", "valid := document.ValidName(name); valid = false; return valid", false},
		{"named changed", "(valid bool)", "valid = document.ValidName(name); valid = !valid; return", false},
		{"input changed", "bool", `name = "agent"; valid := document.ValidName(name); return valid`, false},
		{"shadowed local", "bool", "valid := document.ValidName(name); { valid := false; return valid }; return valid", false},
		{"deferred change", "(valid bool)", "valid = document.ValidName(name); defer func() { valid = false }(); return", false},
		{"indirect change", "bool", "valid := document.ValidName(name); ignored := func() bool { valid = false; return true }(); _ = ignored; return valid", false},
	} {
		c := fixture{
			name: wrapper.name,
			declaration: fmt.Sprintf("func helper(name string) %s { %s }\nvar ExportedHelper = func(name string) %s { %s }",
				wrapper.result, wrapper.body, wrapper.result, wrapper.body),
		}
		if wrapper.forward {
			c.want = []string{"ExportedHelper", "helper"}
		}
		cases = append(cases, c)
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			importName := ""
			if c.name == "renamed import" {
				importName = "vocabulary "
			} else if c.name == "dot import" {
				importName = ". "
			}
			source := "package app\nimport " + importName + strconv.Quote(module+"/internal/domain/document") + "\n" + c.declaration
			if err := os.WriteFile(filepath.Join(dir, "helpers.go"), []byte(source), 0o600); err != nil {
				t.Fatal(err)
			}
			got := validNameForwarders(t, dir)
			slices.Sort(got)
			if !slices.Equal(got, c.want) {
				t.Errorf("ValidName forwarders in app = %q, want %q", got, c.want)
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
		"definition/variables.go": `package definition

import "` + module + `/internal/domain/document"

var ValidateName = document.ValidName
var validateName = document.ValidName
var Parenthesized = (document.ValidName)
var (
	other, Grouped = false, document.ValidName
)
var ValidateLiteral = func(name string) bool { return document.ValidName(name) }
var validateLiteral = func(name string) bool { return document.ValidName(name) }
var localLiteral = func(name string) bool { valid := document.ValidName(name); return valid }
var declaredLiteral = func(name string) bool { var valid = document.ValidName(name); return valid }
var assignedLiteral = func(name string) bool { var valid bool; valid = document.ValidName(name); return valid }
var namedLiteral = func(name string) (valid bool) { valid = document.ValidName(name); return valid }
var bareLiteral = func(name string) (valid bool) { valid = document.ValidName(name); return }
var copiedLiteral = func(name string) bool { valid := document.ValidName(name); copied := valid; return copied }
`,
		"definition/wrappers.go": `package definition

import "` + module + `/internal/domain/document"

func CheckName(name string) bool { return document.ValidName(name) }
func checkName(name string) bool { return document.ValidName(name) }
func checkParenthesized(name string) bool { return (document.ValidName)((name)) }
func localWrapper(name string) bool { valid := document.ValidName(name); return valid }
func declaredWrapper(name string) bool { var valid = document.ValidName(name); return valid }
func assignedWrapper(name string) bool { var valid bool; valid = document.ValidName(name); return valid }
func namedWrapper(name string) (valid bool) { valid = document.ValidName(name); return valid }
func bareWrapper(name string) (valid bool) { valid = document.ValidName(name); return }
func copiedWrapper(name string) bool { valid := document.ValidName(name); copied := valid; return (copied) }
`,
		"definition/renamed.go": `package definition

import vocabulary "` + module + `/internal/domain/document"

var RenamedVariable = vocabulary.ValidName
func renamedWrapper(name string) bool { return vocabulary.ValidName(name) }
`,
		"definition/unqualified.go": `package definition

import . "` + module + `/internal/domain/document"

var UnqualifiedVariable = ValidName
func unqualifiedWrapper(name string) bool { return ValidName(name) }
`,
		// None of these gives the package a name of the vocabulary: a
		// method, a type local to a function, an unexported name, a name
		// of the parser's own, direct calls, another package's rule, a
		// local value with the import's name, and a test file's alias.
		"definition/own.go": `package definition

import "` + module + `/internal/domain/document"

type Process struct{}

func (p Process) Document() document.Document { return document.Document{} }

func ParseProcess() { type Source struct{} }

type source struct{}

var Accepted = document.ValidName("agent")

func ParseName(name string) string {
	if !document.ValidName(name) { return "" }
	return name
}

func CheckRequiredName(name string) bool { return name != "" && document.ValidName(name) }

func ParseStoredName(name string) string {
	valid := document.ValidName(name)
	if !valid { return "" }
	return name
}

func NegatedResult(name string) bool { valid := document.ValidName(name); return !valid }
func ChangedResult(name string) bool { valid := document.ValidName(name); valid = false; return valid }
func ChangedNamedResult(name string) (valid bool) { valid = document.ValidName(name); valid = !valid; return }
func ChangedInput(name string) bool { name = "agent"; valid := document.ValidName(name); return valid }
func ShadowedResult(name string) bool { valid := document.ValidName(name); { valid := false; return valid }; return valid }
func DeferredChange(name string) (valid bool) { valid = document.ValidName(name); defer func() { valid = false }(); return }
var ChangedLiteral = func(name string) bool { valid := document.ValidName(name); valid = !valid; return valid }
var ChangedNamedLiteral = func(name string) (valid bool) { valid = document.ValidName(name); valid = false; return }
`,
		"definition/other.go": `package definition

import document "example.com/other/internal/domain/document"

var OtherVariable = document.ValidName
func OtherWrapper(name string) bool { return document.ValidName(name) }
`,
		"definition/shadowed.go": `package definition

import "` + module + `/internal/domain/document"

type Checker struct { ValidName func(string) bool }

func (document Checker) Shadowed(name string) bool { return document.ValidName(name) }
`,
		"definition/alias_test.go": `package definition

import "` + module + `/internal/domain/document"

type Source = document.Source
var TestVariable = document.ValidName
func testWrapper(name string) bool { return document.ValidName(name) }
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
	want := []string{
		"CheckName", "Composed", "ErrNotFound", "Grouped", "Kind", "KindAgent", "KindProcess",
		"Parenthesized", "RenamedVariable", "UnqualifiedVariable", "ValidName", "ValidateLiteral", "ValidateName",
		"assignedLiteral", "assignedWrapper", "bareLiteral", "bareWrapper", "checkName", "checkParenthesized",
		"copiedLiteral", "copiedWrapper", "declaredLiteral", "declaredWrapper", "localLiteral", "localWrapper",
		"namedLiteral", "namedWrapper", "renamedWrapper", "unqualifiedWrapper", "validateLiteral", "validateName",
	}
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
