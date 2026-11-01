package resolve_test

import (
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// continuing is the step name of the process of its name on agent,
// continuing the session of the step of, its reference on line of w's
// file, at place.
func continuing(name, agent, of string, line int, place string) resolve.Item {
	item := step(name, name, agent)
	reads := session(of)
	reads.Origin = resolve.Origin{Path: homeW, Line: line, Place: place}
	item.Session = &reads
	return item
}

// session.feature, "A session stays on its agent"; and, on its agent, it
// resolves.
func TestASessionStaysOnItsAgent(t *testing.T) {
	t.Parallel()
	for name, agent := range map[string]string{"its agent": "a1", "another agent": "a2"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := withSteps(newSource(), step("d", "d", agent), continuing("s", "a1", "d", 6, "steps[1].session"))
			s.pair("a1", "r")
			s.pair("a2", "r")
			if agent == "a1" {
				_, faults := newResolver(t, s).Resolve(requestW)
				assertResolved(t, faults)
				return
			}
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w",
				problemOfW(6, "steps[1].session", `the step "d" runs on another agent, "a2"`))
		})
	}
}

// session.feature, "Two steps of a parallel do not continue one session",
// each followed back to the first step of its session; and two steps of
// a parallel continuing two sessions resolve.
func TestTwoStepsOfAParallelDoNotContinueOneSession(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		reads   string
		problem string
	}{
		{"d", `the step "x" beside it continues the session of "d"`},
		{"e", `the step "x" beside it continues the session of "d"`},
		{"f", ""},
	} {
		t.Run("steps."+c.reads+".session", func(t *testing.T) {
			t.Parallel()
			s := withSteps(newSource(),
				step("d", "d", "a"),
				continuing("e", "a", "d", 5, "steps[1].session"),
				step("f", "f", "a"),
				resolve.Item{Name: "p", Parallel: []resolve.Item{
					continuing("x", "a", "d", 7, "steps[3].parallel[0].session"),
					continuing("y", "a", c.reads, 8, "steps[3].parallel[1].session"),
				}},
			)
			if c.problem == "" {
				_, faults := newResolver(t, s).Resolve(requestW)
				assertResolved(t, faults)
				return
			}
			assertProblemsOf(t, s, requestW, resolve.KindWorkflow, "w", problemOfW(8, "steps[3].parallel[1].session", c.problem))
		})
	}
}
