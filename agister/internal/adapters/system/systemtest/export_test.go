package systemtest

import "time"

// OnWaiting sets the hook that runs each time Started finds no timer of
// its wait left to return for, before it waits for one. Set it before
// Started is called; the hook does not call the clock.
func (c *Clock) OnWaiting(hook func(wait time.Duration)) { c.waiting = hook }
