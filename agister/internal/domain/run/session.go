package run

// SessionTotals are a provider session's totals as its runtime has them,
// counting every turn the session had: Claude Code's total_cost_usd and
// Codex's turn.completed usage are such totals.
type SessionTotals struct {
	CostUSD *float64 `json:"cost_usd,omitempty"`
	Usage   *Usage   `json:"usage,omitempty"`
}

// Own sets a turn's own cost and usage from the session totals it
// reported: those totals less the session's before the turn. A fresh
// session had nothing before it; a resumed one had what its runtime had on
// record for it when the turn started (SessionBefore), unknown when the
// runtime had none. A figure that cannot be derived, or comes out
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
