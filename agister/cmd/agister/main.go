// Command agister is the composition root (ADR-001, rule 3): it connects
// layout, documents, resolve, check and core to files, git, the runtime
// wrappers and the machine Agister runs on, through the adapters beside
// it, and answers cli's settings from check, its run from resolve and
// core, and its runs from runstore.
package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/files"
	"github.com/igor1309/ai-labs/agister/git"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/runtime/pi"
	"github.com/igor1309/ai-labs/agister/settings/check"
	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
	"github.com/igor1309/ai-labs/agister/supervisor"
	group "github.com/igor1309/ai-labs/gokit/supervisor"
)

func main() {
	os.Exit(run(context.Background(), os.Args[1:], os.Stdout, os.Stderr))
}

// run runs the command args in the working directory, over the user's
// home directory, files, git and the machine, and gives its exit code.
func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	user, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(stderr, "agister:", err)
		return 1
	}
	dir, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(stderr, "agister:", err)
		return 1
	}
	commandLine, err := connect(ctx, user, stdout, stderr)
	if err != nil {
		fmt.Fprintln(stderr, "agister:", err)
		return 1
	}
	return commandLine.Run(args, dir)
}

// connect is the command line build gives over files, git, the runtime
// wrappers over the supervisor, its programs started in gokit's process
// groups and its grace on the wall clock, codex's schemas under the
// system's temporary folder, jsonschema's validator, a worktree's facts of
// git and its holds of files' locks, runs kept by runstore, and the
// machine: Agister's environment, the wall clock, SIGINT, SIGTERM, SIGHUP
// and SIGQUIT, each cancelling a run, and crypto/rand's randomness.
func connect(ctx context.Context, user string, stdout, stderr io.Writer) (*cli.CLI, error) {
	g, err := git.New("git")
	if err != nil {
		return nil, err
	}
	groups, err := newGroupStarter(group.Exec{})
	if err != nil {
		return nil, err
	}
	programs, err := supervisor.New(wallTimer, groups, func(string, int64) {})
	if err != nil {
		return nil, err
	}
	f := files.New()
	fs, err := newLayoutFiles(f)
	if err != nil {
		return nil, err
	}
	roots, err := newWorktreeRoot(ctx, g)
	if err != nil {
		return nil, err
	}
	wrappers, err := newRuntimes(programs, os.TempDir())
	if err != nil {
		return nil, err
	}
	machine := host{ctx: ctx, environ: os.Environ(), clock: wallClock{}, timer: wallTimer, signals: cancellationSignals(), random: rand.Reader}
	inputsFrom := sourcing{texts: f, paths: f, commits: g, changes: g}
	return build(user, f, fs, roots, wrappers, schemaValidator{}, inputsFrom, holding{facts: g, locks: f}, runsAt, machine, stdout, stderr)
}

// runsAt is runstore over folder.
func runsAt(folder string) (homeRuns, error) {
	store, err := runstore.New(folder)
	if err != nil {
		return nil, err
	}
	return store, nil
}

// newRuntimes is the runtime wrappers over programs: bash, claude-code and
// codex each run their turns through it, codex writing its turns' schemas
// under temp; and pi, which runs nothing yet.
func newRuntimes(programs programs, temp string) (runtimes, error) {
	supervising, err := newSupervised(programs)
	if err != nil {
		return runtimes{}, err
	}
	b, err := bash.New(supervising)
	if err != nil {
		return runtimes{}, err
	}
	claudeSupervising, err := newClaudeCodeSupervised(programs)
	if err != nil {
		return runtimes{}, err
	}
	claude, err := claudecode.New(claudeSupervising)
	if err != nil {
		return runtimes{}, err
	}
	codexSupervising, err := newCodexSupervised(programs)
	if err != nil {
		return runtimes{}, err
	}
	cx, err := codex.New(codexSupervising, temp)
	if err != nil {
		return runtimes{}, err
	}
	return runtimes{bash: b, claude: claude, codex: cx, pi: pi.New()}, nil
}

// wallTimer starts wait on the wall clock.
func wallTimer(wait time.Duration) (<-chan time.Time, func()) {
	timer := time.NewTimer(wait)
	return timer.C, func() { timer.Stop() }
}

// wallClock tells the wall clock's time.
type wallClock struct{}

func (wallClock) Now() time.Time { return time.Now() }

// cancellationSignals selects the signals that cancel a run.
func cancellationSignals() signals {
	return notified(os.Interrupt, syscall.SIGTERM, syscall.SIGHUP, syscall.SIGQUIT)
}

// notified watches the process's signals of kinds.
func notified(kinds ...os.Signal) signals {
	return func() (<-chan os.Signal, func()) {
		fired := make(chan os.Signal, 1)
		signal.Notify(fired, kinds...)
		return fired, func() { signal.Stop(fired) }
	}
}

// runtimes are the runtime wrappers the command line runs over: each
// one's facts, and the turns of bash, claude-code and codex.
type runtimes struct {
	bash   bashWrapper
	claude claudeCodeWrapper
	codex  codexWrapper
	pi     piWrapper
}

// bashWrapper is what build asks of the bash wrapper.
type bashWrapper interface {
	bashRuns
	Facts() bash.Facts
}

