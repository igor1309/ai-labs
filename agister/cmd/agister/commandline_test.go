package main

import (
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/settings/check"
)

// checkerSpy is a spy of check for cli's port: it gives the report, the
// listing and the show its test gives, and keeps the kind listed and the
// document shown.
type checkerSpy struct {
	report check.Report
	listed []check.Listed
	shown  check.Shown
	err    error
	kinds  []check.Kind
	shows  []check.Reference
}

func (s *checkerSpy) Check() check.Report { return s.report }

func (s *checkerSpy) List(kind check.Kind) ([]check.Listed, error) {
	s.kinds = append(s.kinds, kind)
	return s.listed, s.err
}

func (s *checkerSpy) Show(document check.Reference) (check.Shown, error) {
	s.shows = append(s.shows, document)
	return s.shown, s.err
}

// built are the home and launch directory each checker was built at.
type built struct{ home, launch string }

// settingsOf is cli's port over spy and home's folder "/u/.agister", each
// checker built at the home and launch directory it keeps in builds; err
// fails the build.
func settingsOf(t *testing.T, spy *checkerSpy, builds *[]built, err error) *settings {
	t.Helper()
	s, e := newSettings("/u/.agister", func(home, launch string) (inspector, error) {
		*builds = append(*builds, built{home: home, launch: launch})
		if err != nil {
			return nil, err
		}
		return spy, nil
	})
	if e != nil {
		t.Fatal(e)
	}
	return s
}

// launch is the launch directory of each request.
const launch = "/r/a"

func checkSource(file string, line int, layer check.Layer) check.Source {
	return check.Source{File: file, Line: line, Layer: layer}
}

func cliSourceOf(file string, line int, layer cli.Layer) cli.Source {
	return cli.Source{File: file, Line: line, Layer: layer}
}

// Check's report is given to cli whole, each kind and layer in cli's
// words, from a checker built at home's folder, which the port is given,
// and the request's launch directory.
func TestCLIsCheckComesFromCheck(t *testing.T) {
	t.Parallel()
	w, p := check.Reference{Kind: check.KindWorkflow, Name: "w"}, check.Reference{Kind: check.KindProcess, Name: "p"}
	spy := &checkerSpy{report: check.Report{
		Problems: []check.Problem{{Source: checkSource("/u/.agister", 0, check.LayerHome), Message: "the layer's folder does not exist"}},
		Findings: []check.Finding{
			{Document: p, Problems: []check.Problem{{Source: checkSource("/r/.agister/processes/p.yaml", 2, check.LayerRepository), Place: "prompt", Message: "it is missing"}}, Refuses: []check.Reference{w, p}},
			{Document: check.Reference{Kind: check.KindSkill, Name: "k"}, Block: &check.Block{Reason: "not here", Source: checkSource("/r/.agister/blocks.yaml", 1, check.LayerRepository)}, Refuses: []check.Reference{w}},
		},
		Warnings: []check.Warning{{Problem: check.Problem{Source: checkSource("/r/a/.agister/workflows/v.yaml", 3, check.LayerProject), Place: "steps[0]", Message: "grants"}, With: []check.Reference{{Kind: check.KindWorkflow, Name: "v"}}}},
		Names:    []check.Status{{Document: w}, {Document: check.Reference{Kind: check.KindRuntime, Name: "r"}, Resolves: true}},
	}}
	var builds []built
	got, err := settingsOf(t, spy, &builds, nil).Check(launch)
	if err != nil {
		t.Fatal(err)
	}
	cw, cp := cli.Document{Kind: cli.KindWorkflow, Name: "w"}, cli.Document{Kind: cli.KindProcess, Name: "p"}
	want := cli.Report{
		Problems: []cli.Problem{{Source: cliSourceOf("/u/.agister", 0, cli.LayerHome), Message: "the layer's folder does not exist"}},
		Findings: []cli.Finding{
			{Document: cp, Problems: []cli.Problem{{Source: cliSourceOf("/r/.agister/processes/p.yaml", 2, cli.LayerRepository), Place: "prompt", Message: "it is missing"}}, Refuses: []cli.Document{cw, cp}},
			{Document: cli.Document{Kind: cli.KindSkill, Name: "k"}, Block: &cli.Block{Reason: "not here", Source: cliSourceOf("/r/.agister/blocks.yaml", 1, cli.LayerRepository)}, Refuses: []cli.Document{cw}},
		},
		Warnings: []cli.Warning{{Problem: cli.Problem{Source: cliSourceOf("/r/a/.agister/workflows/v.yaml", 3, cli.LayerProject), Place: "steps[0]", Message: "grants"}, With: []cli.Document{{Kind: cli.KindWorkflow, Name: "v"}}}},
		Names:    []cli.Status{{Document: cw}, {Document: cli.Document{Kind: cli.KindRuntime, Name: "r"}, Resolves: true}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("report\n got %+v\nwant %+v", got, want)
	}
	if want := []built{{home: "/u/.agister", launch: "/r/a"}}; !reflect.DeepEqual(builds, want) {
		t.Errorf("checkers built at %+v, want %+v", builds, want)
	}
}

// A listing asks check for the kind in check's words, and gives each name
// with its layers in cli's.
func TestCLIsListComesFromCheck(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind cli.Kind
		want check.Kind
	}{
		{cli.KindProcess, check.KindProcess},
		{cli.KindWorkflow, check.KindWorkflow},
		{cli.KindAgent, check.KindAgent},
	}
	for _, c := range cases {
		t.Run(string(c.kind), func(t *testing.T) {
			t.Parallel()
			spy := &checkerSpy{listed: []check.Listed{
				{Name: "a", Layers: []check.Layer{check.LayerHome, check.LayerRepository}, Resolves: true},
				{Name: "b", Layers: []check.Layer{check.LayerProject}},
			}}
			var builds []built
			got, err := settingsOf(t, spy, &builds, nil).List(launch, c.kind)
			if err != nil {
				t.Fatal(err)
			}
			want := []cli.Listed{
				{Name: "a", Layers: []cli.Layer{cli.LayerHome, cli.LayerRepository}, Resolves: true},
				{Name: "b", Layers: []cli.Layer{cli.LayerProject}},
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("listed %+v, want %+v", got, want)
			}
			if want := []check.Kind{c.want}; !reflect.DeepEqual(spy.kinds, want) {
				t.Errorf("check lists %q, want %q", spy.kinds, want)
			}
			if want := []built{{home: "/u/.agister", launch: "/r/a"}}; !reflect.DeepEqual(builds, want) {
				t.Errorf("checkers built at %+v, want %+v", builds, want)
			}
		})
	}
}

