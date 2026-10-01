package pages

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Run summaries: what the page shows of each run under <agister home>/runs,
// read from its record.json and events.jsonl. Nothing here writes.

// Limits of a run list.
const (
	DefaultRunLimit = 200
	MaxRunLimit     = 1000
)

// RunSummary is one run as the page shows it.
type RunSummary struct {
	ID         string     `json:"id"`
	Process    string     `json:"process"`
	Agent      string     `json:"agent,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
	// Status is the result's; without one, running while the run's owner
	// holds it and lost once it does not.
	Status      string       `json:"status"`
	Implementor *Implementor `json:"implementor,omitempty"`
	Policy      *RunPolicy   `json:"policy,omitempty"`
	Outcome     Outcome      `json:"outcome"`
	// Parent is the workflow run a node's run belongs to.
	Parent   string           `json:"parent,omitempty"`
	Workflow *WorkflowSummary `json:"workflow,omitempty"`
	// Skills and ToolCalls come from the events; unset when they could
	// not be read.
	Skills    []SkillUse `json:"skills,omitempty"`
	ToolCalls *int       `json:"tool_calls,omitempty"`
}

// Implementor is who did a call's work: the runtime, and the model and
// effort the call ran as.
type Implementor struct {
	Adapter string `json:"adapter,omitempty"`
	Version string `json:"version,omitempty"`
	// Model is the recorded profile's, else what the runtime reported.
	Model         string `json:"model,omitempty"`
	ReportedModel string `json:"reported_model,omitempty"`
	// Effort is the recorded profile's; empty when the record has none.
	Effort string `json:"effort,omitempty"`
}

// RunPolicy is the limits a call ran under.
type RunPolicy struct {
	TimeoutMS  int64    `json:"timeout_ms"`
	MaxCostUSD *float64 `json:"max_cost_usd,omitempty"`
	Access     string   `json:"access,omitempty"`
	Scope      string   `json:"scope,omitempty"`
}

// Outcome is how a run went: verification, timing and cost.
type Outcome struct {
	// Verify is unset when the process has no verify.
	Verify     *VerifyOutcome `json:"verify,omitempty"`
	WallMS     *int64         `json:"wall_ms,omitempty"`
	TurnMS     *int64         `json:"turn_ms,omitempty"`
	RuntimeMS  *int64         `json:"runtime_ms,omitempty"`
	CostUSD    *float64       `json:"cost_usd,omitempty"`
	CostSource string         `json:"cost_source,omitempty"`
}

// VerifyOutcome is the verify attempts a call used and whether the last
// one passed.
type VerifyOutcome struct {
	Attempts int  `json:"attempts"`
	Passed   bool `json:"passed"`
}

// WorkflowSummary is a workflow run's nodes and, when its output has judge
// items, their counts.
type WorkflowSummary struct {
	Nodes []NodeSummary `json:"nodes"`
	Items *ItemCounts   `json:"items,omitempty"`
}

// NodeSummary is one node of a workflow run.
type NodeSummary struct {
	Name    string `json:"name"`
	Process string `json:"process"`
	Join    bool   `json:"join,omitempty"`
	Run     string `json:"run,omitempty"`
	Status  string `json:"status,omitempty"`
}

// ItemCounts counts a judge's items by ruling and by severity, and per
// source node the items it contributed to by ruling.
type ItemCounts struct {
	Total      int            `json:"total"`
	ByRuling   map[string]int `json:"by_ruling"`
	BySeverity map[string]int `json:"by_severity"`
	BySource   []SourceCount  `json:"by_source"`
}

// SourceCount is one source node's share of the items: Source is the
// <source> of the items' "<source>#<n>" sources, its 1-based number among
// the nodes that are not the join; Node and Run are that node's, when
// there is one.
type SourceCount struct {
	Source   int            `json:"source"`
	Node     string         `json:"node,omitempty"`
	Run      string         `json:"run,omitempty"`
	ByRuling map[string]int `json:"by_ruling"`
}

// SkillUse is a skill a call used and how often.
type SkillUse struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// RunList is the newest runs, at most a limit; Skipped counts the runs
// whose record did not parse.
type RunList struct {
	Runs    []RunSummary `json:"runs"`
	Total   int          `json:"total"`
	Skipped int          `json:"skipped"`
}

// RunDetail is one run's summary and its record as stored.
type RunDetail struct {
	Summary RunSummary      `json:"summary"`
	Record  json.RawMessage `json:"record"`
}

// RunObserver reads a run as the run store sees it: its record and its
// state, abandoned when it never finished and no process owns it any more.
type RunObserver interface {
	Get(ctx context.Context, id string) (run.Record, run.State, error)
}

// ListRuns summarises the runs under dir, newest first, at most limit;
// runs tells which unfinished runs are still owned.
func ListRuns(ctx context.Context, dir string, runs RunObserver, limit int) (RunList, error) {
	if limit < 1 {
		return RunList{}, badRequest("limit must be a positive number")
	}
	limit = min(limit, MaxRunLimit)
	records, skipped, err := readRecords(dir)
	if err != nil {
		return RunList{}, err
	}
	list := RunList{Runs: []RunSummary{}, Total: len(records), Skipped: skipped}
	sort.Slice(records, func(i, j int) bool {
		a, b := records[i].Record, records[j].Record
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.After(b.CreatedAt)
		}
		return a.ID > b.ID
	})
	for _, stored := range records[:min(limit, len(records))] {
		summary := summarise(observe(ctx, runs, stored.dir, stored.Record))
		addEvents(&summary, filepath.Join(dir, stored.dir, "events.jsonl"))
		list.Runs = append(list.Runs, summary)
	}
	return list, nil
}

// runID is a plain run directory name, as the run store makes them.
var runID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]*$`)

