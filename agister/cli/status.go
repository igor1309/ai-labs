package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

// RunStates is read-only inspection, independent of exporting or starting runs.
type RunStates interface {
	States(id string, last bool) ([]RunState, error)
}

type RunState struct {
	ID     string        `json:"id"`
	Status string        `json:"status"`
	Since  time.Time     `json:"since,omitempty"`
	Active []RunActivity `json:"active"`
	Class  string        `json:"class,omitempty"`
	Reason string        `json:"reason,omitempty"`
}

type RunActivity struct {
	Step      string     `json:"step"`
	Since     time.Time  `json:"since"`
	WaitingOn string     `json:"waiting_on,omitempty"`
	Until     *time.Time `json:"until,omitempty"`
}

func (c *CLI) status(out io.Writer, id string, last, asJSON bool) (int, error) {
	states, err := c.states.States(id, last)
	if err != nil {
		return 0, err
	}
	if asJSON {
		if states == nil {
			states = []RunState{}
		}
		return 0, json.NewEncoder(out).Encode(states)
	}
	for _, s := range states {
		if _, err := fmt.Fprintf(out, "%s: %s\n", s.ID, stateText(s)); err != nil {
			return 0, err
		}
	}
	return 0, nil
}

func stateText(s RunState) string {
	stamp := func(at time.Time) string { return at.UTC().Format(time.RFC3339Nano) }
	switch s.Status {
	case "running", "waiting":
		var parts []string
		for _, a := range s.Active {
			if a.WaitingOn == "" {
				parts = append(parts, "running "+a.Step+" since "+stamp(a.Since))
				continue
			}
			wait := "waiting on " + a.WaitingOn + " since " + stamp(a.Since)
			if a.Until != nil {
				wait += " until " + stamp(*a.Until)
			}
			parts = append(parts, wait+" ("+a.Step+")")
		}
		if len(parts) == 0 {
			return "running since " + stamp(s.Since)
		}
		return strings.Join(parts, "; ")
	case "writer stalled":
		return "writer stalled since " + stamp(s.Since)
	case "failed", "interrupted":
		if s.Class != "" || s.Reason != "" {
			return "failed: " + s.Class + ": " + strings.Join(strings.Fields(s.Reason), " ")
		}
		return s.Status
	case "lost":
		return "lost (process gone)"
	default:
		return s.Status
	}
}

func parseStatus(words []string, f flags) (command, error) {
	if err := f.only("last", "json"); err != nil {
		return command{}, err
	}
	if len(words) > 1 || len(words) == 1 && f.last {
		return command{}, errors.New("status takes a run id or --last")
	}
	id := ""
	if len(words) == 1 {
		id = words[0]
	}
	return command{run: func(c *CLI, out io.Writer, _ string) (int, error) { return c.status(out, id, f.last, f.json) }}, nil
}
