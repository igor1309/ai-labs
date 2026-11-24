package callevents_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

type manualClock struct {
	now     time.Time
	waiting chan time.Time
	advance chan time.Time
}

func (c *manualClock) Now() time.Time { return c.now }

func (c *manualClock) Wait(ctx context.Context, until time.Time) error {
	select {
	case c.waiting <- until:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case c.now = <-c.advance:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

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

func TestS6_FailedDiscoveryReadKeepsWaitingOnTheSameStream(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name       string
		firstEmpty bool
	}{
		{name: "already waiting", firstEmpty: true},
		{name: "first read failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			c := &manualClock{now: zero, waiting: make(chan time.Time), advance: make(chan time.Time)}
			said := part("Me", 0, "we started")
			fake := &live{now: c.Now, at: func(now time.Duration) (callevents.Call, bool, error) {
				switch {
				case now == 0 && tc.firstEmpty:
					return callevents.Call{}, false, nil
				case now < 2*time.Second:
					return callevents.Call{}, false, errors.New("transcript is still being written")
				default:
					return callevents.Call{ID: "call", Start: zero, Parts: []callevents.Part{said}}, true, nil
				}
			}}
			e, err := callevents.New(fake, c, time.Minute, 0)
			if err != nil {
				t.Fatal(err)
			}
			if tc.firstEmpty {
				if ev := next(t, e); ev.Kind != callevents.NoCall {
					t.Fatalf("first event %+v, want no call", ev)
				}
			}

			ctx, cancel := context.WithCancel(context.Background())
			type result struct {
				event callevents.Event
				err   error
			}
			done := make(chan result, 1)
			exited := make(chan struct{})
			go func() {
				defer close(exited)
				ev, err := e.Next(ctx)
				done <- result{ev, err}
			}()
			t.Cleanup(func() {
				cancel()
				<-exited
			})
			for elapsed := time.Second; elapsed <= 2*time.Second; elapsed += time.Second {
				select {
				case got := <-done:
					t.Fatalf("discovery returned %+v, %v while the transcript was being written", got.event, got.err)
				case until := <-c.waiting:
					if want := zero.Add(elapsed); until != want {
						t.Fatalf("wait until %v, want %v", until, want)
					}
					c.advance <- until
				}
			}
			select {
			case got := <-done:
				want := chunk(0, 2*time.Second, nil, []callevents.Part{said})
				if got.err != nil || !reflect.DeepEqual(got.event, want) {
					t.Fatalf("recovered with %+v, %v; want %+v", got.event, got.err, want)
				}
			case until := <-c.waiting:
				t.Fatalf("waited until %v after the call became readable", until)
			}
		})
	}
}
