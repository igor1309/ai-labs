package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/runstore"
)

// dailyRuns supplies the records whose calls may have spent on the day.
type dailyRuns interface {
	Runs() ([]string, error)
	Record(id string) (runstore.Record, error)
}

// dailyBudget reads spend anew for each call: ended calls of this run
// are persisted before the next step, just as other runs' calls are.
func dailyBudget(store dailyRuns, now time.Time, cost *float64) (*call.DailyBudget, []string) {
	if cost == nil {
		return nil, nil
	}
	day := &call.DailyBudget{Cost: *cost}
	var warnings []string
	warn := func(err error) {
		warnings = append(warnings, fmt.Sprintf("the runs could not be read: %s; they spend nothing of the day", err))
	}
	ids, err := store.Runs()
	if err != nil {
		warn(err)
		return day, warnings
	}
	y, m, d := now.Date()
	midnight := time.Date(y, m, d, 0, 0, 0, 0, now.Location())
	oldest, tomorrow := midnight.AddDate(0, 0, -1), midnight.AddDate(0, 0, 1)
	for _, id := range ids {
		stamp, _, _ := strings.Cut(id, "-")
		started, err := time.Parse("20060102T150405Z", stamp)
		if err != nil || started.Before(oldest) {
			continue
		}
		record, err := store.Record(id)
		if err != nil {
			warn(err)
			continue
		}
		for _, c := range record.Calls {
			at := c.Result.Timing.Started
			if c.Reuses == nil && c.Result.Cost != nil && !at.Before(midnight) && at.Before(tomorrow) {
				day.Spent += *c.Result.Cost
			}
		}
	}
	return day, warnings
}
