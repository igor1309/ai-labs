package callevents_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

func TestS7_WordsSavedLateComeInTheNextWindow(t *testing.T) {
	late := part("them", 50*time.Second, "saved late")
	revised := part("me", 10*time.Second, "first")
	readLate := func(now time.Duration) (callevents.Call, bool, error) {
		call := callevents.Call{ID: "call", Start: zero, Parts: []callevents.Part{revised}}
		if now > time.Minute {
			call.Parts = []callevents.Part{part("me", 10*time.Second, "first, revised"), late}
		}
		return call, true, nil
	}
	e, _ := newEvents(t, readLate, time.Minute, 0)

	if got := next(t, e).Window.New; !reflect.DeepEqual(got, []callevents.Part{revised}) {
		t.Fatalf("first window %v", got)
	}
	ev := next(t, e)

	if !reflect.DeepEqual(ev.Window.New, []callevents.Part{late}) {
		t.Fatalf("second window %v, want only the late words", ev.Window.New)
	}
}

func TestS8_ALateReaderGetsEveryDueWindowInTurn(t *testing.T) {
	a := part("me", 30*time.Second, "a")
	b := part("me", 90*time.Second, "b")
	d := part("me", 210*time.Second, "d")
	e, c := newEvents(t, heard(a, b, d), time.Minute, 0)
	next(t, e)
	c.now = zero.Add(4*time.Minute + 30*time.Second)

	var got []callevents.Window
	for range 3 {
		got = append(got, next(t, e).Window)
	}

	want := []callevents.Window{
		{From: time.Minute, To: 2 * time.Minute, New: []callevents.Part{b}},
		{From: 2 * time.Minute, To: 3 * time.Minute},
		{From: 3 * time.Minute, To: 4 * time.Minute, New: []callevents.Part{d}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if c.now != zero.Add(4*time.Minute+30*time.Second) {
		t.Fatalf("clock moved to %v giving due windows", c.now.Sub(zero))
	}
}
