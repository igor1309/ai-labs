package clocktest_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
)

var start = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)

// fired says whether a timer's channel has delivered, and what.
func fired(ch <-chan time.Time) (time.Time, bool) {
	select {
	case at := <-ch:
		return at, true
	default:
		return time.Time{}, false
	}
}

// A timer fires once the clock is advanced to the end of its wait, and not
// a moment before; it delivers the time its wait ended.
func TestATimerFiresOnlyOnceTheClockPassesItsWait(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	ch, stop := clock.Timer(time.Minute)
	defer stop()
	clock.Advance(time.Minute - time.Nanosecond)
	if _, ok := fired(ch); ok || clock.Pending() != 1 {
		t.Fatalf("fired a nanosecond early; %d pending", clock.Pending())
	}
	clock.Advance(time.Nanosecond)
	if at, ok := fired(ch); !ok || !at.Equal(start.Add(time.Minute)) || clock.Pending() != 0 {
		t.Fatalf("at the end of its wait: fired %t at %v; %d pending", ok, at, clock.Pending())
	}
	if now := clock.Now(); !now.Equal(start.Add(time.Minute)) {
		t.Fatalf("now %v", now)
	}
}

// One advance fires every timer whose wait it passes, each at its own end,
// and leaves the later ones; a stopped timer never fires.
func TestAdvanceFiresEveryTimerItPassesAndNoStoppedOne(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	late, stopLate := clock.Timer(time.Hour)
	defer stopLate()
	second, _ := clock.Timer(2 * time.Second)
	first, _ := clock.Timer(time.Second)
	stopped, stop := clock.Timer(time.Second)
	stop()
	clock.Advance(time.Minute)
	if at, ok := fired(first); !ok || !at.Equal(start.Add(time.Second)) {
		t.Fatalf("first: %t at %v", ok, at)
	}
	if at, ok := fired(second); !ok || !at.Equal(start.Add(2*time.Second)) {
		t.Fatalf("second: %t at %v", ok, at)
	}
	if _, ok := fired(stopped); ok {
		t.Fatal("a stopped timer fired")
	}
	if _, ok := fired(late); ok || clock.Pending() != 1 {
		t.Fatalf("a later timer fired; %d pending", clock.Pending())
	}
}

// A wait of zero has passed when it starts.
func TestAZeroWaitHasPassedAlready(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	ch, _ := clock.Timer(0)
	if at, ok := fired(ch); !ok || !at.Equal(start) {
		t.Fatalf("fired %t at %v", ok, at)
	}
}

// Started returns once the code has started a timer of the wait asked
// for, once per timer, whatever else was started; Waits lists them all.
// Until then it waits: before any timer of the wait, through a timer of
// another wait, and again once the one timer of the wait is returned for.
func TestStartedReturnsOncePerTimerOfTheWait(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	// Each wait of Started is told here; the test's end lets go of one
	// still telling.
	waiting, ended := make(chan time.Duration), make(chan struct{})
	t.Cleanup(func() { close(ended) })
	clock.OnWaiting(func(wait time.Duration) {
		select {
		case waiting <- wait:
		case <-ended:
		}
	})
	// The second call is made once the test has seen the first return, so
	// a wait told before that is the first call's.
	first, again, second := make(chan struct{}), make(chan struct{}), make(chan struct{})
	go func() {
		clock.Started(time.Minute)
		close(first)
		<-again
		clock.Started(time.Minute)
		close(second)
	}()
	// blocks is that Started waits for a timer of a minute, and has not
	// returned, which closes returned.
	blocks := func(returned <-chan struct{}, when string) {
		t.Helper()
		select {
		case wait := <-waiting:
			if wait != time.Minute {
				t.Fatalf("%s: waits for a timer of %s", when, wait)
			}
		case <-returned:
			t.Fatalf("%s: Started returned", when)
		}
	}
	// returns is that Started returns, which closes returned, and waits
	// no more.
	returns := func(returned <-chan struct{}, when string) {
		t.Helper()
		select {
		case <-returned:
		case <-waiting:
			t.Fatalf("%s: Started waits on", when)
		}
	}

	blocks(first, "before any timer")
	clock.Timer(time.Second)
	blocks(first, "after a timer of another wait")
	clock.Timer(time.Minute)
	returns(first, "after the first timer of the wait")
	close(again)
	blocks(second, "after the first timer of the wait was returned for")
	clock.Timer(time.Second)
	blocks(second, "after another timer of another wait")
	clock.Timer(time.Minute)
	returns(second, "after the second timer of the wait")
	if waits := clock.Waits(); !reflect.DeepEqual(waits, []time.Duration{time.Second, time.Minute, time.Second, time.Minute}) {
		t.Fatalf("waits %v", waits)
	}
}
