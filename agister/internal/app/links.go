package app

import (
	"context"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// goalInput is the input a goal is when the request names none.
const goalInput = "goal"

// links reads what the request names as the call's goal and the judgement
// it answers from those runs' records (ADR-026 rules 2 and 6); nil when it
// names neither. It refuses a goal whose run does not exist, has no such
// input, or keeps that input's bytes nowhere, neither inline nor as an
// artifact, and a judgement whose run does not exist or did not complete.
func (c *Calls) links(ctx context.Context, request run.Request) (*run.Links, error) {
	if request.Goal == "" && request.Answers == "" {
		return nil, nil
	}
	links := &run.Links{}
	if request.Goal != "" {
		goal, err := c.goal(ctx, request.Goal)
		if err != nil {
			return nil, err
		}
		links.Goal = goal
	}
	if request.Answers != "" {
		judged, state, err := c.runs.Get(ctx, request.Answers)
		if err != nil {
			return nil, refuse("--answers: run %s: %v", request.Answers, err)
		}
		if state != run.StateFinished || judged.Result == nil || judged.Result.Status != run.Completed {
			return nil, refuse("--answers: run %s did not complete: it is %s", request.Answers, endedAs(state, judged.Result))
		}
		links.Judgement = &run.JudgementLink{Run: request.Answers}
	}
	return links, nil
}

// goal is the goal named <run-id>[:<input>], the input goal when it names
// none, as that run's record keeps it.
func (c *Calls) goal(ctx context.Context, named string) (*run.GoalLink, error) {
	id, input, found := strings.Cut(named, ":")
	if !found {
		input = goalInput
	}
	if id == "" || input == "" {
		return nil, refuse("--goal %s: expected <run-id>[:<input>]", named)
	}
	served, _, err := c.runs.Get(ctx, id)
	if err != nil {
		return nil, refuse("--goal: run %s: %v", id, err)
	}
	for _, kept := range served.Inputs {
		if kept.Name != input {
			continue
		}
		switch text, inline := kept.Value.(string); {
		case kept.Artifact != nil:
			return &run.GoalLink{Run: id, Input: input, Digest: kept.Artifact.Digest, Artifact: kept.Artifact}, nil
		case inline:
			return &run.GoalLink{Run: id, Input: input, Digest: "sha256:" + digestOf([]byte(text))}, nil
		}
		return nil, refuse("--goal: run %s keeps the bytes of its input %s nowhere, neither inline nor as an artifact", id, input)
	}
	return nil, refuse("--goal: run %s has no input %s", id, input)
}

// endedAs is how a run ended, as its state and result say: its status,
// qualified by its failure class, or its state when it has no result.
func endedAs(state run.State, result *run.Result) string {
	switch {
	case result == nil:
		return string(state)
	case result.Error != nil:
		return string(result.Status) + "/" + string(result.Error.Class)
	}
	return string(result.Status)
}
