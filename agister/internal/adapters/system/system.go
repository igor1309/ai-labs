// Package system provides the real clock and identifier sources.
package system

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type Clock struct{}

func (Clock) Now() time.Time { return time.Now().UTC() }

type IDs struct{}

// RunID is sortable by time and human-scannable.
func (IDs) RunID(now time.Time) string {
	return now.UTC().Format("20060102T150405Z") + "-" + randomHex(3)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
