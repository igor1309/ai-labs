package runstore_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
)

func logWriter(t *testing.T, appendLine func([]byte, bool) error) *runstore.LogWriter {
	t.Helper()
	w, err := runstore.NewLogWriter(appendLine)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

func startFact() runstore.Event {
	r := lost("x")
	r.Status = "running"
	return runstore.Event{At: started, Kind: runstore.RunStarted, Record: &r}
}

func logLines(t *testing.T, data []byte) []runstore.Line {
	t.Helper()
	var lines []runstore.Line
	d := json.NewDecoder(bytes.NewReader(data))
	for {
		var line runstore.Line
		if err := d.Decode(&line); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		lines = append(lines, line)
	}
	return lines
}

func TestLogSerializesRacingProducersAndRedactsOnlyPersistedTools(t *testing.T) {
	t.Parallel()
	var data bytes.Buffer
	w := logWriter(t, func(b []byte, _ bool) error { _, err := data.Write(b); return err })
	if err := w.Append(startFact()); err != nil {
		t.Fatal(err)
	}
	var workers sync.WaitGroup
	gate := make(chan struct{})
	for i := range 40 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-gate
			if err := w.Append(runstore.Event{At: started, Kind: runstore.Tool, Step: fmt.Sprint(i), Name: "bash", Input: fmt.Sprintf("private tool input %d", i%2)}); err != nil {
				t.Error(err)
			}
		}()
	}
	close(gate)
	workers.Wait()
	lines := logLines(t, data.Bytes())
	if len(lines) != 41 {
		t.Fatalf("%d lines", len(lines))
	}
	seen := map[string]bool{}
	digests := map[string]string{}
	for i, line := range lines {
		if line.Schema != runstore.LogSchema || line.Seq != uint64(i+1) {
			t.Fatalf("line %+v", line)
		}
		if i == 0 {
			continue
		}
		if seen[line.Event.Step] || line.Event.Name != "bash" || !strings.HasPrefix(line.Event.Input, "sha256:") || len(line.Event.Input) != 31 {
			t.Fatalf("event %+v", line.Event)
		}
		seen[line.Event.Step] = true
		var step int
		if _, err := fmt.Sscan(line.Event.Step, &step); err != nil {
			t.Fatal(err)
		}
		input := fmt.Sprint(step % 2)
		if previous, ok := digests[input]; ok && previous != line.Event.Input {
			t.Fatal("equal tool inputs produced different digests")
		}
		digests[input] = line.Event.Input
	}
	if digests["0"] == digests["1"] {
		t.Fatal("different tool inputs produced the same digest")
	}
	if bytes.Contains(data.Bytes(), []byte("private tool input")) {
		t.Fatal("raw tool input persisted")
	}
	if _, err := runstore.Fold(bytes.NewReader(data.Bytes())); err != nil {
		t.Fatal(err)
	}
}

func TestParallelCallsKeepIndependentWaitsAndTerminalResult(t *testing.T) {
	t.Parallel()
	var data bytes.Buffer
	var durable []bool
	w := logWriter(t, func(b []byte, terminal bool) error {
		durable = append(durable, terminal)
		_, err := data.Write(b)
		return err
	})
	until := started.Add(time.Minute)
	wait := &runstore.Waiting{On: "capacity", Since: started, Until: &until}
	cases := []struct {
		fact   runstore.Event
		status string
		active []runstore.ActiveCall
	}{
		{startFact(), "running", []runstore.ActiveCall{}},
		{runstore.Event{Kind: runstore.Started, Step: "a", At: started}, "running", []runstore.ActiveCall{{Step: "a", Since: started}}},
		{runstore.Event{Kind: runstore.Started, Step: "b", At: started}, "running", []runstore.ActiveCall{{Step: "a", Since: started}, {Step: "b", Since: started}}},
		{runstore.Event{Kind: runstore.Capacity, Step: "a", At: started, Waiting: wait}, "running", []runstore.ActiveCall{{Step: "a", Since: started, Waiting: wait}, {Step: "b", Since: started}}},
		{runstore.Event{Kind: runstore.Fallback, Step: "b", At: started, Waiting: &runstore.Waiting{On: "fallback", Since: started}}, "waiting", []runstore.ActiveCall{{Step: "a", Since: started, Waiting: wait}, {Step: "b", Since: started, Waiting: &runstore.Waiting{On: "fallback", Since: started}}}},
		{runstore.Event{Kind: runstore.Resumed, Step: "b", At: until}, "running", []runstore.ActiveCall{{Step: "a", Since: started, Waiting: wait}, {Step: "b", Since: started}}},
		{runstore.Event{Kind: runstore.Ended, Step: "b", At: until}, "waiting", []runstore.ActiveCall{{Step: "a", Since: started, Waiting: wait}}},
		{runstore.Event{Kind: runstore.Stale, Step: "a", At: until, Waiting: &runstore.Waiting{On: "recovery", Since: until}}, "waiting", []runstore.ActiveCall{{Step: "a", Since: started, Waiting: &runstore.Waiting{On: "recovery", Since: until}}}},
		{runstore.Event{Kind: runstore.Resumed, Step: "a", At: until}, "running", []runstore.ActiveCall{{Step: "a", Since: started}}},
	}
	for _, c := range cases {
		if err := w.Append(c.fact); err != nil {
			t.Fatal(err)
		}
		lines := logLines(t, data.Bytes())
		line := lines[len(lines)-1]
		if line.Status != c.status || !reflect.DeepEqual(line.Active, c.active) {
			t.Fatalf("%s: header %+v, want %s %+v", c.fact.Kind, line, c.status, c.active)
		}
		folded, err := runstore.Fold(bytes.NewReader(data.Bytes()))
		if err != nil || folded.Status != c.status {
			t.Fatalf("fold %+v, %v", folded, err)
		}
	}
	terminal := ended("x")
	terminal.Result.Status, terminal.Result.Class = "completed", nil
	if err := w.Append(runstore.Event{At: *terminal.Ended, Kind: runstore.RunEnded, Record: &terminal}); err != nil {
		t.Fatal(err)
	}
	got, err := runstore.Fold(bytes.NewReader(data.Bytes()))
	if err != nil || !reflect.DeepEqual(got, terminal) {
		t.Fatalf("fold %+v, %v; want %+v", got, err, terminal)
	}
	lines := logLines(t, data.Bytes())
	last := lines[len(lines)-1]
	if !durable[len(durable)-1] || last.Status != "completed" || len(last.Active) != 0 || last.Event.Record.Result == nil {
		t.Fatalf("terminal %+v, durability %v", last, durable)
	}
	before := data.Len()
	if err := w.Append(runstore.Event{Kind: runstore.Tool}); err == nil || data.Len() != before {
		t.Fatal("append after terminal")
	}
}

