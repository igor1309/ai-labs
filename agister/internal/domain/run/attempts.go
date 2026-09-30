package run

import "time"

// Attempt is one verification attempt (ADR-002 rule 9): a turn, the call's
// first or a repair, and the run of the verification command that followed
// it, or why none did.
type Attempt struct {
	Number int `json:"number"`
	// Session is the provider session the turn reported.
	Session string `json:"session,omitempty"`
	Turn    Turn   `json:"turn"`
	// Identity names the content the turn left, which the run checked.
	Identity string `json:"identity,omitempty"`
	// Changes is what the turn changed, from the content it started on (the
	// pinned base for the first turn); unset when it changed nothing.
	Changes *Artifact   `json:"changes,omitempty"`
	Run     *CommandRun `json:"run,omitempty"`
	// Stopped is why verification ended at this attempt without a pass.
	Stopped string `json:"stopped,omitempty"`
}

// CommandRun is one run of the verification command.
type CommandRun struct {
	Command    string    `json:"command"`
	Dir        string    `json:"dir"`
	Exit       *Exit     `json:"exit,omitempty"`
	TimedOut   bool      `json:"timed_out,omitempty"`
	Cancelled  bool      `json:"cancelled,omitempty"`
	Error      string    `json:"error,omitempty"` // it could not run
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	WallMS     int64     `json:"wall_ms"`
	Output     Output    `json:"output"`
	// After names the content the run left when it differs from what it
	// checked: a run that changes the checkout fails (ADR-002 rule 7), and
	// AfterChanges is what it changed.
	After        string    `json:"after,omitempty"`
	AfterChanges *Artifact `json:"after_changes,omitempty"`
	Passed       bool      `json:"passed"`
}

// Output is a command's combined stdout and stderr, bounded: its head and
// tail, the size of the whole, the bytes left out between them, and the
// SHA-256 of the whole.
type Output struct {
	Head    string `json:"head"`
	Tail    string `json:"tail,omitempty"`
	Bytes   int64  `json:"bytes"`
	Omitted int64  `json:"omitted,omitempty"`
	SHA256  string `json:"sha256"`
}

// Totals are what every turn of a call adds up to. A figure some turn did
// not report is unknown for the call, never a partial sum.
type Totals struct {
	Usage     *Usage
	Cost      Cost
	RuntimeMS *int64
}

// Sum adds up the turns of one call.
func Sum(turns []Turn) Totals {
	totals := Totals{Cost: Cost{Source: CostUnknown}}
	if len(turns) == 0 {
		return totals
	}
	var usd float64
	var runtimeMS int64
	costKnown, runtimeKnown := true, true
	usage := &Usage{}
	fields := func(u *Usage) []**int64 {
		return []**int64{&u.InputTokens, &u.OutputTokens, &u.CacheReadTokens, &u.CacheWriteTokens, &u.ReasoningTokens}
	}
	for i, turn := range turns {
		if turn.CostUSD == nil {
			costKnown = false
		} else {
			usd += *turn.CostUSD
		}
		if turn.RuntimeMS == nil {
			runtimeKnown = false
		} else {
			runtimeMS += *turn.RuntimeMS
		}
		reported := turn.Usage
		if reported == nil {
			reported = &Usage{}
		}
		for f, sum := range fields(usage) {
			value := *fields(reported)[f]
			switch {
			case value == nil:
				*sum = nil
			case i == 0:
				v := *value
				*sum = &v
			case *sum != nil:
				v := **sum + *value
				*sum = &v
			}
		}
	}
	if costKnown {
		totals.Cost = Cost{USD: &usd, Source: CostRuntime}
	}
	if runtimeKnown {
		totals.RuntimeMS = &runtimeMS
	}
	if *usage != (Usage{}) {
		totals.Usage = usage
	} else if len(turns) == 1 {
		totals.Usage = turns[0].Usage
	}
	return totals
}