// A show asks check for the document in check's words, and gives it
// whole in cli's: its fields, what it reached, its plans and its
// warnings; or its faults, each with its chain.
func TestCLIsShowComesFromCheck(t *testing.T) {
	t.Parallel()
	checkPlan := check.Plan{Workflow: "w", Place: "steps[0]", Process: "p", Agent: "a", Runtime: "r",
		Options: []string{"o"}, Required: []string{"read"}, Allowed: []string{"read", "write"}, Granted: []string{"read", "net"},
		Extra: []string{"net"}, Withheld: []string{"write"}}
	cliPlan := cli.Plan{Workflow: "w", Place: "steps[0]", Process: "p", Agent: "a", Runtime: "r",
		Options: []string{"o"}, Required: []string{"read"}, Allowed: []string{"read", "write"}, Granted: []string{"read", "net"},
		Extra: []string{"net"}, Withheld: []string{"write"}}
	cases := []struct {
		name  string
		shown check.Shown
		want  cli.Shown
	}{
		{"resolving",
			check.Shown{Held: true,
				Fields: []check.Field{{Place: "steps[0].agent", Value: "a", Source: checkSource("/r/.agister/workflows/w.yaml", 4, check.LayerRepository)}},
				Resolved: check.Resolved{
					Reached:  []check.Reference{{Kind: check.KindWorkflow, Name: "w"}, {Kind: check.KindBrief, Name: "goal"}},
					Plans:    []check.Plan{checkPlan},
					Warnings: []check.Problem{{Source: checkSource("/u/.agister/workflows/w.yaml", 3, check.LayerHome), Place: "steps[0]", Message: "grants"}},
				}},
			cli.Shown{Held: true,
				Fields:   []cli.Field{{Place: "steps[0].agent", Value: "a", Source: cliSourceOf("/r/.agister/workflows/w.yaml", 4, cli.LayerRepository)}},
				Reached:  []cli.Document{{Kind: cli.KindWorkflow, Name: "w"}, {Kind: cli.KindBrief, Name: "goal"}},
				Plans:    []cli.Plan{cliPlan},
				Warnings: []cli.Problem{{Source: cliSourceOf("/u/.agister/workflows/w.yaml", 3, cli.LayerHome), Place: "steps[0]", Message: "grants"}},
			}},
		{"refused",
			check.Shown{Held: true, Faults: []check.Fault{
				{Chain: []check.Link{
					{Kind: check.KindWorkflow, Name: "w"},
					{Kind: check.KindAgent, Name: "a", Source: checkSource("/r/.agister/workflows/w.yaml", 4, check.LayerRepository), Place: "steps[0].agent"},
				}, Problems: []check.Problem{{Source: checkSource("/u/.agister/agents/a.toml", 0, check.LayerHome), Message: "runtime is missing"}}},
				{Chain: []check.Link{{Kind: check.KindProcess, Name: "p"}}, Block: &check.Block{Reason: "not here", Source: checkSource("/r/.agister/blocks.yaml", 1, check.LayerRepository)}},
				{Problems: []check.Problem{{Message: "home cannot be read"}}},
			}},
			cli.Shown{Held: true, Faults: []cli.Fault{
				{Chain: []cli.Link{
					{Document: cli.Document{Kind: cli.KindWorkflow, Name: "w"}},
					{Document: cli.Document{Kind: cli.KindAgent, Name: "a"}, Source: cliSourceOf("/r/.agister/workflows/w.yaml", 4, cli.LayerRepository), Place: "steps[0].agent"},
				}, Problems: []cli.Problem{{Source: cliSourceOf("/u/.agister/agents/a.toml", 0, cli.LayerHome), Message: "runtime is missing"}}},
				{Chain: []cli.Link{{Document: cli.Document{Kind: cli.KindProcess, Name: "p"}}}, Block: &cli.Block{Reason: "not here", Source: cliSourceOf("/r/.agister/blocks.yaml", 1, cli.LayerRepository)}},
				{Problems: []cli.Problem{{Message: "home cannot be read"}}},
			}}},
		{"held by no layer", check.Shown{}, cli.Shown{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &checkerSpy{shown: c.shown}
			var builds []built
			got, err := settingsOf(t, spy, &builds, nil).Show(launch, cli.Document{Kind: cli.KindWorkflow, Name: "w"})
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("shown\n got %+v\nwant %+v", got, c.want)
			}
			if want := []check.Reference{{Kind: check.KindWorkflow, Name: "w"}}; !reflect.DeepEqual(spy.shows, want) {
				t.Errorf("check shows %+v, want %+v", spy.shows, want)
			}
			if want := []built{{home: "/u/.agister", launch: "/r/a"}}; !reflect.DeepEqual(builds, want) {
				t.Errorf("checkers built at %+v, want %+v", builds, want)
			}
		})
	}
}

