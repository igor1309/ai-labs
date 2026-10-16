package cli_test

import (
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/cli"
)

// request is one request made on the port: its operation, where, and the
// kind listed or the document shown.
type request struct {
	op       string
	where    cli.Where
	kind     cli.Kind
	document cli.Document
}

// settingsSpy is a spy of cli's port: it keeps each request and gives
// what its test gives, whatever the request.
type settingsSpy struct {
	requests []request
	report   cli.Report
	listed   []cli.Listed
	shown    cli.Shown
	err      error
}

func (s *settingsSpy) Check(where cli.Where) (cli.Report, error) {
	s.requests = append(s.requests, request{op: "check", where: where})
	return s.report, s.err
}

func (s *settingsSpy) List(where cli.Where, kind cli.Kind) ([]cli.Listed, error) {
	s.requests = append(s.requests, request{op: "list", where: where, kind: kind})
	return s.listed, s.err
}

func (s *settingsSpy) Show(where cli.Where, document cli.Document) (cli.Shown, error) {
	s.requests = append(s.requests, request{op: "show", where: where, document: document})
	return s.shown, s.err
}

// ran is what a command printed and its exit code.
type ran struct {
	stdout, stderr string
	code           int
}

// run runs "agister <args>" over spy in the working directory "/work",
// the user's home directory "/u".
func run(t *testing.T, spy *settingsSpy, args ...string) ran {
	t.Helper()
	var stdout, stderr strings.Builder
	c, err := cli.New(spy, &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	code := c.Run(args, "/work", "/u")
	return ran{stdout: stdout.String(), stderr: stderr.String(), code: code}
}

func (r ran) expect(t *testing.T, stdout string, code int) {
	t.Helper()
	if r.stdout != stdout {
		t.Errorf("stdout\n got %q\nwant %q", r.stdout, stdout)
	}
	if r.stderr != "" {
		t.Errorf("stderr %q, want none", r.stderr)
	}
	if r.code != code {
		t.Errorf("exit %d, want %d", r.code, code)
	}
}

func source(file string, line int, layer cli.Layer) cli.Source {
	return cli.Source{File: file, Line: line, Layer: layer}
}

// commands.feature, "check prints every fault, every warning and the
// count".
func TestCheckPrintsEveryFaultEveryWarningAndTheCount(t *testing.T) {
	t.Parallel()
	w, p := cli.Document{Kind: cli.KindWorkflow, Name: "w"}, cli.Document{Kind: cli.KindProcess, Name: "p"}
	spy := &settingsSpy{report: cli.Report{
		Findings: []cli.Finding{{Document: p,
			Problems: []cli.Problem{{Source: source("/h/processes/p.yaml", 2, cli.LayerHome), Message: "prompt is missing"}},
			Refuses:  []cli.Document{w, p}}},
		Warnings: []cli.Warning{{Problem: cli.Problem{Source: source("/r/.agister/workflows/v.yaml", 3, cli.LayerRepository),
			Place: "steps[0]", Message: `its plan grants "network"`}, With: []cli.Document{{Kind: cli.KindWorkflow, Name: "v"}}}},
		Names: []cli.Status{{Document: cli.Document{Kind: cli.KindWorkflow, Name: "v"}, Resolves: true}, {Document: w}, {Document: p}},
	}}
	run(t, spy, "check").expect(t, `process p
  /h/processes/p.yaml:2: prompt is missing
  refuses workflow w, process p
warning: /r/.agister/workflows/v.yaml:3 steps[0]: its plan grants "network"
  with workflow v
1 resolves, 2 refused
`, 1)
}

// commands.feature, "check with a problem of no document and no name exits
// 1".
func TestCheckWithAProblemOfNoDocumentAndNoNameExits1(t *testing.T) {
	t.Parallel()
	spy := &settingsSpy{report: cli.Report{Problems: []cli.Problem{{Message: "home cannot be read"}}}}
	run(t, spy, "check").expect(t, "home cannot be read\n  refuses every request\n0 resolve, 0 refused\n", 1)
}

// commands.feature, "check with no fault exits 0".
func TestCheckWithNoFaultExits0(t *testing.T) {
	t.Parallel()
	spy := &settingsSpy{report: cli.Report{Names: []cli.Status{
		{Document: cli.Document{Kind: cli.KindWorkflow, Name: "w"}, Resolves: true},
		{Document: cli.Document{Kind: cli.KindAgent, Name: "a"}, Resolves: true},
	}}}
	run(t, spy, "check").expect(t, "2 resolve, 0 refused\n", 0)
}

// A blocked document is printed with the block's file, line and reason.
func TestCheckPrintsABlockWithItsReason(t *testing.T) {
	t.Parallel()
	p := cli.Document{Kind: cli.KindProcess, Name: "p"}
	spy := &settingsSpy{report: cli.Report{
		Findings: []cli.Finding{{Document: p, Block: &cli.Block{Reason: "not here", Source: source("/r/.agister/blocks.yaml", 1, cli.LayerRepository)}, Refuses: []cli.Document{p}}},
		Names:    []cli.Status{{Document: p}},
	}}
	run(t, spy, "check").expect(t, `process p
  /r/.agister/blocks.yaml:1: blocked: not here
  refuses process p
0 resolve, 1 refused
`, 1)
}

// commands.feature, "The launch directory and home". A relative --dir is
// the working directory's; --dir takes its value after "=" too.
func TestTheLaunchDirectoryAndHome(t *testing.T) {
	t.Parallel()
	cases := []struct {
		args   []string
		launch string
	}{
		{[]string{"check"}, "/work"},
		{[]string{"check", "--dir", "/d"}, "/d"},
		{[]string{"inspect", "processes", "--dir", "/d"}, "/d"},
		{[]string{"--dir=/d", "inspect", "process", "p"}, "/d"},
		{[]string{"check", "-dir", "d/e"}, "/work/d/e"},
	}
	for _, c := range cases {
		t.Run(strings.Join(c.args, " "), func(t *testing.T) {
			t.Parallel()
			spy := &settingsSpy{shown: cli.Shown{Held: true}}
			run(t, spy, c.args...)
			want := cli.Where{Launch: c.launch, Home: "/u/.agister"}
			if len(spy.requests) != 1 || spy.requests[0].where != want {
				t.Errorf("requests %+v, want one at %+v", spy.requests, want)
			}
		})
	}
}

// commands.feature, "A bad command prints its usage and exits 2". So do a
// flag it does not take, --dir with no directory, and no command.
func TestABadCommandPrintsItsUsageAndExits2(t *testing.T) {
	t.Parallel()
	cases := [][]string{
		{"inspect"},
		{"inspect", "runtimes"},
		{"inspect", "process"},
		{"check", "extra"},
		{"frobnicate"},
		{"check", "--verbose"},
		{"check", "--dir"},
		{"check", "--dir="},
		{},
	}
	for _, args := range cases {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			t.Parallel()
			spy := &settingsSpy{}
			got := run(t, spy, args...)
			if got.code != 2 {
				t.Errorf("exit %d, want 2", got.code)
			}
			if !strings.Contains(got.stderr, "usage:\n  agister check [--dir <directory>]\n") {
				t.Errorf("stderr %q, want the usage", got.stderr)
			}
			if got.stdout != "" {
				t.Errorf("stdout %q, want none", got.stdout)
			}
			if spy.requests != nil {
				t.Errorf("the port is asked %+v, want nothing", spy.requests)
			}
		})
	}
}

