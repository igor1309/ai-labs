package runtimetest

import (
	"maps"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeclaude"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakecodex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeopencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakepi"
	"github.com/igor1309/ai-labs/gokit/fakebash"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// fakes are the fake runtimes, by the name of the command that starts
// each: the CLI's own name, or the name Binary builds the fake under. With
// them is the bash a setup or verification command runs under.
var fakes = map[string]supervisortest.Fake{
	"bash":         fakebash.Main,
	"claude":       fakeclaude.Main,
	"fakeclaude":   fakeclaude.Main,
	"codex":        fakecodex.Main,
	"fakecodex":    fakecodex.Main,
	"opencode":     fakeopencode.Main,
	"fakeopencode": fakeopencode.Main,
	"pi":           fakepi.Main,
	"fakepi":       fakepi.Main,
}

// InProcess is a supervisor.Starter that starts no process: it runs the
// fake a command names in process, through supervisortest.InProcess. The
// fakes are the functions Binary builds, so Conformance over a built fake
// proves the protocol a test over InProcess relies on.
//
// The fake is picked by the command: one of Fakes by the command as given
// or by its base name, else the fake runtime of that base name (claude,
// codex, opencode, pi, or fake<name>, as Binary's paths end) or, for bash,
// the fake shell (fakebash). A command that names none fails to start, as
// a program missing from PATH does.
type InProcess struct {
	// Env is the environment every fake inherits, as "KEY=value"; a
	// command's own Env replaces a variable of the same name. The test
	// process's environment is never read.
	Env []string
	// Fakes are the test's own programs, by command.
	Fakes map[string]supervisortest.Fake
	// Reports, when set, receives each fake's start and the points it then
	// reports, as supervisortest.InProcess's do.
	Reports chan<- supervisortest.Report
}

func (i InProcess) Start(c supervisor.Command) (supervisor.Process, error) {
	all := maps.Clone(fakes)
	maps.Copy(all, i.Fakes)
	return supervisortest.InProcess{Env: i.Env, Fakes: all, Reports: i.Reports}.Start(c)
}
