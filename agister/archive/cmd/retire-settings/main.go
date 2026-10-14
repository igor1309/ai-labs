// Command retire-settings backs up and removes named settings documents.
// Install preserves home-only documents (ADR-016), so removal is explicit.
package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/composition/install"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	code := run(ctx, os.Args[1:], os.Stdout, os.Stderr, func(home string) retirement {
		return install.Retirer(home, system.Clock{}, nil)
	})
	stop()
	os.Exit(code)
}

// retirement is the command's backed-up settings removal.
type retirement interface {
	Retire(context.Context, string, []app.RetireDocument) (app.Retired, error)
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer, makeRetirement func(string) retirement) int {
	if len(args) < 3 || args[0] == "" || !document.ValidName(args[1]) {
		fmt.Fprintln(stderr, "usage: retire-settings <home> <source> <process:name|workflow:name>...")
		return 1
	}
	var docs []app.RetireDocument
	for _, arg := range args[2:] {
		kind, name, ok := strings.Cut(arg, ":")
		if !ok || !document.ValidName(name) || (kind != "process" && kind != "workflow") {
			fmt.Fprintf(stderr, "retire: invalid document %q\n", arg)
			return 1
		}
		docKind := document.KindProcess
		if kind == "workflow" {
			docKind = document.KindWorkflow
		}
		docs = append(docs, app.RetireDocument{Kind: docKind, Name: name})
	}
	done, err := makeRetirement(args[0]).Retire(ctx, args[1], docs)
	for _, path := range done.Removed {
		fmt.Fprintf(stdout, "retired %s\n", path)
	}
	if err != nil {
		fmt.Fprintf(stderr, "retire: %v\n", err)
		return 1
	}
	if done.Stamp == "" {
		fmt.Fprintln(stdout, "nothing to retire")
		return 0
	}
	fmt.Fprintf(stdout, "backed up as %s; restore with: agister install --restore %s\n", done.Stamp, done.Stamp)
	return 0
}