func TestFoldHandlesLargeFactsAndEveryTornTail(t *testing.T) {
	t.Parallel()
	var data bytes.Buffer
	w := logWriter(t, func(b []byte, _ bool) error { _, err := data.Write(b); return err })
	if err := w.Append(startFact()); err != nil {
		t.Fatal(err)
	}
	initial := data.Len()
	r := lost("x")
	r.Inputs = []runstore.Input{{Name: "brief", Value: strings.Repeat("é", 40000), Identity: "digest"}}
	if err := w.Append(runstore.Event{Kind: runstore.InputResolved, At: started, InputFact: &r.Inputs[0]}); err != nil {
		t.Fatal(err)
	}
	all := data.Bytes()
	// Cuts include valid JSON without its final newline and cuts inside UTF-8.
	for _, cut := range []int{initial, initial + 1, initial + 100, len(all) - 3, len(all) - 2, len(all) - 1} {
		got, err := runstore.Fold(bytes.NewReader(all[:cut]))
		if err != nil || len(got.Inputs) != 0 || got.Status != "running" {
			t.Fatalf("cut %d: %+v, %v", cut, got, err)
		}
	}
	got, err := runstore.Fold(bytes.NewReader(all))
	if err != nil || !reflect.DeepEqual(got.Inputs, r.Inputs) {
		t.Fatalf("large committed fact: %+v, %v", got, err)
	}
}

func TestFoldPreservesPendingCostWhenAnotherCallEnds(t *testing.T) {
	t.Parallel()
	var data bytes.Buffer
	w := logWriter(t, func(b []byte, _ bool) error { _, err := data.Write(b); return err })
	cost := 0.75
	pending := callForLog("b")
	finished := callForLog("a")
	finished.Result.Status = "completed"
	for _, e := range []runstore.Event{startFact(), {Kind: runstore.Prepared, CallFact: &pending}, {Kind: runstore.Progress, Step: "b", Session: "session-b", Cost: &cost}, {Kind: runstore.CallEnded, CallFact: &finished}} {
		if err := w.Append(e); err != nil {
			t.Fatal(err)
		}
	}
	got, err := runstore.Fold(bytes.NewReader(data.Bytes()))
	if err != nil || len(got.Calls) != 2 {
		t.Fatalf("record %+v, %v", got, err)
	}
	b := got.Calls[0]
	if b.Step != "b" || b.Result.Cost == nil || *b.Result.Cost != cost || b.Result.Session == nil || *b.Result.Session != "session-b" || got.Calls[1].Result.Status != "completed" {
		t.Fatalf("calls %+v", got.Calls)
	}
}

func callForLog(step string) runstore.Call {
	return runstore.Call{ID: "x/" + step, Step: step, Result: runstore.CallResult{Outcome: runstore.Outcome{Status: "running", Timing: runstore.Timing{Started: started}}}}
}

func TestAnUnfinishedFallbackKeepsTheCallsSpendAndStartingDay(t *testing.T) {
	t.Parallel()
	var data bytes.Buffer
	w := logWriter(t, func(b []byte, _ bool) error { _, err := data.Write(b); return err })
	primary := callForLog("a")
	primary.Agent = "primary"
	fallback := callForLog("a")
	fallback.Agent, fallback.Permissions.Granted = "fallback", []string{"write"}
	fallback.Result.Timing.Started = started.Add(24 * time.Hour)
	first, second := 0.25, 0.5
	for _, e := range []runstore.Event{
		startFact(),
		{Kind: runstore.Prepared, CallFact: &primary},
		{Kind: runstore.Progress, Step: "a", Cost: &first, Session: "primary-session"},
		{Kind: runstore.Prepared, CallFact: &fallback},
		{Kind: runstore.Progress, Step: "a", Cost: &second, Session: "fallback-session"},
	} {
		if err := w.Append(e); err != nil {
			t.Fatal(err)
		}
	}
	got, err := runstore.Fold(bytes.NewReader(data.Bytes()))
	if err != nil || len(got.Calls) != 1 {
		t.Fatalf("record %+v, %v", got, err)
	}
	c := got.Calls[0]
	if c.Agent != "fallback" || !reflect.DeepEqual(c.Permissions.Granted, []string{"write"}) || !c.Result.Timing.Started.Equal(started) || c.Result.Session == nil || *c.Result.Session != "fallback-session" || c.Result.Cost == nil || *c.Result.Cost != 0.75 {
		t.Fatalf("fallback %+v", c)
	}
}
