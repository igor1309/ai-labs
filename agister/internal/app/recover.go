package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/prompt"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Recoverer follows the stale turns of calls with recovery turns (ADR-023),
// through the contract it declares here: one recovery per call (Recover).
type Recoverer struct {
	clock RecoverClock
}

// RecoverClock tells how much of the call's time is left, and when each
// recovery turn starts and ends.
type RecoverClock interface{ Now() time.Time }

// RecoverAdapters are what a Recoverer runs on.
type RecoverAdapters struct {
	Clock RecoverClock
}

// NewRecoverer returns the component that recovers stale turns. Its
// collaborator is required.
func NewRecoverer(clock RecoverClock) *Recoverer {
	return &Recoverer{clock: clock}
}

// RecoverCall is what one call's recovery takes its turns with, is bounded
// by and records to.
type RecoverCall struct {
	Record *run.Record
	Result *run.Result
	Event  func(source, kind string, data map[string]any)
	// Update writes the run's evidence.
	Update func(run.Record) error

	// Recover is the call's budget of resumes and what a recovery turn is
	// told with the evidence.
	Recover  CallRecover
	Limit    *float64  // the call's cost limit, one budget for every turn
	Deadline time.Time // the call's timeout, for every turn

	// Take runs a turn and records it with the call, given the resumed
	// session's totals before it; Conclude says whether a turn ended
	// validly, and why not.
	Take     func(TurnRequest, *run.SessionTotals) run.Turn
	Conclude func(run.Turn) *run.Error
}

// Recover returns the call's Take and Conclude with recovery: a turn taken
// that Agister ended at a staleness limit is followed by a recovery turn
// while rule 1's conditions hold, and the turn returned is the call's
// latest, which conclude concludes. Every turn of the call, its first, a
// repair or a recovery, is taken through them, so the budget is the call's
// whichever turn went stale. A call without a budget gets its own Take and
// Conclude back: nothing of it changes.
func (r *Recoverer) Recover(ctx context.Context, call RecoverCall) (take func(TurnRequest, *run.SessionTotals) run.Turn, conclude func(run.Turn) *run.Error) {
	if call.Recover.MaxResumes <= 0 {
		return call.Take, call.Conclude
	}
	recovery := &recovery{clock: r.clock, ctx: ctx, call: call, left: call.Recover.MaxResumes, sent: map[string]bool{}}
	return recovery.take, recovery.conclude
}

// recovery is one call's recovery of its stale turns: it resumes the
// session a stale turn reported, in place, with the evidence of what went
// stale, within the call's resumes, time and cost, and never with evidence
// it sent before. Every recovery turn is recorded before the call goes on.
type recovery struct {
	clock RecoverClock
	ctx   context.Context
	call  RecoverCall

	// left is how many resumes the call's budget still has.
	left int
	// sent names the evidence each recovery turn so far was sent.
	sent map[string]bool
	// turns counts the call's turns taken, of every kind.
	turns int
	// fault is why the latest turn taken does not stand, where only the
	// recovery knows: its session, or its record.
	fault *run.Error
}

// take takes a turn and, while it is ended at a staleness limit and may be
// recovered, the recovery turn that follows it.
func (r *recovery) take(request TurnRequest, before *run.SessionTotals) run.Turn {
	r.fault = nil
	turn := r.call.Take(request, before)
	r.turns++
	for r.fault == nil && endedStale(turn) {
		stale := *turn.Stale
		remaining, budget, why := r.admit(turn)
		if why != "" {
			r.call.Event(run.SourceAgister, "RECOVERY_NOT_STARTED", map[string]any{"limit": stale.Limit, "reason": why})
			break
		}
		turn = r.resume(request, turn, remaining, budget)
	}
	return turn
}

// conclude says whether the turn take last returned ended validly.
func (r *recovery) conclude(turn run.Turn) *run.Error {
	if r.fault != nil {
		return r.fault
	}
	return r.call.Conclude(turn)
}

// admit is what a recovery turn after the stale turn may take of the call's
// time and cost, or why none starts (rule 1). The turn's process group has
// ended: a runner returns from a turn only once it has (ADR-001 rule 11).
func (r *recovery) admit(stale run.Turn) (remaining time.Duration, budget *float64, why string) {
	switch {
	case r.sent[evidence(*stale.Stale)]:
		return 0, nil, "the same evidence was sent before: the limit was reached again on the same thing"
	case r.left <= 0:
		return 0, nil, fmt.Sprintf("no resume is left of stale.recover.max_resumes %d", r.call.Recover.MaxResumes)
	case stale.ProviderSessionID == "":
		return 0, nil, "the stale turn reported no session to resume"
	case r.ctx.Err() != nil:
		return 0, nil, "the call is cancelled"
	}
	if remaining = r.call.Deadline.Sub(r.clock.Now()); remaining <= 0 {
		return 0, nil, "the call's timeout has passed"
	}
	budget, known := costLeft(r.call.Limit, r.call.Result.Cost)
	switch {
	case !known:
		return 0, nil, fmt.Sprintf("a turn's cost is unknown, so the cost limit %g cannot be enforced", *r.call.Limit)
	case budget != nil && *budget <= 0:
		return 0, nil, fmt.Sprintf("the cost limit %g is spent", *r.call.Limit)
	}
	return remaining, budget, ""
}

