package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestCheckReportsEveryProblemAcrossDocuments(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindAgent]["broken"] = "schema = \"agister.agent/v1alpha1\"\nname = \"broken\"\ncolour = \"red\"\n"
	h.defs.docs[definition.KindProcess]["q"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: q", 1) + "timeout: 2h\n"
	h.validator.compileErr = errors.New("not a schema")
	checker := &app.Checker{Definitions: h.defs, Validator: h.validator, Runtimes: h.runtimes, Sources: []string{"git.revision", "git.diff"}}

	report, err := checker.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(report.Problems, "\n")
	for _, want := range []string{
		"agent broken: colour: unknown field",
		"agent broken: runtime: is required",
		"schema s: not a schema",
		`process p: output schema "s" does not exist`,
		"process q: timeout: 2h0m0s widens the policy's 20m0s",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in:\n%s", want, joined)
		}
	}
	if report.Checked["processes"] != 2 || report.Checked["agents"] != 2 {
		t.Fatalf("checked = %v", report.Checked)
	}
	if len(h.runner.calls()) != 0 || len(h.runtimes.asked) != 0 {
		t.Fatal("check without probe must not touch runtimes")
	}
}

func TestCheckProbesEachAgentsRuntime(t *testing.T) {
	h := newHarness()
	checker := &app.Checker{Definitions: h.defs, Validator: h.validator, Runtimes: h.runtimes, Sources: []string{"git.revision", "git.diff"}}
	if report, _ := checker.Check(context.Background(), true); len(report.Problems) != 0 {
		t.Fatalf("problems = %v", report.Problems)
	}
	if !reflect.DeepEqual(h.runtimes.asked, []string{"spy|/bin/spy"}) {
		t.Fatalf("asked = %v", h.runtimes.asked)
	}
	h.runner.identity.Version = "9.0.0"
	report, _ := checker.Check(context.Background(), true)
	if !reflect.DeepEqual(report.Problems, []string{"agent a: runtime version 9.0.0 is not verified by mapping rt (verified: 1.)"}) {
		t.Fatalf("problems = %v", report.Problems)
	}
}

type readerSpy struct {
	calls   []int // afterSeq per call
	batches [][]run.Event
	status  []run.Status
	record  run.Record
}

func (s *readerSpy) Events(_ context.Context, _ string, afterSeq int) ([]run.Event, run.Status, error) {
	i := len(s.calls)
	s.calls = append(s.calls, afterSeq)
	return s.batches[i], s.status[i], nil
}

func (s *readerSpy) Get(context.Context, string) (run.Record, run.Status, error) {
	return s.record, run.StatusFinished, nil
}

func (s *readerSpy) List(context.Context) ([]run.Record, error) { return []run.Record{s.record}, nil }

func TestObserveResumesAfterTheLastDeliveredEvent(t *testing.T) {
	reader := &readerSpy{
		batches: [][]run.Event{{{Seq: 4}, {Seq: 5}}, {}, {{Seq: 6}}},
		status:  []run.Status{run.StatusRunning, run.StatusRunning, run.StatusFinished},
	}
	runs := &app.Runs{Reader: reader, PollInterval: 1}
	var delivered []int
	err := runs.Observe(context.Background(), "r", 3, func(event contract.Event) error {
		delivered = append(delivered, event.Seq)
		return nil
	})
	if err != nil || !reflect.DeepEqual(delivered, []int{4, 5, 6}) || !reflect.DeepEqual(reader.calls, []int{3, 5, 5}) {
		t.Fatalf("delivered %v, asked after %v, err %v", delivered, reader.calls, err)
	}
}

func TestInspectAsksTheRecordedAdapterForTheResumeHint(t *testing.T) {
	h := newHarness()
	reader := &readerSpy{record: run.Record{ID: "r", Outcome: run.CallAccepted,
		Runtime: &run.Runtime{Adapter: "spy"}, Turn: &run.Turn{Outcome: run.TurnCompleted, ProviderSessionID: "prov-1"}}}
	view, err := (&app.Runs{Reader: reader, Runtimes: h.runtimes}).Inspect(context.Background(), "r")
	if err != nil || view.ResumeHint != "spy resume prov-1" || view.Status != "finished" || view.Outcome != "accepted" {
		t.Fatalf("view = %+v, %v", view, err)
	}
}

type writerSpy struct {
	writes  []string
	existed map[string]bool
}

func (s *writerSpy) Write(_ context.Context, kind definition.Kind, name string, data []byte, overwrite bool) (string, bool, error) {
	s.writes = append(s.writes, string(kind)+"/"+name)
	key := string(kind) + "/" + name
	if s.existed[key] && !overwrite {
		return key, false, nil
	}
	return key, true, nil
}

func TestInitWritesEachExampleWithoutOverwriting(t *testing.T) {
	writer := &writerSpy{existed: map[string]bool{"agents/a": true}}
	examples := fstest.MapFS{
		"service.toml":   {Data: []byte("x")},
		"agents/a.toml":  {Data: []byte("x")},
		"schemas/s.json": {Data: []byte("x")},
	}
	result, err := (&app.Settings{Writer: writer, Examples: examples}).Init(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(writer.writes, []string{"agents/a", "schemas/s", "service/service"}) ||
		!reflect.DeepEqual(result.Kept, []string{"agents/a"}) || len(result.Created) != 2 {
		t.Fatalf("writes %v, result %+v", writer.writes, result)
	}
}

func TestCreateAgentValidatesAgainstTheRuntimeMapping(t *testing.T) {
	h := newHarness()
	writer := &writerSpy{}
	settings := &app.Settings{Definitions: h.defs, Writer: writer}
	var input *contract.InputError
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "nope"}, false); !errors.As(err, &input) {
		t.Fatalf("unknown runtime: %v", err)
	}
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt", Effort: "max"}, false); !errors.As(err, &input) {
		t.Fatalf("unsupported effort: %v", err)
	}
	if len(writer.writes) != 0 {
		t.Fatal("invalid agents were written")
	}
	if _, err := settings.CreateAgent(context.Background(), contract.Agent{Name: "b", Runtime: "rt", Effort: "high"}, false); err != nil || !reflect.DeepEqual(writer.writes, []string{"agents/b"}) {
		t.Fatalf("writes %v, %v", writer.writes, err)
	}
}
