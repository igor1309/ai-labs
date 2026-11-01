package runstore

import (
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
)

func TestPulseTicksWhileLogIOIsBlockedAndJoinsBeforeRemoval(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC))
	blocked, release, ended := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var once sync.Once
	w, err := NewTimedLogWriter(func([]byte, bool) error { close(blocked); <-release; return nil }, clock.Now)
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		defer close(ended)
		if err := w.Append(Event{Kind: RunStarted, Record: &Record{Schema: Schema, ID: "run"}}); err != nil {
			t.Error(err)
		}
	}()
	t.Cleanup(func() { once.Do(func() { close(release) }); <-ended })
	<-blocked
	beats := make(chan Heartbeat, 4)
	removed := 0
	p, err := NewPulse(41, "instance", clock.Now, clock.Timer, time.Second, w.PendingSince, func(h Heartbeat) error { beats <- h; return nil }, func() error { removed++; return nil })
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { p.Stop() })
	first := <-beats
	if first.PID != 41 || first.ProcessStart != "instance" || first.PendingSince == nil || !first.PendingSince.Equal(clock.Now()) || first.PendingAgeMS != 0 {
		t.Fatalf("initial beat %+v", first)
	}
	clock.Started(time.Second)
	clock.Advance(12 * time.Second)
	second := <-beats
	if second.PendingAgeMS != 12000 || !second.Beat.Equal(clock.Now()) {
		t.Fatalf("blocked writer beat %+v", second)
	}
	state, err := Observe(Snapshot{Record: Record{Status: "running"}, Heartbeat: &second}, clock.Now(), 10*time.Second, func(pid int) (string, bool, error) { return "instance", true, nil })
	if err != nil || state.Status != "writer stalled" || state.Since == nil || !state.Since.Equal(first.Beat) {
		t.Fatalf("state %+v, %v", state, err)
	}
	once.Do(func() { close(release) })
	<-ended
	if w.PendingSince() != nil {
		t.Fatal("finished write still pending")
	}
	clock.Started(time.Second)
	if err := p.Stop(); err != nil {
		t.Fatal(err)
	}
	if err := p.Stop(); err != nil {
		t.Fatal(err)
	}
	if removed != 1 || clock.Pending() != 0 {
		t.Fatalf("removes %d, timers %d", removed, clock.Pending())
	}
	clock.Advance(time.Hour)
	if len(beats) != 0 {
		t.Fatal("heartbeat outlived Stop")
	}
}

func TestPulseReportsWriteAndRemovalFailures(t *testing.T) {
	t.Parallel()
	failure := errors.New("heartbeat failed")
	for _, phase := range []string{"initial", "tick", "remove"} {
		t.Run(phase, func(t *testing.T) {
			t.Parallel()
			c := clocktest.NewClock(time.Date(2026, 10, 29, 0, 0, 0, 0, time.UTC))
			writes := make(chan int, 2)
			n := 0
			p, err := NewPulse(1, "start", c.Now, c.Timer, time.Second, func() *time.Time { return nil }, func(Heartbeat) error {
				n++
				writes <- n
				if phase == "initial" || phase == "tick" && n == 2 {
					return failure
				}
				return nil
			}, func() error {
				if phase == "remove" {
					return failure
				}
				return nil
			})
			if phase == "initial" {
				if !errors.Is(err, failure) || p != nil {
					t.Fatalf("pulse %v, %v", p, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { p.Stop() })
			<-writes
			if phase == "tick" {
				c.Started(time.Second)
				c.Advance(time.Second)
				<-writes
			}
			if err := p.Stop(); !errors.Is(err, failure) {
				t.Fatalf("stop error %v", err)
			}
		})
	}
}

func TestHeartbeatAndStatusRequireTheirCollaborators(t *testing.T) {
	t.Parallel()
	now := func() time.Time { return time.Time{} }
	timer := func(time.Duration) (<-chan time.Time, func()) { t.Fatal("unexpected timer"); return nil, nil }
	pending := func() *time.Time { return nil }
	write := func(Heartbeat) error { return nil }
	remove := func() error { return nil }
	cases := []struct {
		pid      int
		start    string
		now      func() time.Time
		timer    func(time.Duration) (<-chan time.Time, func())
		interval time.Duration
		pending  func() *time.Time
		write    func(Heartbeat) error
		remove   func() error
	}{
		{0, "start", now, timer, time.Second, pending, write, remove},
		{1, "", now, timer, time.Second, pending, write, remove},
		{1, "start", nil, timer, time.Second, pending, write, remove},
		{1, "start", now, nil, time.Second, pending, write, remove},
		{1, "start", now, timer, 0, pending, write, remove},
		{1, "start", now, timer, time.Second, nil, write, remove},
		{1, "start", now, timer, time.Second, pending, nil, remove},
		{1, "start", now, timer, time.Second, pending, write, nil},
	}
	for _, c := range cases {
		if p, err := NewPulse(c.pid, c.start, c.now, c.timer, c.interval, c.pending, c.write, c.remove); err == nil || p != nil {
			t.Fatalf("accepted missing collaborator %+v", c)
		}
	}
	if _, err := NewTimedLogWriter(func([]byte, bool) error { return nil }, nil); err == nil {
		t.Fatal("missing clock accepted")
	}
	if _, err := NewTimedLogWriter(nil, now); err == nil {
		t.Fatal("missing appender accepted")
	}
}

func TestObserveDistinguishesEveryLivenessState(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	old := now.Add(-20 * time.Second)
	failure := errors.New("probe denied")
	for _, c := range []struct {
		name     string
		beat     *Heartbeat
		start    string
		alive    bool
		probeErr error
		want     string
		since    *time.Time
	}{
		{name: "startup gap", want: "unknown"},
		{name: "malformed", beat: &Heartbeat{}, want: "unknown"},
		{name: "running", beat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: now}, start: "one", alive: true, want: "running"},
		{name: "dead", beat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: old}, want: "lost"},
		{name: "pid reused", beat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: now}, start: "two", alive: true, want: "lost"},
		{name: "stale ticker", beat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: old}, start: "one", alive: true, want: "unknown"},
		{name: "future beat", beat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: now.Add(time.Second)}, start: "one", alive: true, want: "unknown"},
		{name: "stalled", beat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: now, PendingSince: &old, PendingAgeMS: 20000}, start: "one", alive: true, want: "writer stalled", since: &old},
		{name: "probe error", beat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: now}, probeErr: failure},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			probes := 0
			got, err := Observe(Snapshot{Record: Record{Status: "running"}, Heartbeat: c.beat}, now, 10*time.Second, func(pid int) (string, bool, error) {
				probes++
				if pid != 21 {
					t.Errorf("pid %d", pid)
				}
				return c.start, c.alive, c.probeErr
			})
			if !errors.Is(err, c.probeErr) || got.Status != c.want || !reflect.DeepEqual(got.Since, c.since) {
				t.Fatalf("state %+v, %v", got, err)
			}
			if c.beat == nil || !validHeartbeat(*c.beat) {
				if probes != 0 {
					t.Fatal("probed malformed heartbeat")
				}
			}
		})
	}
	for _, status := range []string{"completed", "failed", "interrupted", "lost"} {
		got, err := Observe(Snapshot{Record: Record{Status: status, Ended: &now}, Heartbeat: &Heartbeat{PID: 21, ProcessStart: "one", Beat: now}}, now, 10*time.Second, func(int) (string, bool, error) { t.Fatal("terminal probed process"); return "", false, nil })
		if err != nil || got.Status != status {
			t.Fatalf("terminal %+v, %v", got, err)
		}
	}
}

