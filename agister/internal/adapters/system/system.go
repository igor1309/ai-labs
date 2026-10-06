// Package system provides the real clock and identifier sources, and the
// locks of the worktrees in-place calls borrow.
package system

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type Clock struct{}

func (Clock) Now() time.Time { return time.Now().UTC() }

// Timer starts a wall-clock wait: fired delivers once it has passed, and
// stop releases it.
func Timer(wait time.Duration) (fired <-chan time.Time, stop func()) {
	timer := time.NewTimer(wait)
	return timer.C, func() { timer.Stop() }
}

type IDs struct{}

// RunID is sortable by time and human-scannable.
func (IDs) RunID(now time.Time) string {
	return now.UTC().Format("20060102T150405Z") + "-" + randomHex(3)
}

// Stamp names an install's backup: sortable by time, to the microsecond,
// and told apart from another made in the same one by its random suffix.
func (IDs) Stamp(now time.Time) string {
	return now.UTC().Format("20060102T150405.000000Z") + "-" + randomHex(3)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
