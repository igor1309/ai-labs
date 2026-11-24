package callevents_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

func TestS1_NoCallIsSaidWhileNoneIsLive(t *testing.T) {
	none := func(time.Duration) (callevents.Call, bool, error) { return callevents.Call{}, false, nil }
	e, c := newEvents(t, none, time.Minute, 0)

	ev := next(t, e)

	if ev.Kind != callevents.NoCall {
		t.Fatalf("got %+v, want no call", ev)
	}
	if c.now != zero {
		t.Fatalf("waited %v before saying no call", c.now.Sub(zero))
	}
}

func TestS6_ACallStartingAfterNoCallIsJoined(t *testing.T) {
	callStart := 5*time.Minute + 30*time.Second
	said := part("me", 20*time.Second, "joined")
	startsLater := func(now time.Duration) (callevents.Call, bool, error) {
		if now < callStart {
			return callevents.Call{}, false, nil
		}
		call := callevents.Call{ID: "later", Start: zero.Add(callStart)}
		if now-callStart > said.Start {
			call.Parts = []callevents.Part{said}
		}
		return call, true, nil
	}
	e, c := newEvents(t, startsLater, time.Minute, 0)

	if ev := next(t, e); ev.Kind != callevents.NoCall {
		t.Fatalf("first event %+v, want no call", ev)
	}
	ev := next(t, e)

	want := callevents.Event{Kind: callevents.Chunk, Window: callevents.Window{
		From: 0, To: time.Minute, New: []callevents.Part{said},
	}}
	if !reflect.DeepEqual(ev, want) {
		t.Fatalf("got %+v, want %+v", ev, want)
	}
	if c.now != zero.Add(callStart+time.Minute) {
		t.Fatalf("given at %v, want the call's first window end", c.now.Sub(zero))
	}
}