// resume takes the recovery turn after the stale turn, which request made:
// the same request with the evidence as its prompt, in the session the
// stale turn reported, and records it with how it ended.
func (r *recovery) resume(request TurnRequest, stale run.Turn, remaining time.Duration, budget *float64) run.Turn {
	found, session := *stale.Stale, stale.ProviderSessionID
	r.sent[evidence(found)] = true
	r.left--
	message := prompt.Recovery(r.call.Recover.Instruction, found)
	digest := sha256.Sum256([]byte(message))
	recorded := run.Recovery{
		Number: len(r.call.Record.Recoveries) + 1, Follows: r.turns, Stale: found,
		MessageSHA256: hex.EncodeToString(digest[:]), Resumed: session,
	}
	request.Prompt = message
	request.ResumeSessionID = session
	request.Timeout = remaining
	request.MaxCostUSD = budget
	r.call.Event(run.SourceAgister, "RECOVERY_STARTED", map[string]any{
		"recovery": recorded.Number, "limit": found.Limit, "session": session, "message_sha256": recorded.MessageSHA256,
	})
	recorded.StartedAt = r.clock.Now()
	// The session's totals before the recovery are what the stale turn
	// reported.
	turn := r.call.Take(request, stale.Session)
	r.turns++
	recorded.FinishedAt = r.clock.Now()
	recorded.WallMS = recorded.FinishedAt.Sub(recorded.StartedAt).Milliseconds()
	recorded.Session, recorded.Usage, recorded.CostUSD, recorded.RuntimeMS = turn.ProviderSessionID, turn.Usage, turn.CostUSD, turn.RuntimeMS

	fault := r.call.Conclude(turn)
	switch {
	// A recovery that reports no session confirms none: it is not in the
	// call's session, whatever it did.
	case fault == nil && turn.ProviderSessionID != session:
		fault = run.Fault(run.ClassRuntimeError, "the recovery turn resumed session %s, but the runtime reported session %q", session, turn.ProviderSessionID)
		// Nor is its output the call's.
		r.call.Result.Output = nil
		r.fault = fault
		recorded.Outcome = run.RecoveryFailed
	case fault == nil:
		recorded.Outcome = run.RecoveryCompleted
	case endedStale(turn) && r.sent[evidence(*turn.Stale)]:
		recorded.Outcome = run.RecoverySameLimit
	case endedStale(turn):
		recorded.Outcome = run.RecoveryDifferentLimit
	default:
		recorded.Outcome = run.RecoveryFailed
	}
	recorded.Error = fault
	// The call goes on only once the recovery is recorded.
	r.call.Record.Recoveries = append(r.call.Record.Recoveries, recorded)
	if err := r.call.Update(*r.call.Record); err != nil {
		r.fault = run.Fault(run.ClassInternal, "recording recovery %d failed: %v", recorded.Number, err)
		r.call.Result.Output = nil
	}
	data := map[string]any{"recovery": recorded.Number, "outcome": recorded.Outcome}
	if fault != nil {
		data["class"], data["message"] = string(fault.Class), fault.Message
	}
	r.call.Event(run.SourceAgister, "RECOVERY_FINISHED", data)
	return turn
}

// evidence names what a stale turn's recovery is sent, so the same is
// never sent twice (rule 3): the limit and, for a call repeated or a
// command that hung, the tool and the digest of its whole input.
func evidence(stale run.Stale) string {
	if stale.Tool == nil || stale.Limit == run.StaleNoEvent {
		return stale.Limit
	}
	return stale.Limit + "\x00" + stale.Tool.Name + "\x00" + stale.Tool.SHA256
}

// endedStale is whether a staleness limit is what ended the turn: one that
// reported its own end before Agister ended it keeps that end, and is not
// stale (rule 1).
func endedStale(turn run.Turn) bool {
	return turn.Stale != nil && turn.Error != nil && *turn.Error == *staleFault(*turn.Stale)
}

// costLeft is what a further turn may spend of the call's cost limit: the
// limit less what every turn so far cost on its own (ADR-002 rule 5), nil
// without a limit. known is false when a turn's cost is unknown under a
// limit, which then cannot be enforced.
func costLeft(limit *float64, spent run.Cost) (left *float64, known bool) {
	if limit == nil {
		return nil, true
	}
	if spent.Source == run.CostUnknown || spent.USD == nil {
		return nil, false
	}
	remaining := *limit - *spent.USD
	return &remaining, true
}
