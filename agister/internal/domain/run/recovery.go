package run

import "time"

// How a recovery turn ended (ADR-023 rule 9). The outcome is the turn's,
// not the call's: a call may still fail verification after a completed
// recovery.
const (
	RecoveryCompleted      = "completed"       // the turn ended validly
	RecoverySameLimit      = "same_limit"      // the same limit again, on the same thing
	RecoveryDifferentLimit = "different_limit" // another limit, or the same one on another thing
	RecoveryFailed         = "failed"          // any other end
)

// Recovery is one recovery turn of a call (ADR-023 rule 9): the turn that
// resumed the call's session after a turn Agister ended at a staleness
// limit, with the evidence of what went stale.
type Recovery struct {
	// Number counts the call's recovery turns from 1.
	Number int `json:"number"`
	// Follows is the stale turn it followed, counted from 1 among the
	// call's turns, and Stale that turn's stale record: the limit, what
	// went stale and when.
	Follows int   `json:"follows"`
	Stale   Stale `json:"stale"`
	// MessageSHA256 is the digest of the message the turn was sent.
	MessageSHA256 string `json:"message_sha256"`
	// Resumed is the session the turn resumed, and Session the one it
	// reported: they must match.
	Resumed string `json:"resumed"`
	Session string `json:"session,omitempty"`
	// Usage, CostUSD and RuntimeMS are the turn's own, as it reported them.
	Usage      *Usage    `json:"usage,omitempty"`
	CostUSD    *float64  `json:"cost_usd,omitempty"`
	RuntimeMS  *int64    `json:"runtime_ms,omitempty"`
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	WallMS     int64     `json:"wall_ms"`
	// Outcome is one of the Recovery constants; Error is why the turn did
	// not complete, when it did not.
	Outcome string `json:"outcome"`
	Error   *Error `json:"error,omitempty"`
}
