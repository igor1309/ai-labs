package pages_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/pages"
)

// runsSpy keeps runs by id; failing names the ids whose read fails.
type runsSpy struct {
	runs    map[string]pages.Run
	failing map[string]bool
	read    []string
}

func (s *runsSpy) IDs() ([]string, error) {
	var ids []string
	for id := range s.runs {
		ids = append(ids, id)
	}
	return ids, nil
}

func (s *runsSpy) Run(id string) (pages.Run, error) {
	s.read = append(s.read, id)
	if s.failing[id] {
		return pages.Run{}, errors.New("unreadable")
	}
	r, ok := s.runs[id]
	if !ok {
		return pages.Run{}, pages.ErrNotFound
	}
	return r, nil
}

func keep(runs ...pages.Run) *runsSpy {
	s := &runsSpy{runs: map[string]pages.Run{}, failing: map[string]bool{}}
	for _, r := range runs {
		s.runs[r.ID] = r
	}
	return s
}

func get(t *testing.T, runs pages.Runs, target string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	pages.Handler(runs).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:7465"+target, nil))
	return w
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func ids(list pages.List) []string {
	var got []string
	for _, r := range list.Runs {
		got = append(got, r.ID)
	}
	return got
}

// Scenario: The list is the newest runs first, at most the limit.
func TestListIsNewestFirstAtMostTheLimit(t *testing.T) {
	t.Parallel()
	spy := keep(pages.Run{ID: "20261101T000001Z-a"}, pages.Run{ID: "20261101T000002Z-b"}, pages.Run{ID: "20261101T000003Z-c"})
	list := decode[pages.List](t, get(t, spy, "/api/runs?limit=2"))
	if want := []string{"20261101T000003Z-c", "20261101T000002Z-b"}; !reflect.DeepEqual(ids(list), want) || list.Total != 3 {
		t.Fatalf("got %v of %d, want %v of 3", ids(list), list.Total, want)
	}
	if len(spy.read) != 2 {
		t.Fatalf("read %v, want only the limit's runs", spy.read)
	}
}

// Scenario: A run shows what it was asked and how it ended.
func TestRowShowsWorkflowStatusDurationAndCost(t *testing.T) {
	t.Parallel()
	started := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	ended, ms, usd := started.Add(90*time.Second), int64(90000), 1.5
	spy := keep(pages.Run{ID: "R1", Workflow: "code_review", Started: started, Ended: &ended, Status: "completed", DurationMS: &ms, Cost: &usd,
		Calls: []pages.Call{{Step: "a"}, {Step: "b"}}})
	list := decode[pages.List](t, get(t, spy, "/api/runs"))
	want := pages.Row{ID: "R1", Workflow: "code_review", Started: started, Ended: &ended, Status: "completed", DurationMS: &ms, Cost: &usd, Calls: 2}
	if len(list.Runs) != 1 || !reflect.DeepEqual(list.Runs[0], want) {
		t.Fatalf("got %+v, want %+v", list.Runs, want)
	}
}

// Scenario: A run the port cannot read is left out and counted.
func TestUnreadableRunIsLeftOutAndCounted(t *testing.T) {
	t.Parallel()
	spy := keep(pages.Run{ID: "R1"}, pages.Run{ID: "R2"})
	spy.failing["R1"] = true
	list := decode[pages.List](t, get(t, spy, "/api/runs"))
	if !reflect.DeepEqual(ids(list), []string{"R2"}) || list.Skipped != 1 {
		t.Fatalf("got %v, %d skipped", ids(list), list.Skipped)
	}
}

// Scenario Outline: A bad limit is a bad request.
func TestBadLimitIsABadRequest(t *testing.T) {
	t.Parallel()
	for _, limit := range []string{"0", "x"} {
		if w := get(t, keep(), "/api/runs?limit="+limit); w.Code != http.StatusBadRequest {
			t.Errorf("limit %q: status %d, want 400", limit, w.Code)
		}
	}
}

// Scenario: One run shows its calls and child runs.
func TestOneRunShowsItsCallsAndChildren(t *testing.T) {
	t.Parallel()
	want := pages.Run{ID: "R1", Status: "completed",
		Calls:    []pages.Call{{Step: "implement", Process: "implement", Agent: "codex", Status: "completed"}},
		Children: []pages.Child{{ID: "R1-c", Workflow: "tests_debate", Status: "failed", Class: "runtime_error"}}}
	got := decode[pages.Run](t, get(t, keep(want), "/api/runs/R1"))
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

// Scenario: A run not kept is not found.
func TestRunNotKeptIsNotFound(t *testing.T) {
	t.Parallel()
	if w := get(t, keep(), "/api/runs/R9"); w.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", w.Code)
	}
}

func call(status string, ms int64) pages.Call {
	return pages.Call{Process: "review", Agent: "codex", Status: status, DurationMS: ms}
}

// Scenario: Compare tallies ended calls per process and agent.
func TestCompareTalliesEndedCallsPerProcessAndAgent(t *testing.T) {
	t.Parallel()
	usd := 0.25
	c1 := call("completed", 10000)
	c1.Cost = &usd
	spy := keep(pages.Run{ID: "R1", Status: "completed", Calls: []pages.Call{c1, call("completed", 30000)}},
		pages.Run{ID: "R2", Status: "failed", Calls: []pages.Call{call("failed", 20000)}})
	got := decode[pages.Comparison](t, get(t, spy, "/api/runs/compare"))
	want := []pages.Group{{Process: "review", Agent: "codex", Runs: 3, Completed: 2, PassRate: 2.0 / 3, MedianMS: 20000, TotalCost: 0.25, CostUnknown: 2}}
	if !reflect.DeepEqual(got.Groups, want) {
		t.Fatalf("got %+v, want %+v", got.Groups, want)
	}
}

// Scenario: A call counts by its own status, not its run's.
func TestCompareCountsACallByItsOwnStatus(t *testing.T) {
	t.Parallel()
	spy := keep(pages.Run{ID: "R1", Status: "interrupted", Calls: []pages.Call{call("completed", 10), call("interrupted", 20)}})
	got := decode[pages.Comparison](t, get(t, spy, "/api/runs/compare"))
	if len(got.Groups) != 1 || got.Groups[0].Runs != 1 || got.Groups[0].Completed != 1 {
		t.Fatalf("got %+v, want 1 run, 1 completed", got.Groups)
	}
}

// Scenario: A request addressed to another host is refused.
func TestRequestToAnotherHostIsRefused(t *testing.T) {
	t.Parallel()
	w := httptest.NewRecorder()
	pages.Handler(keep()).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "http://evil.example/api/runs", nil))
	if w.Code != http.StatusForbidden {
		t.Fatalf("status %d, want 403", w.Code)
	}
}

// The page is served at /.
func TestPageIsServed(t *testing.T) {
	t.Parallel()
	if w := get(t, keep(), "/"); w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
}
