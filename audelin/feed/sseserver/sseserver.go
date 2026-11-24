// Package sseserver serves each connection the events its source gives,
// as server-sent events. It asks its source port with the client's window
// size and overlap and writes what it gives; it decides nothing.
package sseserver

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// Event is one event to send: its name, its data as JSON, and whether it
// is the stream's last.
type Event struct {
	Name string
	Data []byte
	Last bool
}

// Stream gives one connection's events in turn.
type Stream interface {
	Next(ctx context.Context) (Event, error)
}

// Source opens a stream for one connection.
type Source interface {
	Open(size, overlap time.Duration) (Stream, error)
}

// Handler serves the events of streams src opens.
type Handler struct {
	src Source
}

// NewHandler makes a handler over src.
func NewHandler(src Source) *Handler { return &Handler{src: src} }

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	size, overlap, reason := windows(r)
	if reason != "" {
		http.Error(w, reason, http.StatusBadRequest)
		return
	}
	stream, err := h.src.Open(size, overlap)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming is not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	for {
		ev, err := stream.Next(r.Context())
		if err != nil {
			return
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Name, ev.Data); err != nil {
			return
		}
		flusher.Flush()
		if ev.Last {
			return
		}
	}
}

// windows reads the request's size and overlap, in whole seconds, or says
// what was wrong with them.
func windows(r *http.Request) (size, overlap time.Duration, reason string) {
	q := r.URL.Query()
	s, err := strconv.Atoi(q.Get("size"))
	if err != nil || s <= 0 {
		return 0, 0, "size must be a whole number of seconds above zero"
	}
	o := 0
	if q.Has("overlap") {
		o, err = strconv.Atoi(q.Get("overlap"))
		if err != nil || o < 0 || o >= s {
			return 0, 0, "overlap must be a whole number of seconds from zero to below size"
		}
	}
	return time.Duration(s) * time.Second, time.Duration(o) * time.Second, ""
}
