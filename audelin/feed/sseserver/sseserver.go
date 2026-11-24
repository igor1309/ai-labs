// Package sseserver serves each connection the events its source gives,
// as server-sent events. It asks its source port with the client's window
// size and overlap and writes what it gives; it decides nothing.
package sseserver

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"
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

	mu     sync.Mutex
	active int
	// idle is closed once the last of one or more streams has ended.
	idle     chan struct{}
	idleOnce sync.Once
}

// NewHandler makes a handler over src.
func NewHandler(src Source) *Handler { return &Handler{src: src, idle: make(chan struct{})} }

// Serve serves src's events on ln until the last client leaves.
func Serve(ln net.Listener, src Source) error {
	h := NewHandler(src)
	srv := &http.Server{Handler: h}
	failed := make(chan error, 1)
	go func() { failed <- srv.Serve(ln) }()
	select {
	case err := <-failed:
		return err
	case <-h.idle:
		return srv.Shutdown(context.Background())
	}
}

func (h *Handler) begin() {
	h.mu.Lock()
	h.active++
	h.mu.Unlock()
}

func (h *Handler) end() {
	h.mu.Lock()
	h.active--
	last := h.active == 0
	h.mu.Unlock()
	if last {
		h.idleOnce.Do(func() { close(h.idle) })
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !loopbackHost(r.Host) {
		http.Error(w, "only a loopback host name is served", http.StatusForbidden)
		return
	}
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
	h.begin()
	defer h.end()
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

// Listen listens on port on this Mac's loopback address only; port 0
// picks a free one.
func Listen(port int) (net.Listener, error) {
	return net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
}

// loopbackHost tells whether a request's Host names this Mac's loopback,
// so a page that rebinds its own name to it cannot read the stream.
func loopbackHost(host string) bool {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
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
