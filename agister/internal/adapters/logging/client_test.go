package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/logging"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// refusing is a client whose every command fails with err, giving back
// what it was given to return.
type refusing struct {
	contract.Client
	err       error
	processes []contract.ProcessSummary
	id        string
}

func (r refusing) ListProcesses(context.Context) ([]contract.ProcessSummary, error) {
	return r.processes, r.err
}

func (r refusing) Submit(context.Context, contract.CallRequest) (string, error) { return r.id, r.err }

func (r refusing) Inspect(context.Context, string) (contract.Run, error) {
	return contract.Run{}, r.err
}

// records is every record in the log written to buffer.
func records(t *testing.T, buffer *bytes.Buffer) []map[string]any {
	t.Helper()
	var found []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buffer.String()), "\n") {
		if line == "" {
			continue
		}
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("log line %q: %v", line, err)
		}
		found = append(found, entry)
	}
	return found
}

// A command the settings refuse is logged as an error with the problems
// that refuse it, under the context's correlation, its result and error
// unchanged.
func TestASettingsRefusalIsLogged(t *testing.T) {
	t.Parallel()
	var buffer bytes.Buffer
	log := slog.New(logging.Handler{Handler: slog.NewJSONHandler(&buffer, nil)})
	refusal := &contract.SettingsError{Report: contract.CheckReport{Problems: []contract.Problem{{Message: "service service: not found"}}}}
	given := []contract.ProcessSummary{{Name: "p"}}
	client := logging.Client{Client: refusing{err: refusal, processes: given}, Log: log}
	ctx := app.WithCorrelation(context.Background(), "process", "p")

	processes, err := client.ListProcesses(ctx)
	if err != refusal || !reflect.DeepEqual(processes, given) {
		t.Fatalf("ListProcesses = %v, %v", processes, err)
	}
	logged := records(t, &buffer)
	if len(logged) != 1 {
		t.Fatalf("logged = %v", logged)
	}
	want := map[string]any{
		"msg": "the settings refused the command", "level": "ERROR", "operation": "ListProcesses",
		"error": refusal.Error(), "problems": []any{"service service: not found"}, "process": "p",
	}
	for key, value := range want {
		if !reflect.DeepEqual(logged[0][key], value) {
			t.Fatalf("logged %s = %v, want %v", key, logged[0][key], value)
		}
	}
}

// A call that could not be submitted has no run, so its failure, whatever
// it is, is logged once, its id and error unchanged; a refusal of it by the
// settings is logged as one.
func TestACallNotSubmittedIsLogged(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		err error
		msg string
	}{
		"failed":  {errors.New("mkdir runs: not a directory"), "the call was not submitted"},
		"refused": {&contract.SettingsError{}, "the settings refused the command"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			var buffer bytes.Buffer
			client := logging.Client{Client: refusing{err: tc.err, id: "given"}, Log: slog.New(slog.NewJSONHandler(&buffer, nil))}
			id, err := client.Submit(context.Background(), contract.CallRequest{Process: "review", Cwd: "/repo"})
			if id != "given" || err != tc.err {
				t.Fatalf("Submit = %q, %v", id, err)
			}
			logged := records(t, &buffer)
			if len(logged) != 1 || logged[0]["msg"] != tc.msg || logged[0]["level"] != "ERROR" || logged[0]["error"] != tc.err.Error() {
				t.Fatalf("logged = %v", logged)
			}
			if name == "failed" && (logged[0]["process"] != "review" || logged[0]["cwd"] != "/repo") {
				t.Fatalf("logged = %v", logged)
			}
		})
	}
}

// What fails after a run exists, or is the caller's to act on, as a run not
// found, is not the log's: the client says it, and the run records it.
func TestOtherFailuresAreNotLogged(t *testing.T) {
	t.Parallel()
	var buffer bytes.Buffer
	client := logging.Client{Client: refusing{err: contract.ErrNotFound}, Log: slog.New(slog.NewJSONHandler(&buffer, nil))}
	if _, err := client.Inspect(context.Background(), "r1"); err != contract.ErrNotFound {
		t.Fatalf("Inspect: %v", err)
	}
	if _, err := client.ListProcesses(context.Background()); err != contract.ErrNotFound {
		t.Fatalf("ListProcesses: %v", err)
	}
	if buffer.Len() != 0 {
		t.Fatalf("logged %s", buffer.String())
	}
}
