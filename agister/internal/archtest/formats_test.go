package archtest

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
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
	"internal/app imports internal/domain/definition":             "LAB-188: takes the settings files' shape",
	"internal/app imports io/fs":                                  "LAB-188: reads the examples' files at init",
	"internal/app imports encoding/json":                          "LAB-188, LAB-189: the output schema's bytes, the record's view and the join's collection",
	"internal/app tags its fields":                                "LAB-189, LAB-192: the join's collection and the probe cache",
	"internal/contract imports encoding/json":                     "LAB-189: carries the record and the output as stored",
	"internal/contract tags its fields":                           "LAB-192: its types are the CLI's --json output",
	"internal/domain/policy imports internal/domain/definition":   "LAB-188: takes the service's and the process's file shape",
	"internal/domain/run imports encoding/json":                   "LAB-189: is the run record's file shape",
	"internal/domain/run tags its fields":                         "LAB-189: is the run record's file shape",
	"internal/domain/settings imports internal/domain/definition": "LAB-188: checks the settings documents across files",
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
