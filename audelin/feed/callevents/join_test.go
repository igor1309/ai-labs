package callevents_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

func TestS5_JoiningMidCallGivesWhatWasSaidBefore(t *testing.T) {
	t.Parallel()
	early := part("them", 30*time.Second, "code word")
	beforeFirstEnd := part("me", 110*time.Second, "first answer")
	afterJoin := part("them", 150*time.Second, "next question")
	mid := part("me", 4*time.Minute, "later on")
	tail := part("them", 7*time.Minute+30*time.Second, "just now")
	later := part("me", 8*time.Minute+10*time.Second, "next")

	for _, tc := range []struct {
		name    string
		joinAt  time.Duration
		parts   []callevents.Part
		catchUp []callevents.Part
		next    callevents.Event
	}{
		{
			name:    "before the first end",
			joinAt:  2 * time.Minute,
			parts:   []callevents.Part{early, beforeFirstEnd, afterJoin},
			catchUp: []callevents.Part{early, beforeFirstEnd},
			next:    chunk(0, 3*time.Minute, []callevents.Part{early, beforeFirstEnd}, []callevents.Part{afterJoin}),
		},
		{
			name:    "between later ends",
			joinAt:  7*time.Minute + 40*time.Second,
			parts:   []callevents.Part{early, mid, tail, later},
			catchUp: []callevents.Part{early, mid, tail},
			next:    chunk(6*time.Minute, 9*time.Minute, []callevents.Part{tail}, []callevents.Part{later}),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			e, c := newEvents(t, heard(tc.parts...), 3*time.Minute, time.Minute)
			c.now = zero.Add(tc.joinAt)

			if got, want := next(t, e), chunk(0, tc.joinAt, nil, tc.catchUp); !reflect.DeepEqual(got, want) {
				t.Fatalf("catch-up %+v, want %+v", got, want)
			}
			if got := c.now.Sub(zero); got != tc.joinAt {
				t.Fatalf("catch-up at %v, want %v", got, tc.joinAt)
			}
			if got := next(t, e); !reflect.DeepEqual(got, tc.next) {
				t.Fatalf("next window %+v, want %+v", got, tc.next)
			}
			if got := c.now.Sub(zero); got != tc.next.Window.To {
				t.Fatalf("next window at %v, want %v", got, tc.next.Window.To)
			}
		})
	}
}

func TestAQuietCallBeforeTheFirstEndWaitsForItsFirstWindow(t *testing.T) {
	t.Parallel()
	said := part("me", 50*time.Second, "hi")
	e, c := newEvents(t, heard(said), time.Minute, 0)
	c.now = zero.Add(40 * time.Second)

	if got, want := next(t, e), chunk(0, time.Minute, nil, []callevents.Part{said}); !reflect.DeepEqual(got, want) {
		t.Fatalf("first window %+v, want %+v", got, want)
	}
	if got := c.now.Sub(zero); got != time.Minute {
		t.Fatalf("given at %v, want 1m", got)
	}
}
