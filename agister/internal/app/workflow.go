package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A workflow (ADR-003) runs its fan-out nodes, each an ordinary call of its
// process over the same resolved values, and, once every one of them
// completed, its join: a fresh call of its process given the collection of
// their outputs and nothing else. The core transports the outputs without
// reading them.

// flow serializes a workflow's cancellation with the start of its nodes
// (ADR-003 rule 6): once stopped, no node starts, and a node started before
// is cancelled with the workflow's context, from which its own derives.
type flow struct {
	mu      sync.Mutex
	stopped bool
	cancel  context.CancelFunc
}

func (f *flow) stop() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stopped = true
	f.cancel()
}

// start runs begin unless the workflow was stopped, and reports whether it
// ran. A stop waits for begin to return.
func (f *flow) start(begin func()) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.stopped {
		return false
	}
	begin()
	return true
}

func (f *flow) cancelled() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.stopped
}

// collected is one fan-out node's entry in the collection: its recorded
// output, unchanged, or its text when its process's output is text.
type collected struct {
	Node    string          `json:"node"`
	Process string          `json:"process"`
	Run     string          `json:"run"`
	Output  json.RawMessage `json:"output,omitempty"`
	Text    string          `json:"text,omitempty"`
}

// nodeEnd is a node's run as it finished; index is the node's in the
// workflow record.
type nodeEnd struct {
	index  int
	record run.Record
}

// workflowRequest refuses what a workflow cannot take from its caller:
// each node runs with its own process's agent and limits, and continuing a
// workflow is not supported.
func workflowRequest(request run.Request) error {
	var given []string
	if request.Agent != "" {
		given = append(given, "an agent")
	}
	if request.Timeout != "" {
		given = append(given, "a timeout")
	}
	if request.MaxCostUSD != nil {
		given = append(given, "a cost limit")
	}
	if request.Continue != "" {
		given = append(given, "a run to continue")
	}
	if len(given) > 0 {
		return refuse("workflow %s takes params only, not %s: each node runs with its own process's agent and limits", request.Process, strings.Join(given, ", "))
	}
	return nil
}

// passedValues are the workflow's resolved values as a node's params take
// them: a revision as its commit identity, any other value as its text.
func passedValues(inputs []run.Input) (map[string]string, error) {
	values := map[string]string{}
	for _, input := range inputs {
		text, ok := input.Value.(string)
		if !ok {
			return nil, refuse("input %s is not one text value, which a node's param takes", input.Name)
		}
		if input.Revision {
			text = input.Identity
		}
		values[input.Name] = text
	}
	return values, nil
}

// collect builds the collection from the fan-out nodes' finished records:
// for each node in declaration order, whatever order they finished in, its
// name, process, run and recorded output. It returns the collection as the
// join's input value, identified by its digest, and its bytes.
func collect(workflow definition.Workflow, records []run.Record) (Resolved, []byte, error) {
	entries := make([]collected, len(workflow.FanOut))
	for i, node := range workflow.FanOut {
		entries[i] = collected{Node: node.Name, Process: node.Process, Run: records[i].ID}
		if result := records[i].Result; result != nil {
			entries[i].Output = result.Output
			if len(result.Output) == 0 {
				entries[i].Text = result.Text
			}
		}
	}
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(entries); err != nil {
		return Resolved{}, nil, err
	}
	data := bytes.TrimRight(buffer.Bytes(), "\n")
	sum := sha256.Sum256(data)
	return Resolved{Value: string(data), Identity: "sha256:" + hex.EncodeToString(sum[:])}, data, nil
}

// nodeTotals sums the usage and cost of the nodes that ran; a figure some
// node did not report is unknown for the workflow.
func nodeTotals(results []run.Result) run.Totals {
	turns := make([]run.Turn, len(results))
	for i, result := range results {
		turns[i] = run.Turn{CostUSD: result.Cost.USD, Usage: result.Usage}
	}
	return run.Sum(turns)
}

func or(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
