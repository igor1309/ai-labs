package layout_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/layout"
)

// budget.feature: home alone holds the budget, absence is allowed, and
// unreadable bytes are a problem of the file.
func TestHomesBudget(t *testing.T) {
	t.Parallel()
	bad := errors.New("cannot read budget")
	for _, c := range []struct {
		name, folder string
		absent       bool
		readError    error
		want         *layout.Source
		problem      error
	}{
		{"home", homeFolder, false, nil, &layout.Source{Path: homeFolder + "/budget.yaml", Bytes: []byte("daily: {cost: 20}")}, nil},
		{"absent", homeFolder, true, nil, nil, nil},
		{"repository", repositoryFolder, false, nil, nil, layout.ErrBudgetOutsideHome},
		{"project", projectFolder, false, nil, nil, layout.ErrBudgetOutsideHome},
		{"unreadable", homeFolder, false, bad, nil, bad},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			path := c.folder + "/budget.yaml"
			files := &spyFiles{files: map[string]string{
				homeFolder + "/other": "", repositoryFolder + "/other": "", projectFolder + "/other": "",
			}, failing: map[string]error{path: c.readError}}
			if !c.absent {
				files.files[path] = "daily: {cost: 20}"
			}
			got := read(t, files, allFolders)
			var problems []layout.Problem
			if c.problem != nil {
				problems = []layout.Problem{{Path: path, Err: c.problem}}
			}
			if !reflect.DeepEqual(got.Budget, c.want) || !reflect.DeepEqual(got.Problems, problems) {
				t.Fatalf("budget %+v, problems %+v; want %+v, %+v", got.Budget, got.Problems, c.want, problems)
			}
		})
	}
}
