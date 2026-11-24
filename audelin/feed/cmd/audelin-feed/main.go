// Command audelin-feed serves the live call's events on this Mac's
// loopback, as server-sent events, to each client that asks. It composes
// the call reader, the call events iterator, the clock and the SSE server,
// and ends after its last client leaves.
//
//	audelin-feed -calls <calls folder> [-port 47820]
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
	"github.com/igor1309/ai-labs/audelin/feed/callreader"
	"github.com/igor1309/ai-labs/audelin/feed/sseserver"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stderr))
}

func run(args []string, stderr io.Writer) int {
	flags := flag.NewFlagSet("audelin-feed", flag.ContinueOnError)
	flags.SetOutput(stderr)
	calls := flags.String("calls", "", "the calls folder Audelin records into")
	port := flags.Int("port", 47820, "the port to serve on this Mac's loopback")
	if err := flags.Parse(args); err != nil {
		return 64
	}
	if *calls == "" {
		fmt.Fprintln(stderr, "audelin-feed: -calls names the calls folder")
		return 64
	}
	ln, err := sseserver.Listen(*port)
	if err != nil {
		fmt.Fprintln(stderr, "audelin-feed: "+err.Error())
		return 1
	}
	if err := serve(ln, *calls, time.Local, realClock{}); err != nil {
		fmt.Fprintln(stderr, "audelin-feed: "+err.Error())
		return 1
	}
	return 0
}

// serve serves the events of the calls folder dir, whose folder names
// tell times in loc, on ln, timed by clock.
func serve(ln net.Listener, dir string, loc *time.Location, clock callevents.Clock) error {
	return sseserver.Serve(ln, source{dir: dir, loc: loc, clock: clock})
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

func (realClock) Wait(ctx context.Context, t time.Time) error {
	timer := time.NewTimer(time.Until(t))
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// source opens, for each client, its own reader and iterator.
type source struct {
	dir   string
	loc   *time.Location
	clock callevents.Clock
}

func (s source) Open(size, overlap time.Duration) (sseserver.Stream, error) {
	events, err := callevents.New(liveCall{callreader.New(s.dir, s.loc)}, s.clock, size, overlap)
	if err != nil {
		return nil, err
	}
	return stream{events}, nil
}

// liveCall answers the iterator's live call port from the call reader.
type liveCall struct{ reader *callreader.Reader }

func (l liveCall) Live() (callevents.Call, bool, error) {
	call, ok, err := l.reader.Live()
	if err != nil || !ok {
		return callevents.Call{}, ok, err
	}
	parts := make([]callevents.Part, len(call.Parts))
	for i, p := range call.Parts {
		parts[i] = callevents.Part{ID: p.ID, Side: p.Speaker, Start: p.Start, Words: p.Words}
	}
	return callevents.Call{ID: call.ID, Start: call.Start, Parts: parts, Ended: call.Ended}, true, nil
}

// stream answers the SSE server's stream port from the iterator.
type stream struct{ events *callevents.Events }

type wirePart struct {
	Speaker string  `json:"speaker"`
	Start   float64 `json:"start"`
	Words   string  `json:"words"`
}

type wireWindow struct {
	From    float64    `json:"from"`
	To      float64    `json:"to"`
	Context []wirePart `json:"context"`
	New     []wirePart `json:"new"`
}

func (s stream) Next(ctx context.Context) (sseserver.Event, error) {
	ev, err := s.events.Next(ctx)
	if err != nil {
		return sseserver.Event{}, err
	}
	switch ev.Kind {
	case callevents.NoCall:
		return sseserver.Event{Name: "noCall", Data: []byte("{}")}, nil
	case callevents.CallEnded:
		return sseserver.Event{Name: "callEnded", Data: []byte("{}"), Last: true}, nil
	}
	w := ev.Window
	data, err := json.Marshal(wireWindow{From: w.From.Seconds(), To: w.To.Seconds(), Context: wire(w.Context), New: wire(w.New)})
	if err != nil {
		return sseserver.Event{}, err
	}
	return sseserver.Event{Name: "chunk", Data: data}, nil
}

func wire(parts []callevents.Part) []wirePart {
	out := make([]wirePart, len(parts))
	for i, p := range parts {
		out[i] = wirePart{Speaker: p.Side, Start: p.Start.Seconds(), Words: p.Words}
	}
	return out
}