// A port that fails is reported on stderr, and the command exits 1.
func TestAFailureOfThePortIsReportedOnStderr(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{{"check"}, {"inspect", "agents"}, {"inspect", "agent", "a"}} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			t.Parallel()
			got := run(t, &settingsSpy{err: errors.New("the worktree root of /work: git failed")}, args...)
			if want := (ran{stderr: "agister: the worktree root of /work: git failed\n", code: 1}); got != want {
				t.Errorf("ran %+v, want %+v", got, want)
			}
		})
	}
}

// inspect.feature, "inspect asks the port to list a kind, or show one".
func TestInspectAsksThePortToListAKindOrShowOne(t *testing.T) {
	t.Parallel()
	where := cli.Where{Launch: "/work", Home: "/u/.agister"}
	cases := []struct {
		args string
		want request
	}{
		{"processes", request{op: "list", where: where, kind: cli.KindProcess}},
		{"workflows", request{op: "list", where: where, kind: cli.KindWorkflow}},
		{"agents", request{op: "list", where: where, kind: cli.KindAgent}},
		{"process p", request{op: "show", where: where, document: cli.Document{Kind: cli.KindProcess, Name: "p"}}},
		{"workflow w", request{op: "show", where: where, document: cli.Document{Kind: cli.KindWorkflow, Name: "w"}}},
		{"agent a", request{op: "show", where: where, document: cli.Document{Kind: cli.KindAgent, Name: "a"}}},
	}
	for _, c := range cases {
		t.Run(c.args, func(t *testing.T) {
			t.Parallel()
			spy := &settingsSpy{shown: cli.Shown{Held: true}}
			run(t, spy, append([]string{"inspect"}, strings.Fields(c.args)...)...)
			if want := []request{c.want}; !reflect.DeepEqual(spy.requests, want) {
				t.Errorf("requests %+v, want %+v", spy.requests, want)
			}
		})
	}
}

// inspect.feature, "A listing prints each name, its layers and whether it
// resolves".
func TestAListingPrintsEachNameItsLayersAndWhetherItResolves(t *testing.T) {
	t.Parallel()
	spy := &settingsSpy{listed: []cli.Listed{
		{Name: "a", Layers: []cli.Layer{cli.LayerHome, cli.LayerRepository}, Resolves: true},
		{Name: "b", Layers: []cli.Layer{cli.LayerProject}},
	}}
	run(t, spy, "inspect", "processes").expect(t, "a  home, repository  resolves\nb  project           refused\n", 0)
}