// A checker that cannot be built, and a listing or show check fails, fail
// the request with check's error.
func TestCLIsPortGivesChecksErrors(t *testing.T) {
	t.Parallel()
	failed := errors.New("check: no names")
	requests := map[string]func(s *settings) error{
		"check": func(s *settings) error { _, err := s.Check(launch); return err },
		"list":  func(s *settings) error { _, err := s.List(launch, cli.KindAgent); return err },
		"show": func(s *settings) error {
			_, err := s.Show(launch, cli.Document{Kind: cli.KindAgent, Name: "a"})
			return err
		},
	}
	for name, request := range requests {
		t.Run(name+", built", func(t *testing.T) {
			t.Parallel()
			var builds []built
			if err := request(settingsOf(t, &checkerSpy{}, &builds, failed)); err != failed {
				t.Errorf("error %v, want %v", err, failed)
			}
		})
		if name == "check" {
			continue
		}
		t.Run(name+", asked", func(t *testing.T) {
			t.Parallel()
			var builds []built
			if err := request(settingsOf(t, &checkerSpy{err: failed}, &builds, nil)); err != failed {
				t.Errorf("error %v, want %v", err, failed)
			}
		})
	}
	checkers := func(string, string) (inspector, error) { return &checkerSpy{}, nil }
	if _, err := newSettings("", checkers); err == nil {
		t.Error("settings built with no home, want an error")
	}
	if _, err := newSettings("/u/.agister", nil); err == nil {
		t.Error("settings built with no checkers, want an error")
	}
}
