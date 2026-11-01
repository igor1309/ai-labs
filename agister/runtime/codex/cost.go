package codex

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strings"
)

// price is what a lookup gave of a thread to date: its cost in US
// dollars and its usage, in codex's words, each nil where unknown; and
// why the cost is unknown, "" where it is known.
type price struct {
	cost    *float64
	usage   Usage
	unknown string
}

// pricing is what the wrapper reads of ccusage's report of a thread: its
// cost and tokens to date, and each model it used, by its name.
type pricing struct {
	TotalCost *float64 `json:"totalCost"`
	Input     *int64   `json:"inputTokens"`
	CacheRead *int64   `json:"cacheReadTokens"`
	Output    *int64   `json:"outputTokens"`
	Reasoning *int64   `json:"reasoningOutputTokens"`
	Models    map[string]struct {
		IsFallback bool `json:"isFallback"`
	} `json:"models"`
}

// lookup prices thread to date by ccusage's report of it, run through the
// supervisor in the turn's directory with its environment, its stdout's
// lines joined as one JSON object. -O prices from the table ccusage ships,
// with no network, the same price each time. Its lines go to no report:
// the turn has ended. Codex's input counts the cached tokens ccusage's
// input leaves out, so the usage's input is ccusage's input and cache
// reads.
func (w *Wrapper) lookup(ctx context.Context, turn Turn, thread string) price {
	var lines []string
	ended, err := w.supervisor.Run(ctx, Program{
		Name: "ccusage", Args: []string{"codex", "session", "--json", "-O", "--id", thread}, Dir: turn.Dir, Env: turn.Env,
		Line: func(line string) { lines = append(lines, line) },
	})
	unknown := func(why string) price {
		return price{unknown: fmt.Sprintf("ccusage could not price the thread %s: %s", thread, why)}
	}
	switch {
	case err != nil:
		return unknown(err.Error())
	case ended.Signal != "":
		return unknown("it was ended by " + ended.Signal)
	case ended.Code != 0:
		why := fmt.Sprintf("exit %d", ended.Code)
		if tail := strings.TrimSpace(ended.Stderr.Tail); tail != "" {
			why += ": " + tail
		}
		return unknown(why)
	}
	var r pricing
	if json.Unmarshal([]byte(strings.Join(lines, "\n")), &r) != nil || r.TotalCost == nil {
		return unknown("no totalCost")
	}
	for _, model := range slices.Sorted(maps.Keys(r.Models)) {
		if r.Models[model].IsFallback {
			return unknown(fmt.Sprintf("the model %s is priced as a fallback", model))
		}
	}
	var input *int64
	if r.Input != nil && r.CacheRead != nil {
		sum := *r.Input + *r.CacheRead
		input = &sum
	}
	return price{cost: r.TotalCost, usage: Usage{Input: input, CacheRead: r.CacheRead, Output: r.Output, Reasoning: r.Reasoning}}
}

// priced gives reply its turn's own cost and usage on thread, the
// thread's after less before, and the thread's cost after as the
// session's. A cost is unknown where either is, or where it fell, and
// reply gives why, the lookup before's first; a count is unknown where
// either is, or where it is less than zero.
func priced(reply *Reply, thread string, before, after price) {
	reply.SessionCost = after.cost
	switch {
	case before.unknown != "":
		reply.CostUnknown = before.unknown
	case after.unknown != "":
		reply.CostUnknown = after.unknown
	case *after.cost < *before.cost:
		reply.CostUnknown = fmt.Sprintf("ccusage could not price the thread %s: the cost fell from %g to %g", thread, *before.cost, *after.cost)
	default:
		cost := *after.cost - *before.cost
		reply.Cost, reply.CostSource = &cost, "ccusage"
	}
	reply.Usage = Usage{
		Input:     less(reply.Usage.Input, before.usage.Input),
		Output:    less(reply.Usage.Output, before.usage.Output),
		CacheRead: less(reply.Usage.CacheRead, before.usage.CacheRead),
		Reasoning: less(reply.Usage.Reasoning, before.usage.Reasoning),
	}
}

// less is count less before, nil where either is or it is less than
// zero.
func less(count, before *int64) *int64 {
	if count == nil || before == nil || *count < *before {
		return nil
	}
	left := *count - *before
	return &left
}
