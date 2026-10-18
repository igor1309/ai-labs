package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"slices"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// keptRuns is what a continuation asks of runstore: the ids of the runs
// kept, in name order, and the record of a run by its id, its error for a
// run not kept fs.ErrNotExist.
type keptRuns interface {
	Runs() ([]string, error)
	Record(id string) (runstore.Record, error)
}

// continuedWorktree is what a continuation asks of git: a worktree's HEAD
// and its content, by its root.
type continuedWorktree interface {
	Head(ctx context.Context, dir string) (string, error)
	Content(ctx context.Context, dir string) (string, error)
}

// continuation is how a run continues an earlier call's session: the
// session, the id of its latest call, and the text of home's prompt
// "continuation".
type continuation struct {
	session   string
	continues string
	prompt    string
}

// continuationOf is the continuation of the run named run by built, asked
// in the worktree whose root is root (docs/run-implementation.md,
// "Continuation"; ADR-004, rule 5), or why it does not hold, each line:
// built runs one step; the run is kept by kept, a run of one call, and
// that call has a session; the session's latest call ran on built's agent,
// in root, whose HEAD is that call's and whose content, read through
// facts, is the content it recorded, not empty; and the prompt
// "continuation" resolves in docs.
func continuationOf(ctx context.Context, run string, built plan, root string, kept keptRuns, facts continuedWorktree, docs runDocuments) (continuation, []string, error) {
	refuse := func(format string, args ...any) (continuation, []string, error) {
		return continuation{}, []string{fmt.Sprintf(format, args...)}, nil
	}
	if len(built.calls) != 1 {
		return refuse("a continuation runs one step, not %d", len(built.calls))
	}
	var step plannedCall
	for _, planned := range built.calls {
		step = planned
	}
	record, err := kept.Record(run)
	if errors.Is(err, fs.ErrNotExist) {
		return refuse("no run %q is kept", run)
	}
	if err != nil {
		return continuation{}, nil, err
	}
	if len(record.Calls) != 1 {
		return refuse("%q is not a run of one call", run)
	}
	first := record.Calls[0]
	if first.Result.Session == nil || *first.Result.Session == "" {
		return refuse("%q has no session", first.ID)
	}
	session := *first.Result.Session
	latest, err := latestCall(kept, run, first, session)
	if err != nil {
		return continuation{}, nil, err
	}
	if step.agent != latest.Agent {
		return refuse("%q ran on %q", latest.ID, latest.Agent)
	}
	if root != latest.Root {
		return refuse("%q worked in %q", latest.ID, latest.Root)
	}
	head, err := facts.Head(ctx, root)
	if err != nil {
		return continuation{}, nil, err
	}
	if head != latest.Head {
		return refuse("HEAD is %q, not %q's %q", head, latest.ID, latest.Head)
	}
	content, err := facts.Content(ctx, root)
	if err != nil {
		return continuation{}, nil, err
	}
	if latest.Content == "" || content != latest.Content {
		return refuse("the worktree is not as %q left it", latest.ID)
	}
	prompt, problems := docs.Blob(documents.Prompt, "continuation")
	if len(problems) > 0 {
		return refuse("the prompt %q does not resolve: %v", "continuation", documentProblems(problems))
	}
	return continuation{session: session, continues: latest.ID, prompt: string(prompt.Bytes)}, nil, nil
}

// latestCall is the latest call made of session, first the call of the
// run named run that has it: of the runs kept, read newest first, the first
// holding a call of that session not reused, its last such. The runs before
// run's are read only where its call was reused, since none of them is
// later than a call it made; first where no call made is kept.
func latestCall(kept keptRuns, run string, first runstore.Call, session string) (runstore.Call, error) {
	ids, err := kept.Runs()
	if err != nil {
		return runstore.Call{}, err
	}
	for _, id := range slices.Backward(ids) {
		if id <= run && first.Reuses == nil {
			break
		}
		record, err := kept.Record(id)
		if err != nil {
			return runstore.Call{}, err
		}
		for _, made := range slices.Backward(record.Calls) {
			if s := made.Result.Session; s != nil && *s == session && made.Reuses == nil {
				return made, nil
			}
		}
	}
	return first, nil
}

// continued is built, its one step continuing c: its call given c's
// session and the prompt "continuation" as its first document, and
// admitted with no clean worktree asked, the continuation's checks taking
// its place (ADR-004, rule 5).
func continued(built plan, c continuation) plan {
	calls := maps.Clone(built.calls)
	for name, planned := range calls {
		planned.continues = c.continues
		planned.step.Session = c.session
		planned.step.Documents = append([]call.Named{{Name: "continuation", Text: c.prompt}}, planned.step.Documents...)
		planned.admission.Clean = false
		calls[name] = planned
	}
	built.calls = calls
	return built
}
