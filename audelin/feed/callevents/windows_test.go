package callevents_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

func newEvents(t *testing.T, at func(time.Duration) (callevents.Call, bool, error), size, overlap time.Duration) (*callevents.Events, *clock) {
	t.Helper()
	c := &clock{now: zero}
	e, err := callevents.New(&live{now: c.Now, at: at}, c, size, overlap)
	if err != nil {
		t.Fatal(err)
	}
	return e, c
}

func next(t *testing.T, e *callevents.Events) callevents.Event {
	t.Helper()
	ev, err := e.Next(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return ev
}

func TestS2_AWindowComesWhenItsTimeHasPassed(t *testing.T) {
	first := part("me", 10*time.Second, "hello")
	later := part("them", 3*time.Minute+time.Second, "after")
	e, c := newEvents(t, heard(first, later), 3*time.Minute, 0)

	ev := next(t, e)

	want := callevents.Event{Kind: callevents.Chunk, Window: callevents.Window{
		From: 0, To: 3 * time.Minute, New: []callevents.Part{first},
	}}
	if !reflect.DeepEqual(ev, want) {
		t.Fatalf("got %+v, want %+v", ev, want)
	}
	if c.now != zero.Add(3*time.Minute) {
		t.Fatalf("given at %v, want the window's end", c.now.Sub(zero))
	}
}

func TestS4_AWindowWithNoWordsComesEmpty(t *testing.T) {
	e, _ := newEvents(t, heard(part("me", 10*time.Second, "hello")), time.Minute, 0)
	next(t, e)

	ev := next(t, e)

	want := callevents.Event{Kind: callevents.Chunk, Window: callevents.Window{From: time.Minute, To: 2 * time.Minute}}
	if !reflect.DeepEqual(ev, want) {
		t.Fatalf("got %+v, want %+v", ev, want)
	}
}

func TestAPartStartingOnAWindowsEndIsInTheNext(t *testing.T) {
	edge := part("me", time.Minute, "edge")
	e, _ := newEvents(t, heard(edge), time.Minute, 0)

	if got := next(t, e).Window.New; len(got) != 0 {
		t.Fatalf("first window holds %v", got)
	}
	if got := next(t, e).Window.New; !reflect.DeepEqual(got, []callevents.Part{edge}) {
		t.Fatalf("second window holds %v", got)
	}
}

func TestNewRefusesWindowsThatCannotBeCut(t *testing.T) {
	for _, tc := range []struct{ size, overlap time.Duration }{
		{0, 0}, {-time.Minute, 0}, {time.Minute, -time.Second}, {time.Minute, time.Minute},
	} {
		if _, err := callevents.New(nil, nil, tc.size, tc.overlap); err == nil {
			t.Errorf("size %v overlap %v: no error", tc.size, tc.overlap)
		}
	}
}