// ReadRun is the summary and record of the run id under dir; runs tells
// whether an unfinished run is still owned.
func ReadRun(ctx context.Context, dir string, runs RunObserver, id string) (RunDetail, error) {
	if !runID.MatchString(id) {
		return RunDetail{}, badRequest(fmt.Sprintf("%q is not a run ID", id))
	}
	data, record, err := readRecord(dir, id)
	if err != nil {
		return RunDetail{}, err
	}
	observed, state := observe(ctx, runs, id, record)
	if record.Result == nil && observed.Result != nil {
		// It finished after the first read: the record as it now stands.
		if latest, latestRecord, err := readRecord(dir, id); err == nil && latestRecord.Result != nil {
			data, observed = latest, latestRecord
		}
	}
	summary := summarise(observed, state)
	addEvents(&summary, filepath.Join(dir, id, "events.jsonl"))
	return RunDetail{Summary: summary, Record: json.RawMessage(data)}, nil
}

// readRecord is the run id's record.json under dir, as stored and parsed.
func readRecord(dir, id string) ([]byte, run.Record, error) {
	var record run.Record
	data, err := os.ReadFile(filepath.Join(dir, id, "record.json"))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, record, notFound("no run " + id)
	}
	if err != nil {
		return nil, record, err
	}
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, record, fmt.Errorf("run %s: record does not parse: %w", id, err)
	}
	return data, record, nil
}

// observe is the run id's record and state, from runs when record, as
// read, has no result: abandoned when no process owns the run any more,
// finished with the store's newer record when it finished since. When the
// store cannot tell, the run is running.
func observe(ctx context.Context, runs RunObserver, id string, record run.Record) (run.Record, run.State) {
	if record.Result != nil {
		return record, run.StateFinished
	}
	latest, state, err := runs.Get(ctx, id)
	switch {
	case err != nil:
		return record, run.StateRunning
	case state == run.StateFinished && latest.Result != nil:
		if latest.ID == "" {
			latest.ID = record.ID
		}
		return latest, state
	case state == run.StateAbandoned:
		return record, state
	}
	return record, run.StateRunning
}

