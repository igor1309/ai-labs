// Package jsonl is warder's JSONL publisher: one instance, shared by every
// source loop, writes each complete observation as one JSON line through
// the writer it is given.
package jsonl

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sync"
	"time"
)

// Observation is one successful read of a source: the complete set of
// agents it reported and when the read completed.
type Observation struct {
	Source     string
	ObservedAt time.Time
	Agents     []Agent
}

// Agent is one agent of an observation. Its ID and state are written as
// given; checking them is the capture's job.
type Agent struct {
	ID    string
	State string
}

// RecordWriter receives each record, one complete line per call.
type RecordWriter interface {
	Write(p []byte) (n int, err error)
}

// Publisher serializes observations from concurrent callers: their writes
// never overlap. After a failed write it is broken, and every later
// Publish returns that failure without writing, so a partial line is never
// followed by another record.
type Publisher struct {
	writer RecordWriter

	mu     sync.Mutex
	broken error
}

// New returns a publisher that writes through writer. A nil writer, or a
// nil pointer, map, slice, func or chan carried as one, is missing.
func New(writer RecordWriter) (*Publisher, error) {
	if writer == nil || isNil(reflect.ValueOf(writer)) {
		return nil, errors.New("jsonl: no record writer")
	}
	return &Publisher{writer: writer}, nil
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}

// Publish writes the observation as one line, in a single Write call. A
// write error, or a short write as io.ErrShortWrite, is returned and
// breaks the publisher. An observation that cannot be written is returned
// as an error and writes nothing; a broken publisher returns its failure
// instead.
func (p *Publisher) Publish(observation Observation) error {
	line, encodeErr := encode(observation)

	p.mu.Lock()
	defer p.mu.Unlock()
	if p.broken != nil {
		return p.broken
	}
	if encodeErr != nil {
		return encodeErr
	}
	n, err := p.writer.Write(line)
	if err == nil && n < len(line) {
		err = io.ErrShortWrite
	}
	if err != nil {
		p.broken = fmt.Errorf("jsonl: write record: %w", err)
		return p.broken
	}
	return nil
}

// record is the observation contract on the wire; its fields are written
// in this order.
type record struct {
	Source     string        `json:"source"`
	ObservedAt string        `json:"observedAt"`
	Agents     []agentRecord `json:"agents"`
}

type agentRecord struct {
	ID    string `json:"id"`
	State string `json:"state"`
}

func encode(observation Observation) ([]byte, error) {
	// RFC 3339 has four-digit years only.
	observedAt := observation.ObservedAt.UTC()
	if year := observedAt.Year(); year < 0 || year > 9999 {
		return nil, fmt.Errorf("jsonl: encode record: observedAt %s is outside the years 0 to 9999", observedAt.Format(time.RFC3339))
	}
	// Never nil, so an observation with no agents is written as [].
	agents := make([]agentRecord, 0, len(observation.Agents))
	for _, agent := range observation.Agents {
		agents = append(agents, agentRecord{ID: agent.ID, State: agent.State})
	}
	line, err := json.Marshal(record{
		Source:     observation.Source,
		ObservedAt: observedAt.Format(time.RFC3339),
		Agents:     agents,
	})
	if err != nil {
		return nil, fmt.Errorf("jsonl: encode record: %w", err)
	}
	return append(line, '\n'), nil
}
