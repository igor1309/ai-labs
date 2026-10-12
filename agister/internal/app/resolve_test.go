package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// unparsable is a text no document parses from, and no schema compiles
// from in these tests.
const unparsable = "\xff"

// failings are the ways a document fails a resolution: the settings lack
// it, or have it with problems.
func failings() map[string]func(docs map[string]string, name string) {
	return map[string]func(docs map[string]string, name string){
		"missing": func(docs map[string]string, name string) { delete(docs, name) },
		"invalid": func(docs map[string]string, name string) { docs[name] = unparsable },
	}
}

// namingEveryKind is a harness whose process p names a document of every
// kind a call resolves, some twice: the verification repo, its prompt and
// the guidance testing, the brief forms goal and step, and the skills
// review and tests, with style its agent's, on a runtime that gives skills.
func namingEveryKind() *harness {
	h := briefed(goalText, ", form: [goal, step]")
	named(h, verification)
	guided(h, []string{"testing"}, map[string]string{"testing": testingPrompt})
	h.defs.docs[document.KindProcess]["p"] = withSkills(h.defs.docs[document.KindProcess]["p"], "review", "tests")
	h.defs.docs[document.KindAgent]["a"] = skilledAgent("a", "style", "review")
	h.defs.docs[document.KindSkill] = map[string]string{"review": skillDoc("review"), "tests": skillDoc("tests"), "style": skillDoc("style")}
	h.runner.identity.Skills = true
	h.validator.compileFor = func(schema []byte) error {
		if string(schema) == unparsable {
			return errors.New("not a schema")
		}
		return nil
	}
	return h
}

// A call's documents are read in one order, and the first that fails,
// missing or invalid, is the last read: the call is refused for it, and no
// later document is asked of the definitions.
func TestACallReadsNoDocumentAfterTheFirstThatFails(t *testing.T) {
	t.Parallel()
	order := []string{
		"service/service", "processes/p", "agents/a", "runtimes/rt", "schemas/s",
		"list verifies", "verifies/repo", "prompts/inspect", "prompts/testing",
		"briefs/goal", "briefs/step", "skills/review", "skills/tests", "skills/style",
	}
	resolve := func(h *harness) error {
		_, err := app.NewResolver(h.defs, h.runtimes, h.validator, resolverCheckStub{}).InspectNode(context.Background(), app.InspectedNode{Name: "p", Process: "p", Agent: "a"})
		return err
	}
	t.Run("none fails", func(t *testing.T) {
		t.Parallel()
		h := namingEveryKind()
		if err := resolve(h); err != nil || !reflect.DeepEqual(h.defs.reads, order) {
			t.Fatalf("reads = %q, %v; want %q", h.defs.reads, err, order)
		}
	})
	for i, read := range order {
		kind, name, isDocument := strings.Cut(read, "/")
		if !isDocument {
			continue
		}
		for failing, fail := range failings() {
			t.Run(read+" "+failing, func(t *testing.T) {
				t.Parallel()
				h := namingEveryKind()
				fail(h.defs.docs[document.Kind(kind)], name)
				err := resolve(h)
				if refusal := (*app.Refusal)(nil); !errors.As(err, &refusal) {
					t.Fatalf("resolution = %v, want a refusal", err)
				}
				if want := order[:i+1]; !reflect.DeepEqual(h.defs.reads, want) {
					t.Fatalf("reads = %q, want %q", h.defs.reads, want)
				}
			})
		}
	}
}

// So are a workflow's: the first of its own document, its brief forms and
// its nodes' processes that fails is the last read, and no node's call is
// resolved. A node's process the settings lack does not fail the read: it
// is a problem of the workflow, found once every process is read.
func TestAWorkflowReadsNoDocumentAfterTheFirstThatFails(t *testing.T) {
	t.Parallel()
	order := []string{
		"list workflows", "workflows/w", "briefs/goal", "briefs/step",
		"processes/first", "processes/second", "processes/joiner",
	}
	formed := func() *flowHarness {
		h := formedFlow(goalText)
		h.defs.docs[document.KindBrief]["step"] = stepForm
		h.defs.docs[document.KindWorkflow]["w"] = strings.Replace(h.defs.docs[document.KindWorkflow]["w"], "form: [goal]", "form: [goal, step]", 1)
		return h
	}
	resolve := func(h *flowHarness) error {
		_, _, err := app.NewResolver(h.defs, nodeRuntimes{runner: h.runner}, okValidator{}, resolverCheckStub{}).InspectWorkflow(context.Background(), "w")
		return err
	}
	t.Run("none fails", func(t *testing.T) {
		t.Parallel()
		h := formed()
		if err := resolve(h); err != nil || len(h.defs.reads) <= len(order) || !reflect.DeepEqual(h.defs.reads[:len(order)], order) {
			t.Fatalf("reads = %q, %v; want %q, then its nodes' calls'", h.defs.reads, err, order)
		}
	})
	for i, read := range order {
		kind, name, isDocument := strings.Cut(read, "/")
		if !isDocument {
			continue
		}
		for failing, fail := range failings() {
			// A workflow the settings do not list is not found, and none of
			// its documents is read; a process they lack does not stop it.
			if failing == "missing" && (kind == string(document.KindWorkflow) || kind == string(document.KindProcess)) {
				continue
			}
			t.Run(read+" "+failing, func(t *testing.T) {
				t.Parallel()
				h := formed()
				fail(h.defs.docs[document.Kind(kind)], name)
				err := resolve(h)
				if refusal := (*app.Refusal)(nil); !errors.As(err, &refusal) {
					t.Fatalf("resolution = %v, want a refusal", err)
				}
				if want := order[:i+1]; !reflect.DeepEqual(h.defs.reads, want) {
					t.Fatalf("reads = %q, want %q", h.defs.reads, want)
				}
			})
		}
	}
}
