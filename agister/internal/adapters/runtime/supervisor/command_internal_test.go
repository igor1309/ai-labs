package supervisor

import (
	"context"
	"crypto/sha256"
	"testing"
	"time"
)

// A wait for output that passes beside an output the watcher has not been
// told of yet does not make the command stale, whichever of the two the
// watcher takes first: the wait starts again from that output.
func TestAWaitThatPassesBesideAnOutputIsNotStale(t *testing.T) {
	// Which of two ready channels a select takes is random: both orders
	// are taken over the rounds.
	for round := 0; round < 200; round++ {
		output := &boundedOutput{bound: 8, digest: sha256.New(), wrote: make(chan struct{}, 1)}
		exited := make(chan struct{})
		started, stopped := 0, 0
		commands := Commands{Timer: func(time.Duration) (<-chan time.Time, func()) {
			started++
			stop := func() { stopped++ }
			if started > 1 {
				// The wait started again, which nothing ends but the exit.
				if started == 2 {
					close(exited)
				}
				return nil, stop
			}
			// The watcher is here, between starting the wait and waiting:
			// by the time it waits, the wait has passed and the command
			// has written.
			if _, err := output.Write([]byte("late")); err != nil {
				t.Fatal(err)
			}
			fired := make(chan time.Time, 1)
			fired <- time.Time{}
			return fired, stop
		}}
		kills := 0
		timedOut, cancelled, stale := commands.watch(context.Background(), exited, nil, 2*time.Minute, output, func() { kills++ })
		if stale || timedOut || cancelled || kills != 0 {
			t.Fatalf("round %d: stale %t, timed out %t, cancelled %t, %d kills", round, stale, timedOut, cancelled, kills)
		}
		if started < 2 || started != stopped {
			t.Fatalf("round %d: waits for output: %d started, %d stopped", round, started, stopped)
		}
	}
}

// A wait that passes without an output since it started is silence.
func TestAWaitThatPassesWithoutAnOutputIsStale(t *testing.T) {
	output := &boundedOutput{bound: 8, digest: sha256.New(), wrote: make(chan struct{}, 1)}
	if _, err := output.Write([]byte("early")); err != nil {
		t.Fatal(err)
	}
	<-output.wrote // the watcher was told of it before this wait
	started, stopped := 0, 0
	commands := Commands{Timer: func(time.Duration) (<-chan time.Time, func()) {
		started++
		fired := make(chan time.Time, 1)
		fired <- time.Time{}
		return fired, func() { stopped++ }
	}}
	kills := 0
	timedOut, cancelled, stale := commands.watch(context.Background(), make(chan struct{}), nil, 2*time.Minute, output, func() { kills++ })
	if !stale || timedOut || cancelled || kills != 1 || started != 1 || stopped != 1 {
		t.Fatalf("stale %t, timed out %t, cancelled %t, %d kills, waits %d started, %d stopped", stale, timedOut, cancelled, kills, started, stopped)
	}
}