// summarise is Summarise of a record observed in state: an abandoned run
// reads as lost (ADR-001 rule 11).
func summarise(record run.Record, state run.State) RunSummary {
	summary := Summarise(record)
	if state == run.StateAbandoned {
		summary.Status = string(run.Lost)
	}
	return summary
}

// storedRecord is a run's record and the directory it was read from.
type storedRecord struct {
	run.Record
	dir string
}

// readRecords reads every run's record under dir; a missing dir has none.
func readRecords(dir string) ([]storedRecord, int, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	var records []storedRecord
	skipped := 0
	for _, entry := range entries {
		if !entry.IsDir() || !runID.MatchString(entry.Name()) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name(), "record.json"))
		if errors.Is(err, fs.ErrNotExist) {
			continue // not a run, or one not yet written
		}
		var record run.Record
		if err != nil || json.Unmarshal(data, &record) != nil {
			skipped++
			continue
		}
		if record.ID == "" {
			record.ID = entry.Name()
		}
		records = append(records, storedRecord{record, entry.Name()})
	}
	return records, skipped, nil
}

// Summarise is what a record says of its run; the events add the rest.
func Summarise(record run.Record) RunSummary {
	summary := RunSummary{
		ID: record.ID, Process: record.Process, Agent: record.Agent,
		CreatedAt: record.CreatedAt, FinishedAt: record.FinishedAt, Status: "running",
	}
	if record.Result != nil {
		summary.Status = string(record.Result.Status)
	}
	if record.Runtime != nil || record.Profile != nil || record.Turn != nil {
		implementor := &Implementor{}
		if record.Runtime != nil {
			implementor.Adapter, implementor.Version = record.Runtime.Adapter, record.Runtime.Version
		}
		if record.Turn != nil {
			implementor.ReportedModel = record.Turn.Model
		}
		implementor.Model = implementor.ReportedModel
		if record.Profile != nil {
			implementor.Effort = record.Profile.Effort
			if record.Profile.Model != "" {
				implementor.Model = record.Profile.Model
			}
		}
		summary.Implementor = implementor
	}
	if effective := record.Effective; effective != nil {
		summary.Policy = &RunPolicy{
			TimeoutMS: effective.Timeout.Milliseconds(), MaxCostUSD: effective.MaxCostUSD,
			Access: effective.Access, Scope: effective.Scope,
		}
	}
	if record.Verify != nil || len(record.Attempts) > 0 {
		verify := &VerifyOutcome{Attempts: len(record.Attempts)}
		if n := len(record.Attempts); n > 0 {
			last := record.Attempts[n-1].Run
			verify.Passed = last != nil && last.Passed
		}
		summary.Outcome.Verify = verify
	}
	if result := record.Result; result != nil {
		wall := result.Timing.WallMS
		summary.Outcome.WallMS = &wall
		summary.Outcome.TurnMS = result.Timing.TurnMS
		summary.Outcome.RuntimeMS = result.Timing.RuntimeMS
		summary.Outcome.CostUSD = result.Cost.USD
		summary.Outcome.CostSource = result.Cost.Source
	}
	if record.Parent != nil {
		summary.Parent = record.Parent.Run
	}
	if record.Workflow != nil {
		summary.Workflow = summariseWorkflow(record)
	}
	return summary
}

