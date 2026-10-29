package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/admit"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// Integration test: the record adapter's facts fold into its public record.
// Contract test: the filesystem-backed log grows linearly with call data.
func TestCallDataIsWrittenLinearlyAndFoldsToTheSameRecord(t *testing.T) {
	t.Parallel()
	for _, n := range []int{4, 16, 64} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			t.Parallel()
			folder := t.TempDir()
			store, err := runstore.New(folder)
			if err != nil {
				t.Fatal(err)
			}
			clock := clocktest.NewClock(recordStart)
			r, err := newRunRecord(store, clock, recordID, recordStart, cli.Request{Workflow: "many"}, nil, nil, "/r", "/r")
			if err != nil {
				t.Fatal(err)
			}
			if err := r.begin(); err != nil {
				t.Fatal(err)
			}
			r.Resolved([]givenInput{{name: "goal", Fixed: inputs.Fixed{Value: "ship", Identity: "digest"}}})
			r.ChildStarted("child", "nested", map[string]string{"goal": "ship"}, nil)
			payload := strings.Repeat("call-payload", 400)
			for i := range n {
				step := fmt.Sprintf("call-%03d", i)
				r.Started(step, "bash")
				r.Prepared(endedCall{step: step, process: "echo", agent: "bash"})
				clock.Advance(time.Second)
				r.Called(endedCall{step: step, process: "echo", agent: "bash", facts: admit.Facts{Content: payload}, result: workflow.Result{Status: workflow.Completed}})
				r.Ended(step, workflow.Ended{Status: workflow.Completed})
			}
			r.ChildEnded("child", workflow.ChildEnd{Status: workflow.Completed, Output: "done"})
			assertRecord := func() {
				t.Helper()
				got, err := store.Record(recordID)
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(asJSON(t, got), asJSON(t, r.written())) {
					t.Fatalf("fold differs from record: %+v", got)
				}
			}
			assertRecord()
			r.end(workflow.Result{Status: workflow.Completed, Timing: workflow.Timing{Started: recordStart, Ended: clock.Now()}})
			assertRecord()
			data, err := os.ReadFile(filepath.Join(folder, recordID, "run.jsonl"))
			if err != nil {
				t.Fatal(err)
			}
			if got := bytes.Count(data, []byte(payload)); got != 2*n {
				t.Fatalf("%d call payloads for %d calls, want %d", got, n, 2*n)
			}
			callData, err := json.Marshal(r.record.Calls[0])
			if err != nil {
				t.Fatal(err)
			}
			if bound := n*(2*len(callData)+2000) + 10000; len(data) > bound {
				t.Fatalf("%d bytes exceed linear bound %d", len(data), bound)
			}
			for _, raw := range bytes.Split(bytes.TrimSpace(data), []byte{'\n'}) {
				var line runstore.Line
				if err := json.Unmarshal(raw, &line); err != nil {
					t.Fatal(err)
				}
				if line.Event.Kind != runstore.RunStarted && line.Event.Kind != runstore.RunEnded && line.Event.Record != nil {
					t.Fatalf("snapshot in mid-run %s", line.Event.Kind)
				}
			}
		})
	}
}
