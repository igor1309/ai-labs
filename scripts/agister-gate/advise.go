package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// advice is the output of an advisor run: a decision, or a conflict in
// the record with its reason.
type advice struct {
	Kind     string   `json:"kind"`
	Reason   string   `json:"reason"`
	AskedBy  string   `json:"asked_by"`
	Question string   `json:"question"`
	Options  []string `json:"options"`
	Chosen   string   `json:"chosen"`
	Excluded []struct {
		Option string `json:"option"`
		Why    string `json:"why"`
	} `json:"excluded"`
	RestsOn   []string `json:"rests_on"`
	FollowUps []string `json:"follow_ups"`
}

// advise puts the point implement run runID left open to the advisor, at
// the run's commit. Its decision is appended to the decisions record,
// committed, and run as a fix brief; a conflict stops the step for the
// owner. A step puts one question: a second point stops it (ADR-032).
func (g *gate) advise(ctx context.Context, runID string, open []point, message string) error {
	if len(open) > 1 {
		g.sum.Open = open
		return stop{"open", fmt.Sprintf("implement run %s left %d points open, and a step puts one to the advisor; its work is committed, unreviewed", runID, len(open))}
	}
	recorded, err := g.command(ctx, "git", "diff", "--name-only", g.base, "HEAD", "--", g.decisions)
	if err != nil {
		return fmt.Errorf("git diff: %w", err)
	}
	if strings.TrimSpace(string(recorded)) != "" {
		g.sum.Open = open
		return stop{"open", fmt.Sprintf("implement run %s left a second point open, and the step's one question is decided; its work is committed, unreviewed", runID)}
	}
	question := filepath.Join(g.out, "question.md")
	if err := g.write(question, []byte(questionFile(fmt.Sprintf("implement run %s, %s", runID, g.title), open[0])), "question",
		map[string]any{"implement_run": runID}); err != nil {
		return err
	}
	r, err := g.agister(ctx, "advisor", g.advisor, "--param", "question="+question, "--param", "revision=HEAD", "--json")
	if err != nil {
		return err
	}
	if r.Status != "completed" {
		g.sum.Open = open
		return stop{"stopped", fmt.Sprintf("advisor run %s %s%s", r.RunID, r.Status, failure(r))}
	}
	var out struct {
		Advice advice `json:"advice"`
	}
	if err := json.Unmarshal(r.Output, &out); err != nil {
		return fmt.Errorf("advisor run %s: output: %w", r.RunID, err)
	}
	if out.Advice.Kind != "decision" {
		g.sum.Open = open
		return stop{"owner", fmt.Sprintf("advisor run %s found a conflict in the record: %s", r.RunID, out.Advice.Reason)}
	}
	id, record, err := g.appendRecord(out.Advice, open[0].Searched, r.RunID)
	if err != nil {
		return err
	}
	if _, err := g.command(ctx, "git", "add", "--", g.decisions); err != nil {
		return fmt.Errorf("git add: %w", err)
	}
	subject := fmt.Sprintf("%s (%s recorded)", message, id)
	if _, err := g.command(ctx, "git", "commit", "-q", "-m", subject); err != nil {
		return fmt.Errorf("git commit: %w", err)
	}
	g.sum.Records = append(g.sum.Records, id)
	head, err := g.head(ctx)
	if err != nil {
		return err
	}
	if err := g.committed(head, subject, []string{g.decisions}, map[string]any{"advisor_run": r.RunID, "decision": id}); err != nil {
		return err
	}

	// The brief names the record where it stands in the repository, not
	// the run that made it (LAB-200).
	acts := fmt.Sprintf("The decision `%s`, recorded in `%s`, as written:\n\n%s", id, g.decisions, fenced(record))
	path := filepath.Join(g.out, "decision-"+id+".md")
	if err := g.write(path, []byte(g.stepBrief(fmt.Sprintf("%s, decision %s", g.title, id), acts)), "decision brief",
		map[string]any{"decision": id, "decisions": g.decisions, "advisor_run": r.RunID, "issue": g.issue, "constraints": g.constraints}); err != nil {
		return err
	}
	return g.implementAndCommit(ctx, path, fmt.Sprintf("%s (%s)", message, id))
}

// questionFile is the question file of p: who asked, the question, the
// options and what was searched, as the run wrote them, and nothing else.
func questionFile(askedBy string, p point) string {
	return fmt.Sprintf("# Question\n\n## Asked by\n\n%s\n\n## Question\n\n%s\n\n## Options\n\n%s\n## Searched\n\n%s",
		askedBy, p.Question, bullets("- ", p.Options), bullets("- ", p.Searched))
}

var recordID = regexp.MustCompile(`(?m)^## D-(\d+):`)

// appendRecord appends a's decision to the decisions record as the next
// D-<n>, with what the asker searched and the advisor's run, and returns
// its id and text.
func (g *gate) appendRecord(a advice, searched []string, runID string) (string, string, error) {
	records, err := g.read(g.decisions, "decisions record")
	if errors.Is(err, fs.ErrNotExist) {
		records, err = []byte("# Decisions\n"), nil
	}
	if err != nil {
		return "", "", err
	}
	next := 1
	for _, m := range recordID.FindAllSubmatch(records, -1) {
		if n, _ := strconv.Atoi(string(m[1])); n >= next {
			next = n + 1
		}
	}
	id := fmt.Sprintf("D-%d", next)
	var b strings.Builder
	fmt.Fprintf(&b, "## %s: %s\n\n", id, a.Question)
	fmt.Fprintf(&b, "- **Status:** Provisional (advisor)\n- **Asked by:** %s\n- **Question:** %s\n", a.AskedBy, a.Question)
	fmt.Fprintf(&b, "- **Options:**\n%s", bullets("  - ", a.Options))
	fmt.Fprintf(&b, "- **Searched:**\n%s", bullets("  - ", searched))
	b.WriteString("- **Excluded:**\n")
	for _, e := range a.Excluded {
		fmt.Fprintf(&b, "  - %s: %s\n", e.Option, e.Why)
	}
	fmt.Fprintf(&b, "- **Decision:** %s\n- **Rests on:**\n%s", a.Chosen, bullets("  - ", a.RestsOn))
	fmt.Fprintf(&b, "- **Follow-ups:**\n%s- **Advisor run:** %s\n", bullets("  - ", a.FollowUps), runID)
	record := b.String()
	text := strings.TrimRight(string(records), "\n") + "\n\n" + record
	return id, record, g.write(g.decisions, []byte(text), "decisions record", map[string]any{"advisor_run": runID, "decision": id})
}

// bullets is items as a list, each after prefix.
func bullets(prefix string, items []string) string {
	var b strings.Builder
	for _, it := range items {
		fmt.Fprintf(&b, "%s%s\n", prefix, it)
	}
	return b.String()
}
