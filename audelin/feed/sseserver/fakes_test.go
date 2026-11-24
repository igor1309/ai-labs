package sseserver_test

import (
	"bufio"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/sseserver"
)

// stream gives the events sent on its channel; a closed channel is a
// failed source.
type stream struct{ events chan sseserver.Event }

func (s *stream) Next(ctx context.Context) (sseserver.Event, error) {
	select {
	case ev, ok := <-s.events:
		if !ok {
			return sseserver.Event{}, context.Canceled
		}
		return ev, nil
	case <-ctx.Done():
		return sseserver.Event{}, ctx.Err()
	}
}

type opened struct {
	size, overlap time.Duration
	stream        *stream
}

// source hands each opened stream to the test.
type source struct{ opened chan opened }

func newSource() *source { return &source{opened: make(chan opened, 8)} }

func (s *source) Open(size, overlap time.Duration) (sseserver.Stream, error) {
	st := &stream{events: make(chan sseserver.Event)}
	s.opened <- opened{size, overlap, st}
	return st, nil
}

// frames reads SSE frames from a response.
type frames struct{ r *bufio.Reader }

func (f frames) next(t *testing.T) (name, data string, ok bool) {
	t.Helper()
	for {
		line, err := f.r.ReadString('\n')
		if err != nil {
			return "", "", false
		}
		line = strings.TrimSuffix(line, "\n")
		switch {
		case line == "":
			return name, data, true
		case strings.HasPrefix(line, "event: "):
			name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			data = strings.TrimPrefix(line, "data: ")
		}
	}
}

func get(t *testing.T, url string) *http.Response {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}
