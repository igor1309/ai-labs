// Command audelin-follow prints a live call's events for a thread, one
// JSON record per line, reading them from the audelin-feed source on this
// Mac. It composes the follow client with the SSE client.
//
//	audelin-follow [-port 47820] [-size 180] [-overlap 60]
//
// It exits 0 after the call's end, 1 when the source was lost, 2 when no
// source is running and 3 when the source refused the request.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strconv"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/followclient"
	"github.com/igor1309/ai-labs/audelin/feed/sseclient"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("audelin-follow", flag.ContinueOnError)
	flags.SetOutput(stderr)
	port := flags.Int("port", 47820, "the source's port on this Mac")
	size := flags.Int("size", 180, "window size in seconds")
	overlap := flags.Int("overlap", 60, "overlap with the window before, in seconds")
	if err := flags.Parse(args); err != nil {
		return 64
	}
	client := sseclient.New("http://127.0.0.1:"+strconv.Itoa(*port), "callEnded")
	stream, err := client.Connect(ctx, time.Duration(*size)*time.Second, time.Duration(*overlap)*time.Second)
	var refused *sseclient.RefusedError
	switch {
	case errors.Is(err, sseclient.ErrNotRunning):
		fmt.Fprintln(stderr, "Following could not start: no call event source is running.")
		return 2
	case errors.As(err, &refused):
		fmt.Fprintln(stderr, "Following was refused: "+refused.Reason)
		return 3
	case err != nil:
		fmt.Fprintln(stderr, "Following could not start: "+err.Error())
		return 2
	}
	defer stream.Close()
	if err := followclient.Follow(ctx, source{stream}, stdout); err != nil {
		return 1
	}
	return 0
}

// source answers the follow client's source port from the SSE stream.
type source struct{ stream *sseclient.Stream }

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

func (s source) Next(context.Context) (followclient.Event, error) {
	ev, err := s.stream.Next()
	if err != nil {
		return followclient.Event{}, err
	}
	switch ev.Name {
	case "noCall":
		return followclient.Event{Kind: followclient.NoCall}, nil
	case "callEnded":
		return followclient.Event{Kind: followclient.CallEnded}, nil
	case "chunk":
		var w wireWindow
		if err := json.Unmarshal(ev.Data, &w); err != nil {
			return followclient.Event{}, fmt.Errorf("a chunk could not be read: %w", err)
		}
		return followclient.Event{Kind: followclient.Chunk, From: seconds(w.From), To: seconds(w.To),
			Context: parts(w.Context), New: parts(w.New)}, nil
	}
	return followclient.Event{}, fmt.Errorf("an unknown event %q came", ev.Name)
}

func parts(ws []wirePart) []followclient.Part {
	var out []followclient.Part
	for _, w := range ws {
		out = append(out, followclient.Part{Speaker: w.Speaker, Start: seconds(w.Start), Words: w.Words})
	}
	return out
}

func seconds(s float64) time.Duration { return time.Duration(s * float64(time.Second)) }
