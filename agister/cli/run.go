package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"strings"
	"time"
)

// Runner is the port of a run: it runs a request at a command's launch
// directory and gives its result. An error is the run's refusal, or a
// failure before anything ran.
type Runner interface {
	Run(launch string, request Request) (Result, error)
}

// Request is what a run names: a workflow, or a step, by its process and
// its agent (ADR-013); the params given, by name, nil for none; the id of
// the run whose session it continues, "" for none; and the id of the run
// whose completed calls it reuses, "" for none.
type Request struct {
	Workflow string
	Process  string
	Agent    string
	Params   map[string]string
	Continue string
	Reuse    string
}

// RunStatus is how a run ended.
type RunStatus string

const (
	RunCompleted   RunStatus = "completed"
	RunFailed      RunStatus = "failed"
	RunInterrupted RunStatus = "interrupted"
	RunLost        RunStatus = "lost"
)

// Class is why a run that did not complete ended so.
type Class string

// Result is a run's result (ADR-001, invariant 3): the id of its run; its
// status and class, "" for none; its output; its timing; its cost, nil
// where it is unknown; its usage; its sessions, each step's name to the
// session its call reported; its reason, "" for none; and its warnings.
type Result struct {
	RunID    string
	Status   RunStatus
	Class    Class
	Output   map[string]any
	Timing   Timing
	Cost     *float64
	Usage    Usage
	Sessions map[string]string
	Reason   string
	Warnings []string
}

// Usage is the tokens a run used, each nil where it is unknown.
type Usage struct {
	Input, Output, CacheRead, CacheWrite, Reasoning *int64
}

// Timing is when a run started and ended, and how long it took.
type Timing struct {
	Started, Ended time.Time
	Duration       time.Duration
}

// printed is a result as it is printed: a class, a cost, a count of usage
// and a reason that are none as null, never "" or 0.
type printed struct {
	RunID    string            `json:"run_id"`
	Status   RunStatus         `json:"status"`
	Class    *Class            `json:"class"`
	Output   map[string]any    `json:"output"`
	Timing   printedTiming     `json:"timing"`
	Cost     *float64          `json:"cost"`
	Usage    printedUsage      `json:"usage"`
	Sessions map[string]string `json:"sessions"`
	Reason   *string           `json:"reason"`
	Warnings []string          `json:"warnings"`
}

type printedUsage struct {
	Input      *int64 `json:"input_tokens"`
	Output     *int64 `json:"output_tokens"`
	CacheRead  *int64 `json:"cache_read_tokens"`
	CacheWrite *int64 `json:"cache_write_tokens"`
	Reasoning  *int64 `json:"reasoning_tokens"`
}

type printedTiming struct {
	Started    time.Time `json:"started"`
	Ended      time.Time `json:"ended"`
	DurationMS int64     `json:"duration_ms"`
}

// runRequest runs request and prints its result as JSON; it exits 0 when
// the run completed, 1 when it did not.
func (c *CLI) runRequest(out io.Writer, launch string, request Request) (int, error) {
	result, err := c.runner.Run(launch, request)
	if err != nil {
		return 0, err
	}
	p := printed{
		RunID:    result.RunID,
		Status:   result.Status,
		Output:   result.Output,
		Timing:   printedTiming{Started: result.Timing.Started, Ended: result.Timing.Ended, DurationMS: result.Timing.Duration.Milliseconds()},
		Cost:     result.Cost,
		Usage:    printedUsage(result.Usage),
		Sessions: map[string]string{},
		Warnings: append([]string{}, result.Warnings...),
	}
	maps.Copy(p.Sessions, result.Sessions)
	if result.Class != "" {
		p.Class = &result.Class
	}
	if result.Reason != "" {
		p.Reason = &result.Reason
	}
	// A script's output is printed as it is: "<", ">" and "&" are not
	// HTML here.
	encoder := json.NewEncoder(out)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(p); err != nil {
		return 0, err
	}
	if result.Status != RunCompleted {
		return exitFault, nil
	}
	return 0, nil
}

// parseRun is the request of "run" with the words after it and the flags
// given: a workflow, by the one word, or a step, by --process and --agent;
// each --param, as <name>=<value>, a name given once; and the run
// --continue names or the run --reuse names, not both.
func parseRun(words []string, f flags) (Request, error) {
	request := Request{Process: f.process, Agent: f.agent, Continue: f.continued, Reuse: f.reused}
	if f.continued != "" && f.reused != "" {
		return Request{}, errors.New("run takes --continue or --reuse, not both")
	}
	switch {
	case len(words) == 1 && f.process == "" && f.agent == "":
		request.Workflow = words[0]
	case len(words) == 0 && f.process != "" && f.agent != "":
	default:
		return Request{}, errors.New("run names a workflow, or a step by --process and --agent")
	}
	for _, param := range f.params {
		name, value, ok := strings.Cut(param, "=")
		if !ok || name == "" {
			return Request{}, fmt.Errorf("--param %s is not <name>=<value>", param)
		}
		if _, given := request.Params[name]; given {
			return Request{}, fmt.Errorf("the param %s is given twice", name)
		}
		if request.Params == nil {
			request.Params = map[string]string{}
		}
		request.Params[name] = value
	}
	return request, nil
}
