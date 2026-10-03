// Package fakeproc is the process a fake program runs as. A fake is a
// function of it, so the program built from the fake (Run) and the fake
// run in process (supervisortest.InProcess) are the same code.
package fakeproc

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Process is what a fake is given in place of its program's own
// process: where it runs, what it was started with, and its streams.
type Process struct {
	// Context ends when the process's group is signalled. A built fake's
	// never ends: the signal ends the program.
	Context context.Context
	// Dir is its working directory.
	Dir string
	// Args are its arguments, without the program's name.
	Args []string
	// Getenv reads its environment.
	Getenv func(string) string
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
	// Report tells whoever started the fake in process of a point it has
	// reached; a built fake's reports go nowhere.
	Report func(point string)
}

// Path is name as the process opens it: under its working directory,
// unless it is absolute.
func (p Process) Path(name string) string {
	if filepath.IsAbs(name) {
		return name
	}
	return filepath.Join(p.Dir, name)
}

// Block never returns by itself: it reports "blocked" and waits until the
// process is ended, as a runtime that hangs does. Only a signal ends it.
func (p Process) Block() int {
	p.Report("blocked")
	<-p.Context.Done()
	return 1
}

// Run runs fake as the program built from it, on the program's own process,
// and exits with the code it returns.
func Run(fake func(Process) int) {
	dir, _ := os.Getwd()
	// A fake blocked until a signal ends the program waits on a context
	// that never ends; the pending timer keeps the Go runtime from taking
	// that for a deadlock.
	go func() {
		for {
			time.Sleep(time.Hour)
		}
	}()
	os.Exit(fake(Process{
		Context: context.Background(),
		Dir:     dir,
		Args:    os.Args[1:],
		Getenv:  os.Getenv,
		Stdin:   os.Stdin,
		Stdout:  os.Stdout,
		Stderr:  os.Stderr,
		Report:  func(string) {},
	}))
}