func summariseWorkflow(record run.Record) *WorkflowSummary {
	workflow := &WorkflowSummary{Nodes: []NodeSummary{}}
	var sources []run.Node // the nodes that are not the join, as items' sources number them
	for _, node := range record.Workflow.Nodes {
		workflow.Nodes = append(workflow.Nodes, NodeSummary{
			Name: node.Name, Process: node.Process, Join: node.Join, Run: node.Run, Status: string(node.Status),
		})
		if !node.Join {
			sources = append(sources, node)
		}
	}
	if record.Result == nil || len(record.Result.Output) == 0 {
		return workflow
	}
	var output struct {
		Items []struct {
			Ruling   string   `json:"ruling"`
			Severity string   `json:"severity"`
			Sources  []string `json:"sources"`
		} `json:"items"`
	}
	if json.Unmarshal(record.Result.Output, &output) != nil || output.Items == nil {
		return workflow
	}
	counts := &ItemCounts{Total: len(output.Items), ByRuling: map[string]int{}, BySeverity: map[string]int{}, BySource: []SourceCount{}}
	bySource := map[int]map[string]int{}
	for _, item := range output.Items {
		counts.ByRuling[item.Ruling]++
		counts.BySeverity[item.Severity]++
		// An item counts once for each node it draws on, however many of
		// that node's entries it merges.
		seen := map[int]bool{}
		for _, source := range item.Sources {
			node, _, _ := strings.Cut(source, "#")
			n, err := strconv.Atoi(strings.TrimSpace(node))
			if err != nil || n < 1 || seen[n] {
				continue
			}
			seen[n] = true
			if bySource[n] == nil {
				bySource[n] = map[string]int{}
			}
			bySource[n][item.Ruling]++
		}
	}
	numbers := make([]int, 0, len(bySource))
	for n := range bySource {
		numbers = append(numbers, n)
	}
	sort.Ints(numbers)
	for _, n := range numbers {
		count := SourceCount{Source: n, ByRuling: bySource[n]}
		if n <= len(sources) {
			count.Node, count.Run = sources[n-1].Name, sources[n-1].Run
		}
		counts.BySource = append(counts.BySource, count)
	}
	workflow.Items = counts
	return workflow
}

// A read of a SKILL.md names the skill by its directory.
var skillRead = regexp.MustCompile(`([^\s/"'\\]+)/SKILL\.md`)

// A Skill call's input, possibly cut short in the event.
var skillInput = regexp.MustCompile(`"skill"\s*:\s*"([^"\\]+)"`)

// addEvents adds the skills a run used and its tool calls, from its events
// at path; when they cannot be read, the summary is left as it is.
func addEvents(summary *RunSummary, path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()
	calls := 0
	used := map[string]int{}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		var event run.Event
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			break // a torn final line from a crashed writer
		}
		if event.Kind != "TOOL_REQUESTED" {
			continue
		}
		calls++
		for _, skill := range skillsOf(event.Data) {
			used[skill]++
		}
	}
	if scanner.Err() != nil {
		return
	}
	summary.ToolCalls = &calls
	for name, count := range used {
		summary.Skills = append(summary.Skills, SkillUse{Name: name, Count: count})
	}
	sort.Slice(summary.Skills, func(i, j int) bool {
		a, b := summary.Skills[i], summary.Skills[j]
		if a.Count != b.Count {
			return a.Count > b.Count
		}
		return a.Name < b.Name
	})
}

// skillsOf is the skills one tool request used: a Skill call's skill, or
// the skills whose SKILL.md its input reads.
func skillsOf(data map[string]any) []string {
	input, ok := data["input"].(string)
	if !ok {
		raw, _ := json.Marshal(data["input"])
		input = string(raw)
	}
	if data["name"] == "Skill" {
		var given struct {
			Skill string `json:"skill"`
		}
		if json.Unmarshal([]byte(input), &given) == nil && given.Skill != "" {
			return []string{given.Skill}
		}
		if match := skillInput.FindStringSubmatch(input); match != nil {
			return []string{match[1]}
		}
		return nil
	}
	var skills []string
	seen := map[string]bool{}
	for _, match := range skillRead.FindAllStringSubmatch(input, -1) {
		if !seen[match[1]] {
			seen[match[1]] = true
			skills = append(skills, match[1])
		}
	}
	return skills
}

// Comparison is how completed and failed calls went, grouped by process,
// then by runtime adapter, model and effort.
type Comparison struct {
	Groups  []CompareGroup `json:"groups"`
	Skipped int            `json:"skipped"`
}

