package definition_test

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

func doc(kind definition.Kind, name, text string) definition.Document {
	return definition.Document{Source: definition.Source{Kind: kind, Name: name, Path: name}, Bytes: []byte(text)}
}

// Every shipped example parses.
func TestExamplesParse(t *testing.T) {
	settings := examples.Settings()
	err := fs.WalkDir(settings, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, _ := fs.ReadFile(settings, path)
		name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		kind := definition.Kind(filepath.Dir(path))
		var parseErr error
		switch kind {
		case ".":
			_, parseErr = definition.ParseService(doc(definition.KindService, "service", string(data)))
		case definition.KindAgent:
			_, parseErr = definition.ParseAgent(doc(kind, name, string(data)))
		case definition.KindProcess:
			_, parseErr = definition.ParseProcess(doc(kind, name, string(data)))
		case definition.KindPolicy:
			_, parseErr = definition.ParsePolicy(doc(kind, name, string(data)))
		case definition.KindRuntime:
			_, parseErr = definition.ParseMapping(doc(kind, name, string(data)))
		case definition.KindWorkflow:
			_, parseErr = definition.ParseWorkflow(doc(kind, name, string(data)))
		case definition.KindVerify:
			_, parseErr = definition.ParseVerify(doc(kind, name, string(data)))
		}
		if parseErr != nil {
			t.Errorf("%s: %v", path, parseErr)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// A diff or changed-files value takes both revisions from git.revision
// values declared before it: base from the one resolving ${param.base}, head
// from the one resolving ${param.candidate}. Bound to ${param.*} instead, each
// would resolve its revision again, and the two could name different commits.
func TestShippedRevisionInputsUseTheValuesResolvedBeforeThem(t *testing.T) {
	settings := examples.Settings()
	shipped := map[string]fs.FS{
		"examples/settings": settings,
		"examples/codex":    os.DirFS("../../../examples/codex"),
		"examples/pi":       os.DirFS("../../../examples/pi"),
		"examples/opencode": os.DirFS("../../../examples/opencode"),
		".agister":          os.DirFS("../../../../.agister"),
	}
	exact := regexp.MustCompile(`^\$\{value\.([^}]+)\}$`)
	checked := 0
	for root, files := range shipped {
		entries, err := fs.ReadDir(files, string(definition.KindProcess))
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			data, err := fs.ReadFile(files, string(definition.KindProcess)+"/"+entry.Name())
			if err != nil {
				t.Fatal(err)
			}
			name := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			process, err := definition.ParseProcess(doc(definition.KindProcess, name, string(data)))
			if err != nil {
				t.Errorf("%s/processes/%s: %v", root, entry.Name(), err)
				continue
			}
			revisions := map[string]string{} // git.revision value name -> its rev
			for _, value := range process.Values {
				switch value.Source {
				case "git.revision":
					revisions[value.Name] = value.Args["rev"]
				case "git.diff", "git.changed_files":
					checked++
					for _, want := range [][2]string{{"base", "${param.base}"}, {"head", "${param.candidate}"}} {
						arg, wantRev := want[0], want[1]
						match := exact.FindStringSubmatch(value.Args[arg])
						if match == nil || revisions[match[1]] != wantRev {
							t.Errorf("%s/processes/%s: %s %s = %q, want ${value.<a git.revision value declared before it, with rev %s>}",
								root, entry.Name(), value.Name, arg, value.Args[arg], wantRev)
						}
					}
				}
			}
		}
	}
	if checked == 0 {
		t.Fatal("no git.diff or git.changed_files value was checked")
	}
}

// The research policy parses as written, except for the fields Agister
// refuses because it would not enforce them, and its constraints, which
// Agister does not know.
func TestResearchPolicyParsesInPlace(t *testing.T) {
	data, err := os.ReadFile("../../../../research/agister/research/verger/policies/static-review.yaml")
	if err != nil {
		t.Fatal(err)
	}
	_, err = definition.ParsePolicy(doc(definition.KindPolicy, "static-review", string(data)))
	var invalid *definition.InvalidError
	if !errors.As(err, &invalid) || strings.Join(invalid.Problems, "; ") != "constraints: unknown field; resources: not supported yet: Agister would not enforce it; artifacts: not supported yet: Agister would not enforce it" {
		t.Fatalf("err = %v", err)
	}
	policy, err := definition.ParsePolicy(doc(definition.KindPolicy, "static-review", string(withoutTopLevel(data, "constraints", "resources", "artifacts"))))
	if err != nil {
		t.Fatal(err)
	}
	limits := policy.Limits
	if limits.Timeout.String() != "20m0s" || strings.Join(limits.Allow, ",") != "repository.read,repository.diff,repository.search" ||
		strings.Join(limits.Deny, ",") != "repository.write,repository.history.write,process.execute,network" ||
		limits.Access != "read-only" || limits.Scope != "candidate" {
		t.Fatalf("limits = %+v", limits)
	}
}

func TestProcessParsing(t *testing.T) {
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", `
schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Do it.
  params:
    base: {default: main}
    focus: {}
  values:
    diff: {source: git.diff, base: "${param.base}", head: HEAD}
    focus: {source: param, name: focus}
workspace:
  checkout: diff
tools:
  require: [repository.read]
output:
  format: json
  schema: s
  require_valid: true
`))
	if err != nil {
		t.Fatal(err)
	}
	if process.Values[0].Name != "diff" || process.Values[1].Name != "focus" {
		t.Fatalf("value order not preserved: %+v", process.Values)
	}
	if bound, err := process.Values[0].Bind(map[string]string{"base": "trunk"}, nil); err != nil || bound["base"] != "trunk" || bound["head"] != "HEAD" {
		t.Fatalf("bound = %v, %v", bound, err)
	}
	if process.Params[0].Default != "main" || process.Params[1].HasDefault || process.Require[0] != "repository.read" || process.Output.Schema != "s" {
		t.Fatalf("process = %+v", process)
	}
}

func TestStrictParsingReportsEveryProblem(t *testing.T) {
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", `
schema: agister.process/v1alpha1
name: other
type: process
uses: reviewer
surprise: 1
timeout: soon
input:
  instruction: x
  values:
    v: {source: file, path: "${param.missing}"}
workspace:
  checkout: nothing
output:
  format: json
  schema: s
  require_valid: false
  result: {field: verdict, reject: [no]}
max_cost_usd: -1
constraints:
  agent.model_family: {not_equal: task.claim, on_unsatisfied: fail}
`))
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, want := range []string{
		`surprise: unknown field`,
		`name: "other" does not match`,
		`uses: must be "agent:<name>"`,
		`timeout: invalid duration "soon"`,
		`refers to ${param.missing}`,
		`workspace.checkout: "nothing" is not an input value`,
		`output.require_valid: must be true`,
		`output.result: unknown field`,
		`max_cost_usd: must be positive`,
		`constraints: unknown field`,
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("missing %q in:\n%v", want, err)
		}
	}
}

// The service must say which permissions write, even if none do.
func TestServiceDeclaresItsWritingPermissions(t *testing.T) {
	base := "schema = \"agister.service/v1alpha1\"\nmax_timeout = \"1h\"\npermissions = [\"read\", \"write\"]\n"
	for text, want := range map[string]string{
		base:                             "writing: is required",
		base + "writing = [\"erase\"]\n": `writing: "erase" is not in permissions`,
	} {
		if _, err := definition.ParseService(doc(definition.KindService, "service", text)); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: %v, want %q", text, err, want)
		}
	}
	for text, want := range map[string]string{base + "writing = []\n": "", base + "writing = [\"write\"]\n": "write"} {
		service, err := definition.ParseService(doc(definition.KindService, "service", text))
		if err != nil || strings.Join(service.Writing, ",") != want {
			t.Errorf("%q: writing %v, %v", text, service.Writing, err)
		}
	}
}

// A binary or unreadable document gets one plain problem, not a cascade of
// missing-field errors.
func TestUnreadableDocumentsReportOneProblem(t *testing.T) {
	dsStore := "\x00\x00\x00\x01Bud1\x00\x00"
	utf16 := "\xff\xfes\x00c\x00"
	parsers := map[string]func(string) error{
		"service": func(text string) error {
			_, err := definition.ParseService(doc(definition.KindService, "service", text))
			return err
		},
		"agent": func(text string) error {
			_, err := definition.ParseAgent(doc(definition.KindAgent, "a", text))
			return err
		},
		"policy": func(text string) error {
			_, err := definition.ParsePolicy(doc(definition.KindPolicy, "p", text))
			return err
		},
		"process": func(text string) error {
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", text))
			return err
		},
		"runtime": func(text string) error {
			_, err := definition.ParseMapping(doc(definition.KindRuntime, "r", text))
			return err
		},
	}
	for kind, parse := range parsers {
		for _, text := range []string{dsStore, utf16} {
			var invalid *definition.InvalidError
			if err := parse(text); !errors.As(err, &invalid) ||
				!reflect.DeepEqual(invalid.Problems, []string{"not a UTF-8 text file"}) {
				t.Errorf("%s %q: %v", kind, text, err)
			}
		}
	}
	var invalid *definition.InvalidError
	_, err := definition.ParseService(doc(definition.KindService, "service", "max_timeout = "))
	if !errors.As(err, &invalid) || len(invalid.Problems) != 1 {
		t.Errorf("malformed TOML: %v", err)
	}
}

// Verification is per primitive: a version vouches only for the primitives
// that list it.
func TestMappingVerification(t *testing.T) {
	mapping, err := definition.ParseMapping(doc(definition.KindRuntime, "r", `
schema: agister.runtime/v1alpha1
name: r
adapter: a
contract: a/1
primitives:
  select: any
  items:
    X: {grants: [p.one, p.two], verified: ["2.1."]}
    Y: {grants: [p.one]}
`))
	if err != nil {
		t.Fatal(err)
	}
	if !mapping.Verified("2.1.283") || mapping.Verified("2.2.0") || mapping.Verified("12.1.0") {
		t.Fatal("verified prefixes")
	}
	verified, unverified := mapping.ForVersion("2.1.283")
	if len(verified.Primitives) != 1 || verified.Primitives[0].Name != "X" || strings.Join(unverified, ",") != "Y" {
		t.Fatalf("for 2.1.283: %+v, unverified %v", verified.Primitives, unverified)
	}
	if verified, unverified := mapping.ForVersion("2.2.0"); len(verified.Primitives) != 0 || strings.Join(unverified, ",") != "X,Y" {
		t.Fatalf("for 2.2.0: %+v, unverified %v", verified.Primitives, unverified)
	}
	if verified, unverified := mapping.ForAnyVersion(); len(verified.Primitives) != 1 || strings.Join(unverified, ",") != "Y" {
		t.Fatalf("for any version: %+v, unverified %v", verified.Primitives, unverified)
	}
	// A prefix matches whole version components, with or without the dot.
	for prefix, versions := range map[string]map[string]bool{
		"2.1":  {"2.1.3": true, "2.1": true, "2.10.0": false, "2.11": false, "12.1.0": false},
		"2.1.": {"2.1.3": true, "2.10.0": false},
		"":     {"2.1.3": false},
	} {
		primitive := definition.Primitive{Verified: []string{prefix}}
		for version, want := range versions {
			if got := primitive.VerifiedFor(version); got != want {
				t.Errorf("prefix %q, version %s: verified %v, want %v", prefix, version, got, want)
			}
		}
	}
	if unknown := mapping.UnknownPermissions([]string{"p.one"}); strings.Join(unknown, ",") != "p.two" {
		t.Fatalf("unknown = %v", unknown)
	}
}

// A version list for the whole mapping is refused, so no old settings
// silently vouch for primitives nobody checked.
func TestMappingWideVerificationIsRefused(t *testing.T) {
	_, err := definition.ParseMapping(doc(definition.KindRuntime, "r", `
schema: agister.runtime/v1alpha1
name: r
adapter: a
contract: a/1
verified_versions: ["2.1."]
primitives:
  select: any
  items:
    X: {grants: [p.one]}
`))
	if err == nil || !strings.Contains(err.Error(), "verified_versions: no longer supported") {
		t.Fatalf("err = %v", err)
	}
}

// A primitive that grants nothing fits every plan, so it is rejected.
func TestMappingPrimitivesGrantSomething(t *testing.T) {
	for _, item := range []string{"X: {grants: []}", "X: {}"} {
		_, err := definition.ParseMapping(doc(definition.KindRuntime, "r", `
schema: agister.runtime/v1alpha1
name: r
adapter: a
contract: a/1
primitives:
  select: any
  items:
    Y: {grants: [p.one]}
    `+item+`
`))
		var invalid *definition.InvalidError
		if !errors.As(err, &invalid) || strings.Join(invalid.Problems, "; ") != "primitives.items.X.grants: must grant at least one permission" {
			t.Errorf("%s: %v", item, err)
		}
	}
}

func TestAgentRoundTrip(t *testing.T) {
	agent := definition.Agent{Name: "r", Runtime: "claude-code", Model: "opus", ModelFamily: "anthropic", Effort: "high", Session: definition.SessionResumable}
	parsed, err := definition.ParseAgent(doc(definition.KindAgent, "r", string(definition.FormatAgent(agent))))
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Name != "r" || parsed.Model != "opus" || parsed.ModelFamily != "anthropic" || parsed.Session != definition.SessionResumable {
		t.Fatalf("parsed = %+v", parsed)
	}
	if _, err := definition.ParseAgent(doc(definition.KindAgent, "r", "schema = \"agister.agent/v1alpha1\"\nname = \"r\"\nruntime = \"x\"\ncolour = \"red\"\n")); err == nil || !strings.Contains(err.Error(), "colour: unknown field") {
		t.Fatalf("err = %v", err)
	}
}

// withoutTopLevel drops the named top-level YAML fields and their blocks.
func withoutTopLevel(data []byte, keys ...string) []byte {
	var out []string
	skipping := false
	for _, line := range strings.Split(string(data), "\n") {
		if line != "" && line[0] != ' ' && line[0] != '#' {
			skipping = false
			for _, key := range keys {
				if strings.HasPrefix(line, key+":") {
					skipping = true
				}
			}
		}
		if !skipping {
			out = append(out, line)
		}
	}
	return []byte(strings.Join(out, "\n"))
}

// A value may use the resolved text of a value declared before it, never
// of itself or of a later one: values resolve in order.
func TestValuesReferToValuesDeclaredBeforeThem(t *testing.T) {
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", `
schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Do it.
  params:
    base: {default: main}
  values:
    base_revision: {source: git.revision, rev: "${param.base}"}
    diff: {source: git.diff, base: "${value.base_revision}", head: "${param.base}"}
output:
  format: text
`))
	if err != nil {
		t.Fatal(err)
	}
	diff := process.Values[1]
	// One pass: a param whose text looks like a reference stays as it is.
	bound, err := diff.Bind(map[string]string{"base": "${value.base_revision}"}, map[string]string{"base_revision": "abc123"})
	if err != nil || !reflect.DeepEqual(bound, map[string]string{"base": "abc123", "head": "${value.base_revision}"}) {
		t.Fatalf("bound = %v, %v", bound, err)
	}
	if _, err := diff.Bind(map[string]string{"base": "main"}, nil); err == nil || !strings.Contains(err.Error(), "refers to ${value.base_revision}, which has no text value") {
		t.Fatalf("binding without the value's text: %v", err)
	}

	_, err = definition.ParseProcess(doc(definition.KindProcess, "p", `
schema: agister.process/v1alpha1
name: p
type: process
uses: agent:a
input:
  instruction: Do it.
  values:
    diff: {source: git.diff, base: "${value.base_revision}", head: "${value.diff}"}
    base_revision: {source: git.revision, rev: HEAD}
    notes: {source: file, path: "${value.missing}"}
output:
  format: text
`))
	for _, want := range []string{
		"input.values.diff: refers to ${value.base_revision}, which is not an input value declared before it",
		"input.values.diff: refers to ${value.diff}, which is not an input value declared before it",
		"input.values.notes: refers to ${value.missing}, which is not an input value declared before it",
	} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("missing %q in:\n%v", want, err)
		}
	}
}

const stalePolicy = `schema: agister.process-policy/v1alpha1
name: pol
timeout: 20m
`

// A policy declares its staleness limits in a stale block; each is
// optional, and unset when the block is.
func TestPolicyDeclaresStalenessLimits(t *testing.T) {
	policy, err := definition.ParsePolicy(doc(definition.KindPolicy, "pol", stalePolicy))
	if err != nil || policy.Limits.Stale != (definition.Stale{}) {
		t.Fatalf("without the block: %+v, %v", policy.Limits.Stale, err)
	}
	policy, err = definition.ParsePolicy(doc(definition.KindPolicy, "pol", stalePolicy+`stale:
  no_event: 5m
  no_output: 2m
  tool_command: 20m
  repeated_tool_calls: 5
`))
	if err != nil {
		t.Fatal(err)
	}
	stale := policy.Limits.Stale
	if *stale.NoEvent != 5*time.Minute || *stale.NoOutput != 2*time.Minute || *stale.ToolCommand != 20*time.Minute || *stale.RepeatedToolCalls != 5 {
		t.Fatalf("stale = %+v", stale)
	}
	policy, err = definition.ParsePolicy(doc(definition.KindPolicy, "pol", stalePolicy+"stale: {no_event: 5m}\n"))
	if err != nil || *policy.Limits.Stale.NoEvent != 5*time.Minute || policy.Limits.Stale.NoOutput != nil || policy.Limits.Stale.RepeatedToolCalls != nil {
		t.Fatalf("one limit: %+v, %v", policy.Limits.Stale, err)
	}
}

func TestStalenessLimitProblems(t *testing.T) {
	for block, want := range map[string]string{
		"stale: {no_event: soon}":           `stale.no_event: invalid duration "soon"`,
		"stale: {no_event: 30m}":            "stale.no_event: 30m0s exceeds timeout 20m0s",
		"stale: {no_output: 21m}":           "stale.no_output: 21m0s exceeds timeout 20m0s",
		"stale: {tool_command: 1h}":         "stale.tool_command: 1h0m0s exceeds timeout 20m0s",
		"stale: {repeated_tool_calls: 1}":   "stale.repeated_tool_calls: must be at least 2",
		"stale: {repeated_tool_calls: two}": "stale.repeated_tool_calls: ",
		"stale: {idle: 5m}":                 "stale.idle: unknown field",
	} {
		_, err := definition.ParsePolicy(doc(definition.KindPolicy, "pol", stalePolicy+block+"\n"))
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", block, err, want)
		}
	}
}
