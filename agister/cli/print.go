package cli

import (
	"fmt"
	"strconv"
	"strings"
	"text/tabwriter"
)

// check prints each fault, each warning, then how many names resolve and
// how many are refused; it exits 1 where it reports any fault.
func (c *CLI) check(where Where) (int, error) {
	report, err := c.settings.Check(where)
	if err != nil {
		return 0, err
	}
	for _, problem := range report.Problems {
		fmt.Fprintln(c.stdout, problemText(problem))
		fmt.Fprintln(c.stdout, "  refuses every request")
	}
	for _, finding := range report.Findings {
		fmt.Fprintln(c.stdout, documentText(finding.Document))
		c.printFault(finding.Problems, finding.Block, "  ")
		fmt.Fprintln(c.stdout, "  refuses "+documentsText(finding.Refuses))
	}
	for _, warning := range report.Warnings {
		fmt.Fprintln(c.stdout, "warning: "+problemText(warning.Problem))
		fmt.Fprintln(c.stdout, "  with "+documentsText(warning.With))
	}
	var resolve, refused int
	for _, status := range report.Names {
		if status.Resolves {
			resolve++
		} else {
			refused++
		}
	}
	verb := "resolve"
	if resolve == 1 {
		verb = "resolves"
	}
	fmt.Fprintf(c.stdout, "%d %s, %d refused\n", resolve, verb, refused)
	if len(report.Problems) > 0 || len(report.Findings) > 0 {
		return exitFault, nil
	}
	return 0, nil
}

// list prints each name of kind, the layers that hold it and whether it
// resolves.
func (c *CLI) list(where Where, kind Kind) (int, error) {
	listed, err := c.settings.List(where, kind)
	if err != nil {
		return 0, err
	}
	w := tabwriter.NewWriter(c.stdout, 0, 0, 2, ' ', 0)
	for _, l := range listed {
		layers := make([]string, 0, len(l.Layers))
		for _, layer := range l.Layers {
			layers = append(layers, string(layer))
		}
		status := "refused"
		if l.Resolves {
			status = "resolves"
		}
		fmt.Fprintf(w, "%s\t%s\t%s\n", l.Name, strings.Join(layers, ", "), status)
	}
	return 0, w.Flush()
}

// show prints each field of document with its value, file, line and
// layer; then the documents reached, the plans and the warnings, or the
// refusal with its chains. A refusal shown is what was asked, and exits 0;
// a document no layer holds exits 1.
func (c *CLI) show(where Where, document Document) (int, error) {
	shown, err := c.settings.Show(where, document)
	if err != nil {
		return 0, err
	}
	if !shown.Held {
		fmt.Fprintf(c.stdout, "no layer holds the %s\n", documentText(document))
		return exitFault, nil
	}
	w := tabwriter.NewWriter(c.stdout, 0, 0, 2, ' ', 0)
	for _, field := range shown.Fields {
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", field.Place, strconv.Quote(field.Value), at(field.Source, ""), field.Source.Layer)
	}
	if err := w.Flush(); err != nil {
		return 0, err
	}
	if len(shown.Faults) > 0 {
		fmt.Fprintln(c.stdout, "refused")
		for _, fault := range shown.Faults {
			if len(fault.Chain) == 0 {
				fmt.Fprintln(c.stdout, "  of no document")
			} else {
				fmt.Fprintln(c.stdout, "  "+documentText(fault.Chain[len(fault.Chain)-1].Document))
				fmt.Fprintln(c.stdout, "    chain: "+chainText(fault.Chain))
			}
			c.printFault(fault.Problems, fault.Block, "    ")
		}
		return 0, nil
	}
	if len(shown.Reached) > 0 {
		fmt.Fprintln(c.stdout, "reached "+documentsText(shown.Reached))
	}
	for _, plan := range shown.Plans {
		fmt.Fprintf(c.stdout, "plan of %s %s: process %s, agent %s, runtime %s\n", plan.Workflow, plan.Place, plan.Process, plan.Agent, plan.Runtime)
		for _, list := range []struct {
			name   string
			values []string
		}{
			{"options", plan.Options},
			{"required", plan.Required},
			{"allowed", plan.Allowed},
			{"granted", plan.Granted},
			{"granted beyond the allowed", plan.Extra},
			{"withheld", plan.Withheld},
		} {
			if len(list.values) > 0 {
				fmt.Fprintf(c.stdout, "  %s: %s\n", list.name, strings.Join(list.values, ", "))
			}
		}
	}
	for _, warning := range shown.Warnings {
		fmt.Fprintln(c.stdout, "warning: "+problemText(warning))
	}
	return 0, nil
}

// printFault prints a fault's problems, or the block that refuses its
// document, each line after indent.
func (c *CLI) printFault(problems []Problem, block *Block, indent string) {
	for _, problem := range problems {
		fmt.Fprintln(c.stdout, indent+problemText(problem))
	}
	if block != nil {
		fmt.Fprintln(c.stdout, indent+problemText(Problem{Source: block.Source, Message: "blocked: " + block.Reason}))
	}
}

// at is a source and a place as "file:line place", each part left out
// where it is none.
func at(source Source, place string) string {
	var parts []string
	if source.File != "" {
		file := source.File
		if source.Line > 0 {
			file += ":" + strconv.Itoa(source.Line)
		}
		parts = append(parts, file)
	}
	if place != "" {
		parts = append(parts, place)
	}
	return strings.Join(parts, " ")
}

func problemText(problem Problem) string {
	if where := at(problem.Source, problem.Place); where != "" {
		return where + ": " + problem.Message
	}
	return problem.Message
}

func documentText(document Document) string {
	return string(document.Kind) + " " + document.Name
}

func documentsText(documents []Document) string {
	texts := make([]string, 0, len(documents))
	for _, document := range documents {
		texts = append(texts, documentText(document))
	}
	return strings.Join(texts, ", ")
}

// chainText is each link of chain, and where the one before it names it.
func chainText(chain []Link) string {
	texts := make([]string, 0, len(chain))
	for _, link := range chain {
		text := documentText(link.Document)
		if where := at(link.Source, link.Place); where != "" {
			text += " (" + where + ")"
		}
		texts = append(texts, text)
	}
	return strings.Join(texts, " > ")
}