// CompareGroup is one process's calls on one configuration.
type CompareGroup struct {
	Process   string  `json:"process"`
	Adapter   string  `json:"adapter"`
	Model     string  `json:"model"`
	Effort    string  `json:"effort"`
	Runs      int     `json:"runs"`
	Completed int     `json:"completed"`
	PassRate  float64 `json:"pass_rate"` // completed over runs
	// MeanVerifyAttempts is over the runs with verify; unset when none had.
	MeanVerifyAttempts *float64 `json:"mean_verify_attempts,omitempty"`
	MedianWallMS       *float64 `json:"median_wall_ms,omitempty"`
	// TotalCostUSD adds up the runs with a known cost; CostUnknown counts
	// the others.
	TotalCostUSD        float64  `json:"total_cost_usd"`
	CostUnknown         int      `json:"cost_unknown"`
	CostPerCompletedUSD *float64 `json:"cost_per_completed_usd,omitempty"`
}

// Compare groups the completed and failed calls under dir.
func Compare(dir string) (Comparison, error) {
	records, skipped, err := readRecords(dir)
	if err != nil {
		return Comparison{}, err
	}
	type key struct{ process, adapter, model, effort string }
	type tally struct {
		group    CompareGroup
		attempts []int
		walls    []int64
	}
	groups := map[key]*tally{}
	for _, stored := range records {
		summary := Summarise(stored.Record)
		if summary.Workflow != nil || (summary.Status != string(run.Completed) && summary.Status != string(run.Failed)) {
			continue
		}
		var k key
		k.process = summary.Process
		if implementor := summary.Implementor; implementor != nil {
			k.adapter, k.model, k.effort = implementor.Adapter, implementor.Model, implementor.Effort
		}
		t := groups[k]
		if t == nil {
			t = &tally{group: CompareGroup{Process: k.process, Adapter: k.adapter, Model: k.model, Effort: k.effort}}
			groups[k] = t
		}
		t.group.Runs++
		if summary.Status == string(run.Completed) {
			t.group.Completed++
		}
		if verify := summary.Outcome.Verify; verify != nil {
			t.attempts = append(t.attempts, verify.Attempts)
		}
		if wall := summary.Outcome.WallMS; wall != nil {
			t.walls = append(t.walls, *wall)
		}
		if cost := summary.Outcome.CostUSD; cost != nil {
			t.group.TotalCostUSD += *cost
		} else {
			t.group.CostUnknown++
		}
	}
	comparison := Comparison{Groups: []CompareGroup{}, Skipped: skipped}
	for _, t := range groups {
		group := t.group
		group.PassRate = float64(group.Completed) / float64(group.Runs)
		if len(t.attempts) > 0 {
			sum := 0
			for _, n := range t.attempts {
				sum += n
			}
			mean := float64(sum) / float64(len(t.attempts))
			group.MeanVerifyAttempts = &mean
		}
		if len(t.walls) > 0 {
			median := median(t.walls)
			group.MedianWallMS = &median
		}
		if group.Completed > 0 {
			per := group.TotalCostUSD / float64(group.Completed)
			group.CostPerCompletedUSD = &per
		}
		comparison.Groups = append(comparison.Groups, group)
	}
	sort.Slice(comparison.Groups, func(i, j int) bool {
		a, b := comparison.Groups[i], comparison.Groups[j]
		if a.Process != b.Process {
			return a.Process < b.Process
		}
		if a.Adapter != b.Adapter {
			return a.Adapter < b.Adapter
		}
		if a.Model != b.Model {
			return a.Model < b.Model
		}
		return a.Effort < b.Effort
	})
	return comparison, nil
}

func median(values []int64) float64 {
	sorted := append([]int64(nil), values...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	middle := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return float64(sorted[middle])
	}
	return float64(sorted[middle-1]+sorted[middle]) / 2
}
