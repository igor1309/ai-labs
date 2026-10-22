package call

import (
	"context"
	"slices"
)

// Maker makes a call of a step, each line its turns report given to
// report: a Caller.
type Maker interface {
	Call(ctx context.Context, step Step, report func(Report)) Result
}

// Fallback is where a call is made again once it has ended at capacity
// (ADR-004, rule 8): the maker of the fallback agent's turns, and the
// step on that agent, the same process with the same inputs.
type Fallback struct {
	Maker Maker
	Step  Step
}

// WithFallback makes step on primary, and, where that call ends of the
// class capacity, its turns at capacity spent, reports so and makes the
// call again on fallback: fresh, in no session, within what the first
// call left of the time limit, cost limit and the day's budget, deducting
// all known spend even when its total cost is unknown. Any other end is
// the call's. The fallback's own end is the call's, at capacity too: a
// fallback is never followed
// further. The call's result is then the fallback's, but its timing,
// from the first call's start; its cost, usage and warnings, both calls';
// and its primary, the first call's result. No fallback is made where
// ctx has ended or no time is left.
func WithFallback(ctx context.Context, primary Maker, step Step, fallback Fallback, report func(Report)) Result {
	turns := 0
	first := primary.Call(ctx, step, func(r Report) {
		if r.Capacity != nil {
			turns++
		}
		report(r)
	})
	if first.Class != Capacity || turns < capacityTurns || ctx.Err() != nil {
		return first
	}
	again := fallback.Step
	again.Session, again.SessionCostBefore = "", nil
	if step.TimeLimit > 0 {
		left := step.TimeLimit - first.Timing.Duration
		if left <= 0 {
			return first
		}
		again.TimeLimit = left
	}
	if limit := again.CostLimit; limit != nil {
		left := *limit - first.knownCost
		again.CostLimit = &left
	}
	if day := again.DailyBudget; day != nil {
		after := DailyBudget{Cost: day.Cost, Spent: day.Spent + first.knownCost}
		again.DailyBudget = &after
	}
	report(Report{Fallback: true})
	second := fallback.Maker.Call(ctx, again, report)
	return fellBack(first, second)
}

// fellBack is the result of a call whose first result, first, ended at
// capacity, and which its fallback ended as second.
func fellBack(first, second Result) Result {
	result := second
	result.Timing = Timing{Started: first.Timing.Started, Ended: second.Timing.Ended,
		Duration: second.Timing.Ended.Sub(first.Timing.Started)}
	result.Cost = total([]*float64{first.Cost, second.Cost})
	result.knownCost = first.knownCost + second.knownCost
	result.CostSource = ""
	if result.Cost != nil {
		result.CostSource = first.CostSource
		if first.CostSource != second.CostSource {
			result.CostSource = first.CostSource + ", " + second.CostSource
		}
	}
	result.Usage = nil
	if first.Usage != nil && second.Usage != nil {
		a, b := *first.Usage, *second.Usage
		result.Usage = &Usage{
			Input:      total([]*int64{a.Input, b.Input}),
			Output:     total([]*int64{a.Output, b.Output}),
			CacheRead:  total([]*int64{a.CacheRead, b.CacheRead}),
			CacheWrite: total([]*int64{a.CacheWrite, b.CacheWrite}),
			Reasoning:  total([]*int64{a.Reasoning, b.Reasoning}),
		}
	}
	result.Warnings = slices.Concat(first.Warnings, second.Warnings)
	result.Primary = &first
	return result
}