// inspect.feature, "A show prints each field with its source, then what
// resolves".
func TestAShowPrintsEachFieldWithItsSourceThenWhatResolves(t *testing.T) {
	t.Parallel()
	spy := &settingsSpy{shown: cli.Shown{
		Held:    true,
		Fields:  []cli.Field{{Place: "steps[0].agent", Value: "a", Source: source("/r/.agister/workflows/w.yaml", 4, cli.LayerRepository)}},
		Reached: []cli.Document{{Kind: cli.KindWorkflow, Name: "w"}, {Kind: cli.KindAgent, Name: "a"}},
		Plans: []cli.Plan{{Workflow: "w", Place: "steps[0]", Process: "p", Agent: "a", Runtime: "codex",
			Options: []string{"read-only"}, Required: []string{"repository.read"}, Allowed: []string{"repository.read", "network"},
			Granted: []string{"repository.read", "host.read"}, Extra: []string{"host.read"}, Withheld: []string{"network"}}},
		Warnings: []cli.Problem{{Source: source("/r/.agister/workflows/w.yaml", 3, cli.LayerRepository), Place: "steps[0]",
			Message: `its plan grants "host.read" beyond the allowed`}},
	}}
	run(t, spy, "inspect", "workflow", "w").expect(t, `steps[0].agent  "a"  /r/.agister/workflows/w.yaml:4  repository
reached workflow w, agent a
plan of w steps[0]: process p, agent a, runtime codex
  options: read-only
  required: repository.read
  allowed: repository.read, network
  granted: repository.read, host.read
  granted beyond the allowed: host.read
  withheld: network
warning: /r/.agister/workflows/w.yaml:3 steps[0]: its plan grants "host.read" beyond the allowed
`, 0)
}

// inspect.feature, "A show of a refused document prints the refusal with
// its chains".
func TestAShowOfARefusedDocumentPrintsTheRefusalWithItsChains(t *testing.T) {
	t.Parallel()
	spy := &settingsSpy{shown: cli.Shown{
		Held: true,
		Faults: []cli.Fault{{
			Chain: []cli.Link{
				{Document: cli.Document{Kind: cli.KindWorkflow, Name: "w"}},
				{Document: cli.Document{Kind: cli.KindAgent, Name: "a"}, Source: source("/r/.agister/workflows/w.yaml", 4, cli.LayerRepository), Place: "steps[0].agent"},
			},
			Problems: []cli.Problem{{Source: source("/u/.agister/agents/a.toml", 0, cli.LayerHome), Message: "runtime is missing"}},
		}},
	}}
	run(t, spy, "inspect", "workflow", "w").expect(t, `refused
  agent a
    chain: workflow w > agent a (/r/.agister/workflows/w.yaml:4 steps[0].agent)
    /u/.agister/agents/a.toml: runtime is missing
`, 0)
}

// inspect.feature, "A fault of no document is printed as such".
func TestAFaultOfNoDocumentIsPrintedAsSuch(t *testing.T) {
	t.Parallel()
	spy := &settingsSpy{shown: cli.Shown{Held: true, Faults: []cli.Fault{{Problems: []cli.Problem{{Message: "home cannot be read"}}}}}}
	run(t, spy, "inspect", "workflow", "w").expect(t, "refused\n  of no document\n    home cannot be read\n", 0)
}

// inspect.feature, "A document no layer holds is said so".
func TestADocumentNoLayerHoldsIsSaidSo(t *testing.T) {
	t.Parallel()
	run(t, &settingsSpy{}, "inspect", "agent", "z").expect(t, "no layer holds the agent z\n", 1)
}

// A value is printed quoted, so a value of many lines is one line.
func TestAFieldsValueIsQuoted(t *testing.T) {
	t.Parallel()
	spy := &settingsSpy{shown: cli.Shown{Held: true, Fields: []cli.Field{
		{Place: "instruction", Value: "Review it.\nThen judge.", Source: source("/u/.agister/processes/p.yaml", 2, cli.LayerHome)},
	}}}
	run(t, spy, "inspect", "process", "p").expect(t, "instruction  \"Review it.\\nThen judge.\"  /u/.agister/processes/p.yaml:2  home\n", 0)
}

// A command line is built with every collaborator, and fails without one.
func TestNewFailsWithoutACollaborator(t *testing.T) {
	t.Parallel()
	var out strings.Builder
	cases := []struct {
		name           string
		settings       cli.Settings
		stdout, stderr io.Writer
	}{
		{"no settings", nil, &out, &out},
		{"no stdout", &settingsSpy{}, nil, &out},
		{"no stderr", &settingsSpy{}, &out, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if _, err := cli.New(c.settings, c.stdout, c.stderr); err == nil {
				t.Error("built, want an error")
			}
		})
	}
}