// claudeCodeWrapper is what build asks of the claude-code wrapper.
type claudeCodeWrapper interface {
	claudeCodeRuns
	Facts() claudecode.Facts
}

// codexWrapper is what build asks of the codex wrapper.
type codexWrapper interface {
	codexRuns
	Facts() codex.Facts
}

// piWrapper is what build asks of the pi wrapper.
type piWrapper interface {
	Facts() pi.Facts
}

// build is the command line over links, fs and roots and every runtime
// wrapper's facts, the turns of runtimes' bash, claude-code and codex, its
// runs on machine, a call's output checked by validator, its inputs read
// through inputsFrom, and the call admitted and held through held's facts
// and locks, its runs kept, and exported, by the store storeAt gives for
// home's "runs", for the user whose home directory is user: home's folder is
// homeFolder's, and the lock files are under lockFolder's. A run's result
// is printed to stdout, and its progress, as it goes, to stderr.
func build(user string, links links, fs layout.FileSystem, roots layout.WorktreeRoot, runtimes runtimes, validator call.Validator, inputsFrom sourcing, held holding, storeAt runStoreAt, machine host, stdout, stderr io.Writer) (*cli.CLI, error) {
	if runtimes.bash == nil || runtimes.claude == nil || runtimes.codex == nil || runtimes.pi == nil {
		return nil, errors.New("build: a runtime wrapper is missing")
	}
	b, claude, cx := runtimes.bash, runtimes.claude, runtimes.codex
	wrappers, err := newContracts(
		claudeCodeFacts(claude), codexFacts(cx), piFacts(runtimes.pi), bashFacts(b))
	if err != nil {
		return nil, err
	}
	bashTurns, err := newBashTurns(b)
	if err != nil {
		return nil, err
	}
	claudeTurns, err := newClaudeCodeTurns(claude)
	if err != nil {
		return nil, err
	}
	codexTurns, err := newCodexTurns(cx)
	if err != nil {
		return nil, err
	}
	bashFacts, claudeFacts, codexFacts := b.Facts(), claude.Facts(), cx.Facts()
	turns := []turn{
		{contract: bashFacts.Contract, inputs: bashInputs(bashFacts.Inputs), runtime: bashTurns},
		{contract: claudeFacts.Contract, inputs: claudeCodeInputs(claudeFacts.Inputs), runtime: claudeTurns},
		{contract: codexFacts.Contract, inputs: codexInputs(codexFacts.Inputs), runtime: codexTurns},
	}
	home := homeFolder(user, machine.environ)
	events, err := newProgress(stderr)
	if err != nil {
		return nil, err
	}
	held.folder = lockFolder(user)
	if storeAt == nil {
		return nil, errors.New("build: no record store")
	}
	store, err := storeAt(filepath.Join(home, "runs"))
	if err != nil {
		return nil, err
	}
	runner, err := newRuns(home, links, fs, roots, wrappers, turns, validator, inputsFrom, held, machine, events, store)
	if err != nil {
		return nil, err
	}
	return newCommandLine(home, links, fs, roots, wrappers, runner, store, stdout, stderr)
}

// homeFolder is home's folder (ADR-002, rule 2): AGISTER_HOME where
// environ sets it, its last value as a child's environment keeps it, else
// the user's ".agister". It is a seam, so other settings are tried while
// the runtimes keep their logins under the user's home directory.
func homeFolder(user string, environ []string) string {
	for _, v := range slices.Backward(environ) {
		if folder, ok := strings.CutPrefix(v, "AGISTER_HOME="); ok {
			if folder != "" {
				return folder
			}
			break
		}
	}
	return filepath.Join(user, ".agister")
}

// newChecker is check over the settings of home's folder and the launch
// directory, read once: every answer of every part comes from the one
// snapshot layout gives.
func newChecker(home, launch string, fs layout.FileSystem, roots layout.WorktreeRoot, wrappers resolve.Wrappers) (*check.Checker, error) {
	read, err := readSettings(home, launch, fs, roots, wrappers)
	if err != nil {
		return nil, err
	}
	resolves, err := newCheckResolve(read.resolver, read.source, read.snapshot.Layers)
	if err != nil {
		return nil, err
	}
	fields, err := newCheckFields(read.documents, read.snapshot.Layers)
	if err != nil {
		return nil, err
	}
	return check.New(names{snapshot: read.snapshot}, resolves, fields)
}

// settingsRead is the settings of home's folder and a launch directory,
// read once: the snapshot layout gives, documents over it, resolve's
// source over both, and resolve over the source.
type settingsRead struct {
	snapshot  layout.Snapshot
	documents *documents.Documents
	source    *source
	resolver  *resolve.Resolver
}

func readSettings(home, launch string, fs layout.FileSystem, roots layout.WorktreeRoot, wrappers resolve.Wrappers) (settingsRead, error) {
	l, err := layout.New(fs, roots)
	if err != nil {
		return settingsRead{}, err
	}
	snapshot := l.Read(home, launch)
	docs := documents.New(documentsSnapshot(snapshot))
	source, err := newSource(docs, snapshot)
	if err != nil {
		return settingsRead{}, err
	}
	resolver, err := resolve.New(source, wrappers)
	if err != nil {
		return settingsRead{}, err
	}
	return settingsRead{snapshot: snapshot, documents: docs, source: source, resolver: resolver}, nil
}
