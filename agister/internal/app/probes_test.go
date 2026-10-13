package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// proberSpy answers each probe with probe and err, keeping the commands it
// was built for.
type proberSpy struct {
	mu     sync.Mutex
	probe  app.RuntimeProbe
	err    error
	probed []string
}

func (s *proberSpy) on(command string) app.RuntimeProber {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.probed = append(s.probed, command)
	return s
}

func (s *proberSpy) Probe(context.Context) (app.RuntimeProbe, error) { return s.probe, s.err }

func (s *proberSpy) commands() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.probed...)
}

// probeRecordsSpy keeps probes by adapter and version.
type probeRecordsSpy struct {
	mu     sync.Mutex
	probes map[string]app.RuntimeProbe
}

func (s *probeRecordsSpy) Read(adapter, version string) (app.RuntimeProbe, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	probe, ok := s.probes[adapter+" "+version]
	return probe, ok, nil
}

func (s *probeRecordsSpy) Write(adapter string, probe app.RuntimeProbe) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.probes == nil {
		s.probes = map[string]app.RuntimeProbe{}
	}
	s.probes[adapter+" "+probe.Version] = probe
	return nil
}

func probesOver(prober *proberSpy, records app.ProbeRecords) *app.Probes {
	return app.NewProbes(map[string]func(string) app.RuntimeProber{"spy": prober.on}, records, fixedClock{})
}

// A call on a version the settings verify no primitive for runs once a
// probe of the runtime verifies them, with the primitives the probe found
// holding, and the probe is recorded.
func TestACallOnAnUnverifiedVersionRunsOnceItsProbePasses(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.runner.identity.Version = "2.0.0"
	prober := &proberSpy{probe: app.RuntimeProbe{Version: "2.0.0", Primitives: []string{"Read", "Grep"}, Report: "held"}}
	records := &probeRecordsSpy{}
	h.probes = probesOver(prober, records)
	record := h.submit(t, h.clientOn(h.defs), contract.CallRequest{Process: "p_a"})
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result.Error)
	}
	if primitives := h.runner.calls()[0].Primitives; !reflect.DeepEqual(primitives, []string{"Read", "Grep"}) {
		t.Fatalf("primitives = %v", primitives)
	}
	if !reflect.DeepEqual(prober.commands(), []string{"/bin/spy"}) {
		t.Fatalf("probed = %v", prober.commands())
	}
	want := app.RuntimeProbe{Version: "2.0.0", Primitives: []string{"Read", "Grep"}, Report: "held", ProbedAt: fixedClock{}.Now()}
	if got := records.probes["spy 2.0.0"]; !reflect.DeepEqual(got, want) {
		t.Fatalf("recorded = %+v", got)
	}
}

// A call whose probe proves nothing, or finds no primitive holding, or
// another version, runs with a warning carrying the probe evidence (ADR-036).
func TestACallWhoseProbeFailsRunsWithWarnings(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		probe app.RuntimeProbe
		err   error
		want  string
	}{
		"nothing proved":  {err: errors.New("the model did not run the probe"), want: "probing it failed: the model did not run the probe"},
		"nothing held":    {probe: app.RuntimeProbe{Version: "2.0.0", Report: "read-only: write: ok (want refused)"}, want: "probing it failed: no primitive held:\n  read-only: write: ok (want refused)"},
		"another version": {probe: app.RuntimeProbe{Version: "2.0.1", Primitives: []string{"Read"}}, want: "probing it failed: the probe found version 2.0.1, not 2.0.0"},
	} {
		h := newHarness()
		h.runner.identity.Version = "2.0.0"
		records := &probeRecordsSpy{}
		h.probes = probesOver(&proberSpy{probe: c.probe, err: c.err}, records)
		record := h.submit(t, h.clientOn(h.defs), contract.CallRequest{Process: "p_a"})
		if record.Result.Status != run.Completed || !strings.Contains(strings.Join(record.Result.Warnings, "\n"), c.want) {
			t.Errorf("%s: result = %q", name, message(record))
		}
		if len(h.runner.calls()) != 1 || len(records.probes) != 0 {
			t.Errorf("%s: ran %d turns, recorded %v", name, len(h.runner.calls()), records.probes)
		}
	}
}

// A version is probed once: a probe that passed is read back from the
// records, by any process; one that failed is not run again by this one.
func TestAVersionIsProbedOnce(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	records := &probeRecordsSpy{}
	passing := &proberSpy{probe: app.RuntimeProbe{Version: "2.0.0", Primitives: []string{"Read"}}}
	if _, err := probesOver(passing, records).Verified(ctx, "spy", "/bin/spy", "2.0.0"); err != nil {
		t.Fatal(err)
	}
	another := &proberSpy{err: errors.New("unreached")}
	if primitives, err := probesOver(another, records).Verified(ctx, "spy", "/bin/spy", "2.0.0"); err != nil || !reflect.DeepEqual(primitives, []string{"Read"}) || len(another.commands()) != 0 {
		t.Fatalf("recorded probe read back as %v, %v; probed %v", primitives, err, another.commands())
	}

	failing := &proberSpy{err: errors.New("nothing proved")}
	probes := probesOver(failing, &probeRecordsSpy{})
	for range 2 {
		if _, err := probes.Verified(ctx, "spy", "/bin/spy", "2.0.0"); err == nil || err.Error() != "nothing proved" {
			t.Fatalf("err = %v", err)
		}
	}
	if len(failing.commands()) != 1 {
		t.Fatalf("probed %d times", len(failing.commands()))
	}
}

// An adapter with no prober is not probed: the version stays unverified.
func TestAnAdapterWithNoProberIsNotProbed(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.runner.identity.Version = "2.0.0"
	h.probes = app.NewProbes(nil, &probeRecordsSpy{}, fixedClock{})
	record := h.submit(t, h.clientOn(h.defs), contract.CallRequest{Process: "p_a"})
	if record.Result.Status != run.Completed || !strings.Contains(strings.Join(record.Result.Warnings, "\n"), "version 2.0.0 is unverified") {
		t.Fatalf("result = %q", message(record))
	}
}

// Check's probe of the runtimes probes a version the settings do not
// verify, and reports a probe that failed.
func TestCheckProbesAnUnverifiedVersion(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		prober *proberSpy
		want   []string
	}{
		"passed": {&proberSpy{probe: app.RuntimeProbe{Version: "9.0.0", Primitives: []string{"Read", "Grep", "Bash"}}}, nil},
		"failed": {&proberSpy{err: errors.New("nothing proved")}, []string{"agent a: runtime rt version 9.0.0 is unverified, and probing it failed: nothing proved", "workflow p_a: call node p: process p on agent a runtime rt version 9.0.0 has unverified primitives: Read, Grep"}},
	} {
		h := newHarness()
		h.runner.identity.Version = "9.0.0"
		h.probes = probesOver(c.prober, &probeRecordsSpy{})
		report, err := h.clientOn(h.defs).Check(context.Background(), true)
		if err != nil {
			t.Fatal(err)
		}
		if got := report.Warnings; len(report.Problems) != 0 || strings.Join(got, "\n") != strings.Join(c.want, "\n") {
			t.Errorf("%s: problems = %q", name, got)
		}
		// ADR-036: a successful probe supplies evidence for the declared plan.
		if c.prober.err == nil && !reflect.DeepEqual(report.Bindings, []contract.Binding{{Workflow: "p_a", Node: "p", Process: "p", Agent: "a", Runtime: "rt", Version: "9.0.0", Withheld: []string{"repository.diff"}}}) {
			t.Errorf("%s: bindings = %+v", name, report.Bindings)
		}
	}
}
