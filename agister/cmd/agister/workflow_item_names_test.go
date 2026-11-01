package main

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/files"
)

// Integrates settings resolution, planning and CLI refusal for run and check.
// Contract test: colliding workflow settings on disk reach the shared validation.
func TestQualifiedNamesCannotUseRepeatPassIdentities(t *testing.T) {
	t.Parallel()
	for _, pass := range []string{"1", "12"} {
		for _, repeatFirst := range []bool{true, false} {
			t.Run(fmt.Sprintf("pass %s repeat first %t", pass, repeatFirst), func(t *testing.T) {
				t.Parallel()
				user := t.TempDir()
				home := filepath.Join(user, ".agister")
				repo := filepath.Join(user, "repo")
				if err := os.Mkdir(repo, 0700); err != nil {
					t.Fatal(err)
				}
				steps := []string{
					" - {name: tests, workflow: repeating}\n",
					" - {name: tests/revise, workflow: numbered}\n",
				}
				if !repeatFirst {
					slices.Reverse(steps)
				}
				settings := map[string]string{
					"agents/bash.toml":      "schema = \"agister.agent/v1alpha1\"\nruntime = \"bash\"\n",
					"runtimes/bash.yaml":    "schema: agister.runtime/v1alpha1\nadapter: bash\ncontract: bash/1\n",
					"processes/say.yaml":    "schema: agister.process/v1alpha1\nprompt: say\n",
					"prompts/say.md":        "echo hi",
					"workflows/parent.yaml": "schema: agister.workflow/v1alpha1\nsteps:\n" + strings.Join(steps, ""),
					"workflows/repeating.yaml": `schema: agister.workflow/v1alpha1
steps:
 - name: rounds
   repeat:
    state: {}
    steps:
     - {name: revise, process: say, agent: bash}
    next: {}
    until: {equals: [{from: steps.revise.outputs.exit_code}, 1]}
    max: ` + pass + `
outputs: {output: {from: steps.rounds.outputs}}
`,
					"workflows/numbered.yaml": fmt.Sprintf("schema: agister.workflow/v1alpha1\nsteps: [{name: %q, process: say, agent: bash}]\noutputs: {output: {from: steps.%s.outputs}}\n", pass, pass),
				}
				for name, text := range settings {
					file := filepath.Join(home, name)
					if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(file, []byte(text), 0600); err != nil {
						t.Fatal(err)
					}
				}
				f := files.New()
				fs, err := newLayoutFiles(f)
				if err != nil {
					t.Fatal(err)
				}
				runtimes, store := newRuntimesSpy(t), &storeSpy{}
				var out, stderr strings.Builder
				commandLine, err := build(user, &linksSpy{}, fs, rootSpy{root: repo}, runtimes.runtimes(), schemaValidator{},
					(&sourcesSpy{}).sourcing(), (&holdingSpy{}).holding(), store.at, idleHost(t), &out, &stderr)
				if err != nil {
					t.Fatal(err)
				}
				want := fmt.Sprintf("the item %q of workflow \"numbered\" would be planned as %q, named as a pass", pass, "tests/revise/"+pass)
				code := commandLine.Run([]string{"run", "parent"}, repo)
				if code != 1 || !strings.Contains(stderr.String(), want) || out.Len() != 0 {
					t.Errorf("run exit %d, stdout %s, stderr %s; want %s", code, &out, &stderr, want)
				}
				out.Reset()
				stderr.Reset()
				code = commandLine.Run([]string{"check"}, repo)
				if code != 1 || stderr.Len() != 0 || !strings.Contains(out.String(), want) || !strings.Contains(out.String(), "refuses workflow parent") {
					t.Errorf("check exit %d, stdout %s, stderr %s; want %s", code, &out, &stderr, want)
				}
				if len(runtimes.bash.ran()) != 0 || len(store.records) != 0 {
					t.Errorf("calls %v, records %v; want no execution", runtimes.bash.ran(), store.records)
				}
			})
		}
	}
}
