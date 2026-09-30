package app

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Runs reads evidence: observation, inspection, listing, cancellation.
type Runs struct {
	reader RunsReader
	hosted *Hosted
	// How often Observe polls a running record.
	pollInterval time.Duration
}

// RunsReader reads evidence. A record that is not finished and no longer
// owned reads as abandoned.
type RunsReader interface {
	Get(ctx context.Context, id string) (run.Record, run.State, error)
	Events(ctx context.Context, id string, afterSeq int) ([]run.Event, run.State, error)
	List(ctx context.Context) ([]run.Record, error)
}

// NewRuns returns the use case that reads evidence and cancels the calls
// hosted in this process. pollInterval is how often Observe polls a running
// record; zero means 50ms.
func NewRuns(reader RunsReader, hosted *Hosted, pollInterval time.Duration) *Runs {
	return &Runs{reader: reader, hosted: hosted, pollInterval: pollInterval}
}

func (r *Runs) Observe(ctx context.Context, id string, afterSeq int, each func(contract.Event) error) error {
	interval := r.pollInterval
	if interval == 0 {
		interval = 50 * time.Millisecond
	}
	for {
		events, status, err := r.reader.Events(ctx, id, afterSeq)
		if err != nil {
			return err
		}
		for _, event := range events {
			if err := each(contract.Event{Seq: event.Seq, At: event.At, Source: event.Source, Kind: event.Kind, Data: event.Data}); err != nil {
				return err
			}
			afterSeq = event.Seq
		}
		if status != run.StateRunning {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
		}
	}
}

func (r *Runs) Cancel(_ context.Context, id string) error {
	if !r.hosted.cancel(id) {
		return &contract.InputError{Message: fmt.Sprintf("run %s is not running in this process", id)}
	}
	return nil
}

func (r *Runs) Inspect(ctx context.Context, id string) (contract.Run, error) {
	record, status, err := r.reader.Get(ctx, id)
	if err != nil {
		return contract.Run{}, err
	}
	return r.view(record, status), nil
}

func (r *Runs) ListRuns(ctx context.Context) ([]contract.Run, error) {
	records, err := r.reader.List(ctx)
	if err != nil {
		return nil, err
	}
	runs := make([]contract.Run, 0, len(records))
	for _, record := range records {
		_, status, err := r.reader.Get(ctx, record.ID)
		if err != nil {
			return nil, err
		}
		runs = append(runs, r.view(record, status))
	}
	return runs, nil
}

func (r *Runs) view(record run.Record, state run.State) contract.Run {
	view := contract.Run{
		ID:        record.ID,
		Process:   record.Process,
		Agent:     record.Agent,
		State:     string(state),
		CreatedAt: record.CreatedAt,
	}
	result := record.Result
	if state == run.StateAbandoned {
		lost := run.AbandonedResult(record.CreatedAt)
		result = &lost
	}
	if result != nil {
		// The contract mirrors the domain result field for field.
		data, _ := json.Marshal(result)
		view.Result = &contract.Result{}
		_ = json.Unmarshal(data, view.Result)
		if result.Status != run.Completed && record.Turn != nil {
			view.StderrTail = record.Turn.StderrTail
		}
	}
	view.Record, _ = json.Marshal(record)
	return view
}
