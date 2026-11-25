package callevents_test

import (
	"context"
	"errors"
	"io"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

// endsAt makes a call heard as parts that ends at the given call time.
func endsAt(end time.Duration, parts ...callevents.Part) func(time.Duration) (callevents.Call, bool, error) {
	h := heard(parts...)
	return func(now time.Duration) (callevents.Call, bool, error) {
		call, ok, err := h(now)
		call.Ended = now >= end
		return call, ok, err
	}
}

func rest(t *testing.T, e *callevents.Events) []callevents.Event {
	t.Helper()
	var got []callevents.Event
	for {
		ev, err := e.Next(context.Background())
		if errors.Is(err, io.EOF) {
			return got
		}
		if err != nil {
			t.Fatal(err)
		}
		got = append(got, ev)
		if len(got) > 20 {
			t.Fatal("no end")
		}
	}
}

func chunk(from, to time.Duration, ctx, fresh []callevents.Part) callevents.Event {
	return callevents.Event{Kind: callevents.Chunk, Window: callevents.Window{From: from, To: to, Context: ctx, New: fresh}}
}

func TestS9_TheWindowsLeftComeBeforeTheEnd(t *testing.T) {
	a := part("me", 70*time.Second, "a")
	b := part("me", 150*time.Second, "b")
	e, c := newEvents(t, endsAt(3*time.Minute, a, b), time.Minute, 0)
	next(t, e)
	c.now = zero.Add(3*time.Minute + 10*time.Second)

	got := rest(t, e)

	want := []callevents.Event{
		chunk(time.Minute, 2*time.Minute, nil, []callevents.Part{a}),
		chunk(2*time.Minute, 3*time.Minute, nil, []callevents.Part{b}),
		{Kind: callevents.CallEnded},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestS12_ACallEndingBetweenWindowsGivesItsLastWords(t *testing.T) {
	a := part("me", 30*time.Second, "a")
	last := part("them", 70*time.Second, "bye")
	e, c := newEvents(t, endsAt(80*time.Second, a, last), time.Minute, 0)
	next(t, e)

	got := rest(t, e)

	want := []callevents.Event{
		chunk(time.Minute, 80*time.Second, nil, []callevents.Part{last}),
		{Kind: callevents.CallEnded},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if c.now != zero.Add(80*time.Second) {
		t.Fatalf("end given at %v, want when it was read", c.now.Sub(zero))
	}
}

func TestS12_TheFinalWindowDrainsPartsAtAndAfterTheObservedEnd(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name  string
		end   time.Duration
		extra time.Duration
	}{
		{name: "part at the observed end", end: 80 * time.Second},
		{name: "parts on and beyond a regular window end", end: 2 * time.Minute, extra: 2 * time.Second},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			earlier := part("Me", 30*time.Second, "already sent")
			final := []callevents.Part{part("Them", tc.end, "last words")}
			if tc.extra != 0 {
				final = append(final, part("Me", tc.end+tc.extra, "late in the saved transcript"))
			}
			ended := callevents.Call{ID: "call", Start: zero, Ended: true, Parts: append([]callevents.Part{earlier}, final...)}
			active := heard(earlier)
			at := func(now time.Duration) (callevents.Call, bool, error) {
				if now < tc.end {
					return active(now)
				}
				return ended, true, nil
			}
			e, c := newEvents(t, at, time.Minute, 0)
			if got, want := next(t, e), chunk(0, time.Minute, nil, []callevents.Part{earlier}); !reflect.DeepEqual(got, want) {
				t.Fatalf("first event %+v, want %+v", got, want)
			}
			from := time.Minute
			var want []callevents.Event
			if tc.end == 2*time.Minute {
				want = append(want, chunk(from, tc.end, nil, nil))
				from = tc.end
			}
			want = append(want,
				chunk(from, tc.end+tc.extra+time.Nanosecond, nil, final),
				callevents.Event{Kind: callevents.CallEnded},
			)
			if got := rest(t, e); !reflect.DeepEqual(got, want) {
				t.Fatalf("got %+v, want %+v", got, want)
			}
			if c.now != zero.Add(tc.end) {
				t.Fatalf("clock advanced to %v while draining the ended snapshot", c.now)
			}
		})
	}
}

func TestS11_AFailedReadGivesAnEmptyWindow(t *testing.T) {
	a := part("me", 70*time.Second, "a")
	b := part("me", 130*time.Second, "b")
	h := heard(a, b)
	failsAtTwo := func(now time.Duration) (callevents.Call, bool, error) {
		if now == 2*time.Minute {
			return callevents.Call{}, false, errors.New("cannot read")
		}
		return h(now)
	}
	e, _ := newEvents(t, failsAtTwo, time.Minute, 0)
	next(t, e)

	failed := next(t, e)
	again := next(t, e)

	if !reflect.DeepEqual(failed, chunk(time.Minute, 2*time.Minute, nil, nil)) {
		t.Fatalf("failed read gave %+v", failed)
	}
	if !reflect.DeepEqual(again, chunk(2*time.Minute, 3*time.Minute, nil, []callevents.Part{a, b})) {
		t.Fatalf("next window %+v, want both parts", again)
	}
}
