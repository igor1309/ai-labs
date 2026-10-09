package main

import (
	"fmt"
	"io"
	"strings"
	"sync"
)

// sourceReporter reports the diagnostics of one source through the writer
// it is given, as an attempt's reporter.
type sourceReporter struct {
	source string
	writer io.Writer
}

// Report writes the diagnostic as one line, `warder: <source-id>:
// <error>`, in a single Write call. A diagnostic that cannot be written
// has nowhere else to go, and is dropped.
func (r sourceReporter) Report(diagnostic error) {
	_, _ = fmt.Fprintf(r.writer, "%s\n", oneLine(fmt.Sprintf("warder: %s: %v", r.source, diagnostic)))
}

// oneLine is text with each run of line breaks, as in what a command wrote
// to its standard error, replaced by a space.
func oneLine(text string) string {
	lines := strings.FieldsFunc(text, func(r rune) bool { return r == '\n' || r == '\r' })
	return strings.Join(lines, " ")
}

// serialWriter passes each Write on to the writer it is given, one at a
// time: the sources' reporters share one, so their lines never overlap.
type serialWriter struct {
	mu     sync.Mutex
	writer io.Writer
}

func (w *serialWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.writer.Write(p)
}
