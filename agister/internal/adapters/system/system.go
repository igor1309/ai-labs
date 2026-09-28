// Package system provides the real clock and identifier sources.
package system

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

type Clock struct{}

func (Clock) Now() time.Time { return time.Now().UTC() }

type IDs struct{}

// RunID is sortable by time and human-scannable.
func (IDs) RunID(now time.Time) string {
	return now.UTC().Format("20060102T150405Z") + "-" + randomHex(3)
}

// SessionID is a random UUID (version 4).
func (IDs) SessionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
