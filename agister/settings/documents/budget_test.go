package documents_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const budgetFile = "/home/.agister/budget.yaml"

func budgetOf(text string) (documents.Field[float64], []documents.Problem) {
	return documents.New(documents.Snapshot{Budget: source(budgetFile, text)}).Budget()
}

// budget.feature: a daily cost carries its line and is absent for no file
// or an empty one.
func TestADailyBudgetIsACostInUSDollars(t *testing.T) {
	t.Parallel()
	got, problems := budgetOf("daily:\n  cost: 20\n")
	want := documents.Field[float64]{Value: 20, Given: true, Origin: documents.Origin{Path: budgetFile, Line: 2, Place: "daily.cost"}}
	if got != want {
		t.Fatalf("budget %+v, want %+v", got, want)
	}
	assertProblems(t, problems, nil)
	for _, snapshot := range []documents.Snapshot{{}, {Budget: source(budgetFile, "")}} {
		got, problems := documents.New(snapshot).Budget()
		if got.Given || len(problems) != 0 {
			t.Fatalf("budget %+v, problems %+v; want absent", got, problems)
		}
	}
}

// budget.feature: every invalid form gives problems of no document and
// no usable budget.
func TestABudgetThatIsNotADailyCostIsAProblem(t *testing.T) {
	t.Parallel()
	problem := func(place, message string) documents.Problem {
		return documents.Problem{Path: budgetFile, Line: 1, Place: place, Message: message}
	}
	for _, c := range []struct {
		text string
		want []documents.Problem
	}{
		{"daily: {cost: 0}", []documents.Problem{problem("daily.cost", "it is more than zero")}},
		{"daily: {cost: -1}", []documents.Problem{problem("daily.cost", "it is more than zero")}},
		{"daily: {cost: lots}", []documents.Problem{problem("daily.cost", "it is a number, not a string")}},
		{"daily: {}", []documents.Problem{problem("daily.cost", "it is missing")}},
		{"daily: {cost: 1, time: 1}", []documents.Problem{problem("daily.time", "the field is not known")}},
		{"weekly: {cost: 1}", []documents.Problem{problem("daily", "it is missing"), problem("weekly", "the field is not known")}},
		{"- daily", []documents.Problem{{Path: budgetFile, Message: "it is a map"}}},
		{"daily: [", decodeProblems(t, tree.YAML, "daily: [", budgetFile)},
	} {
		t.Run(c.text, func(t *testing.T) {
			t.Parallel()
			got, problems := budgetOf(c.text)
			if got.Given || !reflect.DeepEqual(problems, c.want) {
				t.Fatalf("budget %+v, problems %+v; want none, %+v", got, problems, c.want)
			}
		})
	}
}
