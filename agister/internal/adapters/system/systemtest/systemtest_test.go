package systemtest_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/system/systemtest"
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
	clock := systemtest.NewClock(start)
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
	clock := systemtest.NewClock(start)
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
	clock := systemtest.NewClock(start)
	ch, _ := clock.Timer(0)
	if at, ok := fired(ch); !ok || !at.Equal(start) {
		t.Fatalf("fired %t at %v", ok, at)
	}
}

// Started returns once the code has started a timer of the wait asked
// for, once per timer, whatever else was started; Waits lists them all.
func TestStartedReturnsOncePerTimerOfTheWait(t *testing.T) {
	t.Parallel()
	clock := systemtest.NewClock(start)
	returned := make(chan struct{})
	go func() {
		clock.Started(time.Minute)
		clock.Started(time.Minute)
		close(returned)
	}()
	clock.Timer(time.Minute)
	clock.Timer(time.Second)
	clock.Timer(time.Minute)
	<-returned
	if waits := clock.Waits(); !reflect.DeepEqual(waits, []time.Duration{time.Minute, time.Second, time.Minute}) {
		t.Fatalf("waits %v", waits)
	}
}
