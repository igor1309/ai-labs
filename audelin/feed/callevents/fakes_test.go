package callevents_test

import (
	"context"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

var zero = time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)

// clock is a fake clock: Wait moves it to the time asked, at once.
type clock struct{ now time.Time }

func (c *clock) Now() time.Time { return c.now }

func (c *clock) Wait(ctx context.Context, t time.Time) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if t.After(c.now) {
		c.now = t
	}
	return nil
}

// live is a fake live call whose answer is a function of the clock.
type live struct {
	clock *clock
	at    func(now time.Duration) (callevents.Call, bool, error)
}

func (l *live) Live() (callevents.Call, bool, error) { return l.at(l.clock.now.Sub(zero)) }

// heard gives a call started at zero whose parts are read once the clock
// passes their start.
func heard(parts ...callevents.Part) func(time.Duration) (callevents.Call, bool, error) {
	return func(now time.Duration) (callevents.Call, bool, error) {
		call := callevents.Call{ID: "call", Start: zero}
		for _, p := range parts {
			if p.Start < now {
				call.Parts = append(call.Parts, p)
			}
		}
		return call, true, nil
	}
}

func part(side string, start time.Duration, words string) callevents.Part {
	return callevents.Part{Side: side, Start: start, Words: words}
}
