package run

// SessionTotals are a provider session's totals as its runtime has them,
// counting every turn the session had: Claude Code's total_cost_usd,
// Codex's turn.completed usage and ccusage's cost of a Codex thread are
// such totals.
type SessionTotals struct {
	CostUSD *float64 `json:"cost_usd,omitempty"`
	Usage   *Usage   `json:"usage,omitempty"`
}

// Own sets a turn's own cost and usage from the session totals it
// reported: those totals less the session's before the turn. A fresh
// session had nothing before it; a resumed one had SessionBefore, unknown
// when unset. A figure that cannot be derived, or comes out
// negative, is unknown, never a guess. A figure the runtime reported only
// as the turn's own is kept.
func Own(turn Turn, resumed bool) Turn {
	if turn.Session == nil {
		return turn
	}
	var prior SessionTotals
	if turn.SessionBefore != nil {
		prior = *turn.SessionBefore
	}
	fresh := !resumed
	if turn.Session.CostUSD != nil {
		turn.CostUSD = since(turn.Session.CostUSD, prior.CostUSD, fresh)
	}
	if total := turn.Session.Usage; total != nil {
		earlier := prior.Usage
		if earlier == nil {
			earlier = &Usage{}
		}
		turn.Usage = &Usage{
			InputTokens:      since(total.InputTokens, earlier.InputTokens, fresh),
			OutputTokens:     since(total.OutputTokens, earlier.OutputTokens, fresh),
			CacheReadTokens:  since(total.CacheReadTokens, earlier.CacheReadTokens, fresh),
			CacheWriteTokens: since(total.CacheWriteTokens, earlier.CacheWriteTokens, fresh),
			ReasoningTokens:  since(total.ReasoningTokens, earlier.ReasoningTokens, fresh),
		}
	}
	return turn
}

// LatestTotals is a provider session's totals as Agister last recorded
// them, from records of every run in the store: those its latest turn in
// the session reported. The run excluded is the one asking. Only turns
// Agister ran are seen: a turn made on the session outside Agister is not,
// and whatever it cost is counted again by the next turn Agister runs.
//
// The totals are unknown, never a guess, when the session's latest run is
// (see Latest), when that run was reaped with a process recorded, or when
// its latest turn did not report the session with totals: a run the reaper
// finished with a runtime process recorded may have been in a turn not yet
// saved, whether or not it saved one, as its owner ended.
func LatestTotals(records []Record, session, exclude string) *SessionTotals {
	latest, known := Latest(records, session, exclude)
	if !known || latest == nil {
		return nil
	}
	if reaped(*latest) && startedProcess(*latest) {
		return nil
	}
	if turn := latest.Turn; turn != nil && turn.ProviderSessionID == session {
		return turn.Session
	}
	return nil
}

// Latest is a provider session's latest run, the one in it that finished
// last, from records of every run in the store; the run excluded is the one
// asking. It is nil when no run is in the session.
//
// A run is in the session when it reported it or continued a run that is;
// one still running may be in a turn not yet recorded. A finished run that
// started no runtime process and ran no turn, a refused one, left the
// session as it was and is not in it. known is false when the latest run
// cannot be told: a run in the session has not finished, or the last to
// finish overlapped another.
func Latest(records []Record, session, exclude string) (latest *Record, known bool) {
	if session == "" {
		return nil, true
	}
	byID := make(map[string]Record, len(records))
	for _, record := range records {
		byID[record.ID] = record
	}
	var in []Record
	for _, record := range records {
		if record.ID == exclude || record.FinishedAt != nil && record.Turn == nil && !startedProcess(record) {
			continue
		}
		if inSession(record, session, byID, len(records)) {
			in = append(in, record)
		}
	}
	for i, record := range in {
		if record.FinishedAt == nil {
			return nil, false
		}
		if latest == nil || record.FinishedAt.After(*latest.FinishedAt) {
			latest = &in[i]
		}
	}
	if latest == nil {
		return nil, true
	}
	for _, record := range in {
		if record.ID != latest.ID && record.FinishedAt.After(latest.CreatedAt) {
			return nil, false
		}
	}
	return latest, true
}

// startedProcess tells whether a run recorded its runtime's process.
func startedProcess(record Record) bool {
	return record.Effects != nil && record.Effects.Process != nil
}

// reaped tells whether the reaper finished a run: its owner ended first.
func reaped(record Record) bool {
	return record.Result != nil && record.Result.Error != nil && record.Result.Error.Class == ClassAbandoned
}

// inSession tells whether a run reported the session, on its result or any
// turn, or continued a run that did; depth bounds a chain of continuations.
func inSession(record Record, session string, byID map[string]Record, depth int) bool {
	if record.Result != nil && record.Result.Session != nil && record.Result.Session.ProviderSessionID == session {
		return true
	}
	if record.Turn != nil && record.Turn.ProviderSessionID == session {
		return true
	}
	for _, attempt := range record.Attempts {
		if attempt.Turn.ProviderSessionID == session {
			return true
		}
	}
	continued, ok := byID[record.Request.Continue]
	return ok && depth > 0 && record.Request.Continue != "" && inSession(continued, session, byID, depth-1)
}

// since is a total less what it was before; the total itself for a fresh
// session.
func since[T int64 | float64](total, before *T, fresh bool) *T {
	if total == nil || !fresh && before == nil {
		return nil
	}
	own := *total
	if !fresh {
		own -= *before
	}
	if own < 0 {
		return nil
	}
	return &own
}
