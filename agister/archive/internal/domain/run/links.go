package run

// Links are the earlier runs a run was given as its goal and its judgement
// (ADR-026 rules 2 and 6), each read from that run's record as the run
// started: nothing is found by searching runs.
type Links struct {
	Goal      *GoalLink      `json:"goal,omitempty"`
	Judgement *JudgementLink `json:"judgement,omitempty"`
}

// GoalLink is the goal a run serves: an input of an earlier run, by that
// run's ID, the input's name and the digest of its bytes, and the artifact
// that keeps them, when one does (unset for a value kept inline).
type GoalLink struct {
	Run      string    `json:"run"`
	Input    string    `json:"input"`
	Digest   string    `json:"digest"`
	Artifact *Artifact `json:"artifact,omitempty"`
}

// JudgementLink is the judgement a run answers: an earlier run that
// completed.
type JudgementLink struct {
	Run string `json:"run"`
}
