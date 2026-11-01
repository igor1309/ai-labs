package definition_test

import (
	"errors"
	"fmt"
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
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

func doc(kind document.Kind, name, text string) document.Document {
	return document.Document{Source: document.Source{Kind: kind, Name: name, Path: name}, Bytes: []byte(text)}
}

// Every shipped example parses.
func TestExamplesParse(t *testing.T) {
	t.Parallel()
	settings := examples.Settings()
	err := fs.WalkDir(settings, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, _ := fs.ReadFile(settings, path)
		name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		kind := document.Kind(filepath.Dir(path))
		var parseErr error
		switch kind {
		case ".":
			_, parseErr = definition.ParseService(doc(document.KindService, "service", string(data)))
		case document.KindAgent:
			_, parseErr = definition.ParseAgent(doc(kind, name, string(data)))
		case document.KindProcess:
			_, parseErr = definition.ParseProcess(doc(kind, name, string(data)))
		case document.KindRuntime:
			_, parseErr = definition.ParseMapping(doc(kind, name, string(data)))
		case document.KindWorkflow:
			_, parseErr = definition.ParseWorkflow(doc(kind, name, string(data)))
		case document.KindVerify:
			_, parseErr = definition.ParseVerify(doc(kind, name, string(data)))
		case document.KindPrompt:
			_, parseErr = definition.ParsePrompt(doc(kind, name, string(data)))
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

// Every YAML settings document holds exactly one YAML document: a second
// after a valid first, empty or not, is a problem, not a document left
// unread, and an empty file is still reported as empty. Each kind's first
// document is a shipped example, which parses alone.
func TestYAMLSettingsRejectMoreThanOneDocument(t *testing.T) {
	t.Parallel()
	parsers := map[document.Kind]struct {
		example string
		parse   func(string) error
	}{
		document.KindBrief: {"briefs/step.yaml", func(text string) error {
			_, err := definition.ParseBrief(doc(document.KindBrief, "step", text))
			return err
		}},
		document.KindProcess: {"processes/ask.yaml", func(text string) error {
			_, err := definition.ParseProcess(doc(document.KindProcess, "ask", text))
			return err
		}},
		document.KindRuntime: {"runtimes/claude-code.yaml", func(text string) error {
			_, err := definition.ParseMapping(doc(document.KindRuntime, "claude-code", text))
			return err
		}},
		document.KindVerify: {"verifies/repo.yaml", func(text string) error {
			_, err := definition.ParseVerify(doc(document.KindVerify, "repo", text))
			return err
		}},
		document.KindWorkflow: {"workflows/review_panel.yaml", func(text string) error {
			_, err := definition.ParseWorkflow(doc(document.KindWorkflow, "review_panel", text))
			return err
		}},
	}
	for kind, parser := range parsers {
		t.Run(string(kind), func(t *testing.T) {
			t.Parallel()
			data, err := fs.ReadFile(examples.Settings(), parser.example)
			if err != nil {
				t.Fatal(err)
			}
			first := string(data)
			if err := parser.parse(first); err != nil {
				t.Fatalf("the first document alone: %v", err)
			}
			for _, text := range []string{first + "---\n" + first, first + "---\n", "---\n---\n" + first} {
				var invalid *document.InvalidError
				if err := parser.parse(text); !errors.As(err, &invalid) ||
					!reflect.DeepEqual(invalid.Messages(), []string{"must hold exactly one YAML document"}) {
					t.Errorf("%q: %v", text, err)
				}
			}
			for _, text := range []string{"", "# nothing\n"} {
				var invalid *document.InvalidError
				if err := parser.parse(text); !errors.As(err, &invalid) ||
					!reflect.DeepEqual(invalid.Messages(), []string{"empty document"}) {
					t.Errorf("%q: %v", text, err)
				}
			}
		})
	}
}

// A diff or changed-files value takes both revisions from git.revision
// values declared before it: base from the one resolving ${param.base}, head
// from the one resolving ${param.candidate}. Bound to ${param.*} instead, each
// would resolve its revision again, and the two could name different commits.
// A process that extends a base is read laid over it, and a base is read
// through each process that extends it (ADR-030 rule 9).
func TestShippedRevisionInputsUseTheValuesResolvedBeforeThem(t *testing.T) {
	t.Parallel()
	settings := examples.Settings()
	shipped := map[string]fs.FS{
		"examples/settings": settings,
		"examples/codex":    os.DirFS("../../../examples/codex"),
		"examples/pi":       os.DirFS("../../../examples/pi"),
		"examples/opencode": os.DirFS("../../../examples/opencode"),
		"home":              os.DirFS("../../../home"),
	}
	exact := regexp.MustCompile(`^\$\{value\.([^}]+)\}$`)
	checked := 0
	for root, files := range shipped {
		entries, err := fs.ReadDir(files, string(document.KindProcess))
		if err != nil {
			t.Fatal(err)
		}
		docs := map[string]document.Document{}
		for _, entry := range entries {
			data, err := fs.ReadFile(files, string(document.KindProcess)+"/"+entry.Name())
			if err != nil {
				t.Fatal(err)
			}
			name := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			docs[name] = doc(document.KindProcess, name, string(data))
		}
		own := func(name string) (document.Document, error) {
			if doc, ok := docs[name]; ok {
				return doc, nil
			}
			return document.Document{}, fmt.Errorf("no process %s", name)
		}
		bases := map[string]bool{}
		for _, doc := range docs {
			if base := definition.Extends(doc, own); base != "" {
				bases[base] = true
			}
		}
		for _, entry := range entries {
			name := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			if bases[name] {
				continue
			}
			extended, err := definition.Extended(docs[name], own)
			if err != nil {
				t.Errorf("%s/processes/%s: %v", root, entry.Name(), err)
				continue
			}
			process, err := definition.ParseProcess(extended)
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

func TestProcessParsing(t *testing.T) {
	t.Parallel()
	process, err := definition.ParseProcess(doc(document.KindProcess, "p", `
schema: agister.process/v1alpha1
name: p
type: process
prompt: review
input:
  instruction: Do it.
  params:
    base: {default: main}
    focus: {}
  values:
    diff: {source: git.diff, base: "${param.base}", head: HEAD}
    focus: {source: param, name: focus}
workspace:
  revision: diff
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
	t.Parallel()
	_, err := definition.ParseProcess(doc(document.KindProcess, "p", `
schema: agister.process/v1alpha1
name: other
type: process
prompt: review
uses: reviewer
surprise: 1
timeout: soon
input:
  instruction: x
  values:
    v: {source: file, path: "${param.missing}"}
workspace:
  revision: nothing
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
		`uses: a process names no agent (ADR-030 rule 2)`,
		`timeout: invalid duration "soon"`,
		`refers to ${param.missing}`,
		`workspace.revision: "nothing" is not an input value`,
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
	t.Parallel()
	base := "schema = \"agister.service/v1alpha1\"\nmax_timeout = \"1h\"\npermissions = [\"read\", \"write\"]\n"
	for text, want := range map[string]string{
		base:                             "writing: is required",
		base + "writing = [\"erase\"]\n": `writing: "erase" is not in permissions`,
	} {
		if _, err := definition.ParseService(doc(document.KindService, "service", text)); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: %v, want %q", text, err, want)
		}
	}
	for text, want := range map[string]string{base + "writing = []\n": "", base + "writing = [\"write\"]\n": "write"} {
		service, err := definition.ParseService(doc(document.KindService, "service", text))
		if err != nil || strings.Join(service.Writing, ",") != want {
			t.Errorf("%q: writing %v, %v", text, service.Writing, err)
		}
	}
}

// A binary or unreadable document gets one plain problem, not a cascade of
// missing-field errors.
func TestUnreadableDocumentsReportOneProblem(t *testing.T) {
	t.Parallel()
	dsStore := "\x00\x00\x00\x01Bud1\x00\x00"
	utf16 := "\xff\xfes\x00c\x00"
	parsers := map[string]func(string) error{
		"service": func(text string) error {
			_, err := definition.ParseService(doc(document.KindService, "service", text))
			return err
		},
		"agent": func(text string) error {
			_, err := definition.ParseAgent(doc(document.KindAgent, "a", text))
			return err
		},
		"process": func(text string) error {
			_, err := definition.ParseProcess(doc(document.KindProcess, "p", text))
			return err
		},
		"runtime": func(text string) error {
			_, err := definition.ParseMapping(doc(document.KindRuntime, "r", text))
			return err
		},
	}
	for kind, parse := range parsers {
		for _, text := range []string{dsStore, utf16} {
			var invalid *document.InvalidError
			if err := parse(text); !errors.As(err, &invalid) ||
				!reflect.DeepEqual(invalid.Messages(), []string{"not a UTF-8 text file"}) {
				t.Errorf("%s %q: %v", kind, text, err)
			}
		}
	}
	var invalid *document.InvalidError
	_, err := definition.ParseService(doc(document.KindService, "service", "max_timeout = "))
	if !errors.As(err, &invalid) || len(invalid.Problems) != 1 {
		t.Errorf("malformed TOML: %v", err)
	}
}

// Verification is per primitive: each lists the versions it was verified
// against, and one that lists none was verified against none.
func TestMappingVerification(t *testing.T) {
	t.Parallel()
	mapping, err := definition.ParseMapping(doc(document.KindRuntime, "r", `
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
	want := []definition.Primitive{
		{Name: "X", Grants: []string{"p.one", "p.two"}, Verified: []string{"2.1."}},
		{Name: "Y", Grants: []string{"p.one"}},
	}
	if !reflect.DeepEqual(mapping.Primitives, want) {
		t.Fatalf("primitives = %+v, want %+v", mapping.Primitives, want)
	}
}

// A version list for the whole mapping is refused, so no old settings
// silently vouch for primitives nobody checked.
func TestMappingWideVerificationIsRefused(t *testing.T) {
	t.Parallel()
	_, err := definition.ParseMapping(doc(document.KindRuntime, "r", `
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
	t.Parallel()
	for _, item := range []string{"X: {grants: []}", "X: {}"} {
		_, err := definition.ParseMapping(doc(document.KindRuntime, "r", `
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
		var invalid *document.InvalidError
		if !errors.As(err, &invalid) || strings.Join(invalid.Messages(), "; ") != "primitives.items.X.grants: must grant at least one permission" {
			t.Errorf("%s: %v", item, err)
		}
	}
}

func TestAgentRoundTrip(t *testing.T) {
	t.Parallel()
	agent := definition.Agent{Name: "r", Runtime: "claude-code", Model: "opus", ModelFamily: "anthropic", Effort: "high"}
	parsed, err := definition.ParseAgent(doc(document.KindAgent, "r", string(definition.FormatAgent(agent))))
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Name != "r" || parsed.Model != "opus" || parsed.ModelFamily != "anthropic" || parsed.Effort != "high" {
		t.Fatalf("parsed = %+v", parsed)
	}
	if _, err := definition.ParseAgent(doc(document.KindAgent, "r", "schema = \"agister.agent/v1alpha1\"\nname = \"r\"\nruntime = \"x\"\ncolour = \"red\"\n")); err == nil || !strings.Contains(err.Error(), "colour: unknown field") {
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
	t.Parallel()
	process, err := definition.ParseProcess(doc(document.KindProcess, "p", `
schema: agister.process/v1alpha1
name: p
type: process
prompt: review
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

	_, err = definition.ParseProcess(doc(document.KindProcess, "p", `
schema: agister.process/v1alpha1
name: p
type: process
prompt: review
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

const staleProcess = `schema: agister.process/v1alpha1
name: p
type: process
prompt: review
input:
  instruction: Do it.
output:
  format: text
`

// staleTimed is a process with a timeout, which its staleness limits may
// not exceed.
const staleTimed = staleProcess + "timeout: 20m\n"

// A process declares its staleness limits in a stale block; each is
// optional, and unset when the block is.
func TestProcessDeclaresStalenessLimits(t *testing.T) {
	t.Parallel()
	process, err := definition.ParseProcess(doc(document.KindProcess, "p", staleTimed))
	if err != nil || process.Limits.Stale != (definition.Stale{}) {
		t.Fatalf("without the block: %+v, %v", process.Limits.Stale, err)
	}
	process, err = definition.ParseProcess(doc(document.KindProcess, "p", staleTimed+`stale:
  no_event: 5m
  no_output: 2m
  tool_command: 20m
  repeated_tool_calls: 5
`))
	if err != nil {
		t.Fatal(err)
	}
	stale := process.Limits.Stale
	if *stale.NoEvent != 5*time.Minute || *stale.NoOutput != 2*time.Minute || *stale.ToolCommand != 20*time.Minute || *stale.RepeatedToolCalls != 5 {
		t.Fatalf("stale = %+v", stale)
	}
	process, err = definition.ParseProcess(doc(document.KindProcess, "p", staleTimed+"stale: {no_event: 5m}\n"))
	if err != nil || *process.Limits.Stale.NoEvent != 5*time.Minute || process.Limits.Stale.NoOutput != nil || process.Limits.Stale.RepeatedToolCalls != nil {
		t.Fatalf("one limit: %+v, %v", process.Limits.Stale, err)
	}
}

func TestStalenessLimitProblems(t *testing.T) {
	t.Parallel()
	for block, want := range map[string]string{
		"stale: {no_event: soon}":           `stale.no_event: invalid duration "soon"`,
		"stale: {no_event: 30m}":            "stale.no_event: 30m0s exceeds timeout 20m0s",
		"stale: {no_output: 21m}":           "stale.no_output: 21m0s exceeds timeout 20m0s",
		"stale: {tool_command: 1h}":         "stale.tool_command: 1h0m0s exceeds timeout 20m0s",
		"stale: {repeated_tool_calls: 1}":   "stale.repeated_tool_calls: must be at least 2",
		"stale: {repeated_tool_calls: two}": "stale.repeated_tool_calls: ",
		"stale: {idle: 5m}":                 "stale.idle: unknown field",
	} {
		_, err := definition.ParseProcess(doc(document.KindProcess, "p", staleTimed+block+"\n"))
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", block, err, want)
		}
	}
}

// A process declares the recovery of a stale call in the stale block's
// recover block (ADR-024 rule 5): a budget, which may be 0, and the
// instruction. Each is optional, and unset when the block is.
func TestProcessDeclaresStaleRecovery(t *testing.T) {
	t.Parallel()
	const block = `stale:
  repeated_tool_calls: 5
  recover:
    max_resumes: 1
    instruction: >-
      Agister ended your previous turn; the evidence
      follows.
`
	const instruction = "Agister ended your previous turn; the evidence follows."
	process, err := definition.ParseProcess(doc(document.KindProcess, "p", staleProcess+block))
	if err != nil {
		t.Fatal(err)
	}
	if got := process.Limits.Stale.Recover; got.MaxResumes == nil || *got.MaxResumes != 1 || got.Instruction != instruction || *process.Limits.Stale.RepeatedToolCalls != 5 {
		t.Fatalf("recover = %+v", process.Limits.Stale)
	}

	process, err = definition.ParseProcess(doc(document.KindProcess, "p", staleProcess+"stale: {recover: {max_resumes: 0}}\n"))
	if err != nil {
		t.Fatal(err)
	}
	if got := process.Limits.Stale.Recover; got.MaxResumes == nil || *got.MaxResumes != 0 || got.Instruction != "" {
		t.Fatalf("0: recover = %+v", got)
	}
	process, err = definition.ParseProcess(doc(document.KindProcess, "p", staleProcess+"stale: {recover: {instruction: Go on.}}\n"))
	if err != nil || process.Limits.Stale.Recover != (definition.Recover{Instruction: "Go on."}) {
		t.Fatalf("an instruction alone: %+v, %v", process.Limits.Stale.Recover, err)
	}
	process, err = definition.ParseProcess(doc(document.KindProcess, "p", staleProcess+"stale: {no_event: 5m}\n"))
	if err != nil || process.Limits.Stale.Recover != (definition.Recover{}) {
		t.Fatalf("without the block: %+v, %v", process.Limits.Stale.Recover, err)
	}
}

func TestStaleRecoveryProblems(t *testing.T) {
	t.Parallel()
	for block, want := range map[string]string{
		"stale: {recover: {max_resumes: -1}}":           "stale.recover.max_resumes: must be at least 0",
		"stale: {recover: {max_resumes: one}}":          "stale.recover.max_resumes: must be an integer",
		"stale: {recover: {max_resumes: 1.5}}":          "stale.recover.max_resumes: must be an integer",
		"stale: {recover: {instruction: ''}}":           "stale.recover.instruction: must not be empty",
		"stale: {recover: {instruction: [a, b]}}":       "stale.recover.instruction: must be a scalar",
		"stale: {recover: {max_resumes: 1, nudge: go}}": "stale.recover.nudge: unknown field",
		"stale: {recover: 1}":                           "stale.recover: ",
	} {
		if _, err := definition.ParseProcess(doc(document.KindProcess, "p", staleProcess+block+"\n")); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", block, err, want)
		}
	}
}

// There are no policies (ADR-030 rule 4): a process that names one has a
// problem, whatever it names.
func TestAProcessNamesNoPolicy(t *testing.T) {
	t.Parallel()
	const want = "policy: there are no policies (ADR-030): set the policy's fields on the process and remove policy"
	for _, reference := range []string{"process-policy:read-only", "read-only", "''"} {
		_, err := definition.ParseProcess(doc(document.KindProcess, "p", staleTimed+"policy: "+reference+"\n"))
		var invalid *document.InvalidError
		if !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Messages(), []string{want}) {
			t.Errorf("policy: %s: err = %v, want only %q", reference, err, want)
		}
	}
}

// A process names no agent (ADR-030 rule 2): a workflow's node binds it to
// one. uses on a process is a problem, whatever it names.
func TestAProcessNamesNoAgent(t *testing.T) {
	t.Parallel()
	if _, err := definition.ParseProcess(doc(document.KindProcess, "p", staleTimed)); err != nil {
		t.Fatalf("without uses: %v", err)
	}
	const want = "uses: a process names no agent (ADR-030 rule 2): name the agent on each workflow node that binds the process, and remove uses"
	for _, uses := range []string{"agent:a", "a", "''", "[agent]"} {
		_, err := definition.ParseProcess(doc(document.KindProcess, "p", staleTimed+"uses: "+uses+"\n"))
		var invalid *document.InvalidError
		if !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Messages(), []string{want}) {
			t.Errorf("uses: %s: err = %v, want only %q", uses, err, want)
		}
	}
}

// An agent holds no session (ADR-030 rule 1): whether a call's session
// may be resumed is its process's to say. session on an agent is a
// problem, whatever it says.
func TestAnAgentHoldsNoSession(t *testing.T) {
	t.Parallel()
	const agent = "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"rt\"\n"
	if _, err := definition.ParseAgent(doc(document.KindAgent, "a", agent)); err != nil {
		t.Fatalf("without session: %v", err)
	}
	const want = "session: an agent holds no session (ADR-030 rule 1): set session on each process whose calls resume theirs, and remove it here"
	for _, session := range []string{`"resumable"`, `"fresh-only"`, `"sometimes"`, `""`, "1"} {
		_, err := definition.ParseAgent(doc(document.KindAgent, "a", agent+"session = "+session+"\n"))
		var invalid *document.InvalidError
		if !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Messages(), []string{want}) {
			t.Errorf("session = %s: err = %v, want only %q", session, err, want)
		}
	}
}

// A process may say whether its calls' session may be resumed (ADR-030
// rule 2): session, resumable or fresh-only, and unset when it says
// nothing.
func TestAProcessMaySayItsSession(t *testing.T) {
	t.Parallel()
	for text, want := range map[string]string{
		"":                      "",
		"session: resumable\n":  definition.SessionResumable,
		"session: fresh-only\n": definition.SessionFresh,
	} {
		process, err := definition.ParseProcess(doc(document.KindProcess, "p", staleTimed+text))
		if err != nil || process.Session != want {
			t.Errorf("%q: session = %q, %v, want %q", text, process.Session, err, want)
		}
	}
	for text, want := range map[string]string{
		"session: sometimes":   `session: unsupported session mode "sometimes" (supported: fresh-only, resumable)`,
		"session: ''":          `session: unsupported session mode "" (supported: fresh-only, resumable)`,
		"session: [resumable]": "session: must be a scalar",
	} {
		_, err := definition.ParseProcess(doc(document.KindProcess, "p", staleTimed+text+"\n"))
		var invalid *document.InvalidError
		if !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Messages(), []string{want}) {
			t.Errorf("%s: err = %v, want only %q", text, err, want)
		}
	}
}

// The session mode of a call is the one its process sets, and fresh-only
// where it sets none (ADR-030 rules 2 and 3).
func TestACallsSessionIsItsProcesss(t *testing.T) {
	t.Parallel()
	for set, want := range map[string]string{
		definition.SessionResumable: definition.SessionResumable,
		definition.SessionFresh:     definition.SessionFresh,
		"":                          definition.SessionFresh,
	} {
		if mode := definition.CallSession(definition.Process{Name: "p", Session: set}); mode != want {
			t.Errorf("process with session %q: %s, want %s", set, mode, want)
		}
	}
}

// A problem that names something this code does not know, as a document
// written for a newer Agister would, is marked: an unknown field, a list or
// a mapping where an input value's field is read as a scalar (LAB-122), and
// a schema of Agister's shape this code does not read. Any other mistake, a
// schema of another shape, a list of sources, a retired input argument or
// a field ADR-030 took from its document included, is not.
func TestProblemsNamingTheUnknownAreMarked(t *testing.T) {
	t.Parallel()
	process := func(schema, extra string) string {
		return "schema: " + schema + "\nname: p\ntype: process\nprompt: review\n" + extra +
			"input:\n  instruction: x\noutput:\n  format: text\n"
	}
	// A valid process but for its input values.
	inputs := func(values string) string {
		return "schema: agister.process/v1alpha1\nname: p\ntype: process\nprompt: review\n" +
			"input:\n  instruction: x\n  values:\n" + values + "output:\n  format: text\n"
	}
	agent := func(schema, extra string) string {
		return "schema = \"" + schema + "\"\nname = \"a\"\n" + extra
	}
	parsers := map[string]func(string) error{
		"process": func(text string) error {
			_, err := definition.ParseProcess(doc(document.KindProcess, "p", text))
			return err
		},
		"agent": func(text string) error {
			_, err := definition.ParseAgent(doc(document.KindAgent, "a", text))
			return err
		},
	}
	for _, c := range []struct {
		name, kind, text string
		want             document.Problem
	}{
		{"unknown field", "process", process("agister.process/v1alpha1", "future: 1\n"), document.Problem{Message: "future: unknown field", Unknown: true}},
		{"newer schema", "process", process("agister.process/v2", ""), document.Problem{Message: `schema: must be "agister.process/v1alpha1"`, Unknown: true}},
		{"another schema", "process", process("banana", ""), document.Problem{Message: `schema: must be "agister.process/v1alpha1"`}},
		{"input list", "process", inputs("    brief:\n      source: file\n      path: brief.md\n      future: [goal, step]\n"), document.Problem{Message: "input.values.brief.future: must be a scalar", Unknown: true}},
		{"input mapping", "process", inputs("    brief:\n      source: file\n      path:\n        from: brief.md\n"), document.Problem{Message: "input.values.brief.path: must be a scalar", Unknown: true}},
		{"null input field", "process", inputs("    brief:\n      source: file\n      path:\n"), document.Problem{Message: "input.values.brief.path: must be a scalar"}},
		{"a form not listed", "process", inputs("    brief:\n      source: file\n      path: brief.md\n      form: goal\n"), document.Problem{Message: "input.values.brief.form: must be a list of brief names"}},
		{"a retired argument", "process", inputs("    brief: {source: file, path: brief.md, optional: true}\n"), document.Problem{Message: "input.values.brief.optional: is no longer read (ADR-028): no input is optional; a prompt only some layers have is guidance those layers set"}},
		{"unknown TOML field", "agent", agent("agister.agent/v1alpha1", "runtime = \"rt\"\nfuture = 1\n"), document.Problem{Message: "future: unknown field", Unknown: true}},
		{"newer TOML schema", "agent", agent("agister.agent/v2", "runtime = \"rt\"\n"), document.Problem{Message: `schema: must be "agister.agent/v1alpha1"`, Unknown: true}},
		{"another TOML schema", "agent", agent("banana", "runtime = \"rt\"\n"), document.Problem{Message: `schema: must be "agister.agent/v1alpha1"`}},
		{"missing field", "agent", agent("agister.agent/v1alpha1", ""), document.Problem{Message: "runtime: is required"}},
		{"a process's agent", "process", process("agister.process/v1alpha1", "uses: agent:a\n"), document.Problem{Message: "uses: a process names no agent (ADR-030 rule 2): name the agent on each workflow node that binds the process, and remove uses"}},
		{"an agent's session", "agent", agent("agister.agent/v1alpha1", "runtime = \"rt\"\nsession = \"resumable\"\n"), document.Problem{Message: "session: an agent holds no session (ADR-030 rule 1): set session on each process whose calls resume theirs, and remove it here"}},
	} {
		var invalid *document.InvalidError
		if err := parsers[c.kind](c.text); !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Problems, []document.Problem{c.want}) {
			t.Errorf("%s: %#v, want %#v", c.name, err, c.want)
		}
	}

	// A list of sources is a mistake in a field this code knows.
	want := []document.Problem{{Message: "input.values.brief.source: must be a scalar"}, {Message: "input.values.brief.source: is required"}}
	var invalid *document.InvalidError
	if err := parsers["process"](inputs("    brief:\n      source: [file]\n      path: brief.md\n")); !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Problems, want) {
		t.Errorf("list of sources: %#v, want %#v", err, want)
	}
}

// An Extender reads and composes a base once, however many processes
// extend it: home's reviews each extend review.
func TestAnExtenderReadsEachBaseOnce(t *testing.T) {
	t.Parallel()
	files := os.DirFS("../../../home")
	entries, err := fs.ReadDir(files, string(document.KindProcess))
	if err != nil {
		t.Fatal(err)
	}
	docs := map[string]document.Document{}
	for _, entry := range entries {
		data, err := fs.ReadFile(files, string(document.KindProcess)+"/"+entry.Name())
		if err != nil {
			t.Fatal(err)
		}
		name := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		docs[name] = doc(document.KindProcess, name, string(data))
	}
	reads := map[string]int{}
	extender := definition.NewExtender(func(name string) (document.Document, error) {
		reads[name]++
		return docs[name], nil
	})
	extending := 0
	for _, doc := range docs {
		if extender.Extends(doc) == "review" {
			extending++
		}
	}
	if extending < 2 || reads["review"] != 1 {
		t.Fatalf("%d processes extend review, read %d times; want it read once", extending, reads["review"])
	}
}
