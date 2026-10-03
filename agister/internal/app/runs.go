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
	reader    RunsReader
	appends   RunsAppends
	canceller RunsCanceller
	timer     RunsTimer
	// How often Observe polls a running record another process writes.
	pollInterval time.Duration
}

// RunsTimer starts the wait between two of Observe's reads of a running
// record another process writes: the next read is due when fired
// delivers. stop releases the wait.
type RunsTimer func(wait time.Duration) (fired <-chan time.Time, stop func())

// RunsReader reads evidence. A record that is not finished and no longer
// owned reads as abandoned.
type RunsReader interface {
	Get(ctx context.Context, id string) (run.Record, run.State, error)
	Events(ctx context.Context, id string, afterSeq int) ([]run.Event, run.State, error)
	List(ctx context.Context) ([]run.Record, error)
	// RunDir is the directory run id's record and artifacts are kept in.
	RunDir(id string) string
}

// RunsAppends says when a run this process writes has more to read.
type RunsAppends interface {
	// Appended returns a channel closed once run id has an event after
	// afterSeq or has ended, closed already if that is so when asked, so an
	// event appended between a read and the ask is not missed. ok is false
	// when this process does not write the run: there is no notification,
	// and the run is polled.
	Appended(ctx context.Context, id string, afterSeq int) (appended <-chan struct{}, ok bool)
}

// RunsCanceller cancels a call running in this process (Hosted is one). It
// reports whether the call was running here and the cancel took effect.
type RunsCanceller interface {
	Cancel(id string) bool
}

// RunsAdapters are what Runs run on besides the calls hosted here.
type RunsAdapters struct {
	Reader RunsReader
	// Appends wakes Observe when a run this process writes has more to
	// read.
	Appends RunsAppends
	// Timer starts Observe's wait between two reads of a running record
	// another process writes.
	Timer RunsTimer
}

// NewRuns returns the use case that reads evidence and cancels the calls
// hosted in this process. Observe reads a running record this process
// writes again once appends says it has more; one another process writes
// it reads again after waiting on timer for pollInterval, zero meaning
// 50ms.
func NewRuns(reader RunsReader, appends RunsAppends, canceller RunsCanceller, timer RunsTimer, pollInterval time.Duration) *Runs {
	return &Runs{reader: reader, appends: appends, canceller: canceller, timer: timer, pollInterval: pollInterval}
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
		if err := r.next(ctx, id, afterSeq, interval); err != nil {
			return err
		}
	}
}

// next waits until the running record has more to read: for a run this
// process writes, until it appends an event after afterSeq or ends; for
// one another process writes, for interval on the timer. Either wait ends
// early if ctx does.
func (r *Runs) next(ctx context.Context, id string, afterSeq int, interval time.Duration) error {
	if appended, ok := r.appends.Appended(ctx, id, afterSeq); ok {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-appended:
			return nil
		}
	}
	return r.wait(ctx, interval)
}

// wait waits on the timer for interval, or until ctx ends.
func (r *Runs) wait(ctx context.Context, interval time.Duration) error {
	fired, stop := r.timer(interval)
	defer stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-fired:
		return nil
	}
}

func (r *Runs) Cancel(_ context.Context, id string) error {
	if !r.canceller.Cancel(id) {
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
		Dir:       r.reader.RunDir(record.ID),
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