func TestPendingAgeRetainsQueuedWritesUntilTheirOwnIOEnds(t *testing.T) {
	t.Parallel()
	c := clocktest.NewClock(time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC))
	pending := make(chan struct{}, 2)
	inIO := make(chan struct{}, 2)
	firstRelease, secondRelease := make(chan struct{}), make(chan struct{})
	firstDone, secondDone := make(chan struct{}), make(chan struct{})
	var firstOnce, secondOnce sync.Once
	writes := 0
	w, err := NewTimedLogWriter(func([]byte, bool) error {
		writes++
		inIO <- struct{}{}
		if writes == 1 {
			<-firstRelease
		} else {
			<-secondRelease
		}
		return nil
	}, func() time.Time { pending <- struct{}{}; return c.Now() })
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		defer close(firstDone)
		if err := w.Append(Event{Kind: RunStarted, Record: &Record{Schema: Schema, ID: "x"}}); err != nil {
			t.Error(err)
		}
	}()
	t.Cleanup(func() {
		firstOnce.Do(func() { close(firstRelease) })
		secondOnce.Do(func() { close(secondRelease) })
		<-firstDone
		<-secondDone
	})
	<-pending
	<-inIO
	oldest := c.Now()
	c.Advance(time.Second)
	next := c.Now()
	go func() {
		defer close(secondDone)
		if err := w.Append(Event{Kind: Started, Step: "a", At: next}); err != nil {
			t.Error(err)
		}
	}()
	<-pending
	if got := w.PendingSince(); got == nil || !got.Equal(oldest) {
		t.Fatalf("queued oldest %v", got)
	}
	firstOnce.Do(func() { close(firstRelease) })
	<-firstDone
	<-inIO
	if got := w.PendingSince(); got == nil || !got.Equal(next) {
		t.Fatalf("remaining write %v", got)
	}
	secondOnce.Do(func() { close(secondRelease) })
	<-secondDone
	if w.PendingSince() != nil {
		t.Fatal("completed writes still pending")
	}
}

func TestLiveStoreRequiresExplicitLivenessDependencies(t *testing.T) {
	t.Parallel()
	for _, missing := range []string{"pid", "probe", "clock", "timer", "interval", "folder"} {
		t.Run(missing, func(t *testing.T) {
			t.Parallel()
			live := Liveness{PID: 3, Probe: func(int) (string, bool, error) { t.Fatal("unexpected probe"); return "", false, nil }, Now: func() time.Time { return time.Time{} }, Timer: func(time.Duration) (<-chan time.Time, func()) { t.Fatal("unexpected timer"); return nil, nil }, Interval: time.Second}
			folder := "runs"
			switch missing {
			case "pid":
				live.PID = 0
			case "probe":
				live.Probe = nil
			case "clock":
				live.Now = nil
			case "timer":
				live.Timer = nil
			case "interval":
				live.Interval = 0
			case "folder":
				folder = ""
			}
			if _, err := NewLive(folder, live); err == nil {
				t.Fatalf("accepted missing %s", missing)
			}
		})
	}
}
