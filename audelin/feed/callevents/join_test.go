package callevents_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

func TestS5_JoiningMidCallGivesWhatWasSaidBefore(t *testing.T) {
	early := part("them", 30*time.Second, "code word")
	mid := part("me", 4*time.Minute, "later on")
	tail := part("them", 7*time.Minute+30*time.Second, "just now")
	next1 := part("me", 8*time.Minute+10*time.Second, "next")
	c := &clock{now: zero.Add(7*time.Minute + 40*time.Second)}
	e, err := callevents.New(&live{clock: c, at: heard(early, mid, tail, next1)}, c, 3*time.Minute, time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	first := next(t, e)

	// Windows of 3 minutes step by 2: ends 3, 5, 7, 9. The last passed is 7.
	want := callevents.Event{Kind: callevents.Chunk, Window: callevents.Window{
		From: 0, To: 7 * time.Minute, New: []callevents.Part{early, mid},
	}}
	if !reflect.DeepEqual(first, want) {
		t.Fatalf("got %+v, want %+v", first, want)
	}
	if c.now != zero.Add(7*time.Minute+40*time.Second) {
		t.Fatalf("waited %v to join", c.now.Sub(zero))
	}
	if w := next(t, e).Window; w.From != 6*time.Minute || w.To != 9*time.Minute {
		t.Fatalf("next window [%v, %v), want [6m, 9m)", w.From, w.To)
	}
}

func TestACallNotYetAWindowLongIsNotJoinedEarly(t *testing.T) {
	said := part("me", 10*time.Second, "hi")
	c := &clock{now: zero.Add(40 * time.Second)}
	e, err := callevents.New(&live{clock: c, at: heard(said)}, c, time.Minute, 0)
	if err != nil {
		t.Fatal(err)
	}

	if w := next(t, e).Window; w.From != 0 || w.To != time.Minute {
		t.Fatalf("first window [%v, %v), want [0, 1m)", w.From, w.To)
	}
	if c.now != zero.Add(time.Minute) {
		t.Fatalf("given at %v, want 1m", c.now.Sub(zero))
	}
}
