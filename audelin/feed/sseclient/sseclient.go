// Package sseclient reads a call's events from the SSE server over the
// wire. It tells apart a server that is not running, a refused request, a
// lost stream and a stream that ended after its last event.
package sseclient

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var (
	// ErrNotRunning says no server answered.
	ErrNotRunning = errors.New("the event source is not running")
	// ErrLost says the stream dropped before its last event.
	ErrLost = errors.New("the event source was lost")
)

// RefusedError carries the server's reason for refusing a request.
type RefusedError struct{ Reason string }

func (e *RefusedError) Error() string { return "the event source refused: " + e.Reason }

// Event is one event as the server sent it.
type Event struct {
	Name string
	Data []byte
}

// Client connects to a server at base, such as http://127.0.0.1:47820.
type Client struct {
	base string
	last string
	http *http.Client
}

// New makes a client of the server at base whose event named last ends a
// stream.
func New(base, last string) *Client {
	return &Client{base: base, last: last, http: &http.Client{Transport: &http.Transport{Proxy: nil}}}
}

// Stream is one connection's events.
type Stream struct {
	body  io.ReadCloser
	r     *bufio.Reader
	last  string
	ended bool
}

// Connect asks for windows of size overlapping by overlap.
func (c *Client) Connect(ctx context.Context, size, overlap time.Duration) (*Stream, error) {
	q := url.Values{}
	q.Set("size", strconv.Itoa(int(size/time.Second)))
	q.Set("overlap", strconv.Itoa(int(overlap/time.Second)))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/events?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNotRunning, err)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		return nil, &RefusedError{Reason: strings.TrimSpace(string(body))}
	}
	return &Stream{body: resp.Body, r: bufio.NewReader(resp.Body), last: c.last}, nil
}

// Next gives the next event; io.EOF after the last, ErrLost if the stream
// drops before it.
func (s *Stream) Next() (Event, error) {
	if s.ended {
		return Event{}, io.EOF
	}
	var ev Event
	var data []string
	for {
		line, err := s.r.ReadString('\n')
		if err != nil {
			s.body.Close()
			return Event{}, fmt.Errorf("%w: %v", ErrLost, err)
		}
		line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
		switch {
		case line == "":
			if ev.Name == "" && data == nil {
				continue
			}
			ev.Data = []byte(strings.Join(data, "\n"))
			if ev.Name == s.last {
				s.ended = true
				s.body.Close()
			}
			return ev, nil
		case strings.HasPrefix(line, "event:"):
			ev.Name = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
}

// Close lets the stream go.
func (s *Stream) Close() error { return s.body.Close() }
