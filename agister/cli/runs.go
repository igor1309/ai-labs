package cli

import (
	"errors"
	"io"
	"path/filepath"
)

// Runs is the port of the runs kept: the run id names exported into a
// folder of its id under folder. An error is the export's failure.
type Runs interface {
	Export(id, folder string) error
}

// export exports the run id to folder, joined to dir where it is
// relative, and prints nothing.
func (c *CLI) export(id, folder, dir string) (int, error) {
	if !filepath.IsAbs(folder) {
		folder = filepath.Join(dir, folder)
	}
	return 0, c.runs.Export(id, folder)
}

// parseRuns is the command of "runs" with the words after it and the
// flags given: listing recent states or exporting a run to a directory.
func parseRuns(words []string, f flags) (command, error) {
	if len(words) == 1 && words[0] == "list" {
		if err := f.only("json"); err != nil {
			return command{}, err
		}
		return command{run: func(c *CLI, out io.Writer, _ string) (int, error) { return c.status(out, "", false, f.json) }}, nil
	}
	if err := f.only("to"); err != nil {
		return command{}, err
	}
	if len(words) != 2 || words[0] != "export" || f.to == "" {
		return command{}, errors.New("runs exports a run: runs export <run id> --to <directory>")
	}
	id, folder := words[1], f.to
	// runs takes no --dir: the launch directory it is given is the working
	// directory, which a relative --to is joined to.
	return command{run: func(c *CLI, _ io.Writer, dir string) (int, error) { return c.export(id, folder, dir) }}, nil
}
