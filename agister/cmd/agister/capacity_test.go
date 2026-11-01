package main

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// capacity.feature, "A retried turn is a progress line and an event": the
// first turn fails at capacity, having reported its session; once the
// wait has passed on the clock, the retry resumes that session and
// completes.
//
// Contract test: the files home holds, as Agister ships them.
func TestARetriedTurnIsAProgressLineAndAnEvent(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.answer = func(_ context.Context, turn claudecode.Turn) (claudecode.Result, error) {
		if turn.Session == "" {
			return claudecode.Result{Session: "s1", Reply: &claudecode.Reply{Session: "s1", Failure: claudecode.Capacity, Reason: "Overloaded"}}, nil
		}
		return claudecode.Result{Session: "s1", Reply: &claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"}}, nil
	}
	waited := make(chan struct{})
	go func() {
		defer close(waited)
		f.clock.Started(30 * time.Second)
		f.clock.Advance(30 * time.Second)
	}()
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	<-waited
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want nothing but progress, 0", got.stderr, got.code)
	}
	want := "· ask: started on claude-opus\n" +
		"· ask: at capacity; retrying in 30s\n" +
		"· ask: ended completed in 30s\n"
	if got.progress != want {
		t.Errorf("progress\n%s\nwant\n%s", got.progress, want)
	}
	if turns := f.runtimes.claude.ran(); len(turns) != 2 || turns[0].Message != askMessage || turns[1].Message != "Go on." || turns[1].Session != "s1" {
		t.Errorf("claude-code ran %+v, want the step's turn, then Go on. resuming s1", turns)
	}
	var capacity []storedEvent
	_, _, events := f.store.given()
	for _, e := range events {
		if e.event.Kind == runstore.Capacity {
			capacity = append(capacity, e)
		}
	}
	wantCapacity := []storedEvent{{id: recordID, event: runstore.Event{At: recordStart, Step: "ask", Kind: runstore.Capacity,
		Reason: "Overloaded", Retrying: true, Waiting: &runstore.Waiting{On: "capacity", Since: recordStart, Until: timeAt(recordStart.Add(30 * time.Second))}}}}
	if !reflect.DeepEqual(capacity, wantCapacity) {
		t.Errorf("runstore was given the capacity events\n%+v\nwant\n%+v", capacity, wantCapacity)
	}
	if p := modelPrintedOf(t, got); p.Status != "completed" || !reflect.DeepEqual(p.Sessions, map[string]string{"ask": "s1"}) {
		t.Errorf("printed %+v, want completed, its session s1", p)
	}
}
