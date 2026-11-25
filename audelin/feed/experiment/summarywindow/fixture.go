package main

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// Fixture is a recorded call and the facts fixed in advance that a
// summary of it must keep.
type Fixture struct {
	Name     string `json:"name"`
	Duration Secs   `json:"durationSeconds"`
	Turns    []Turn `json:"turns"`
	Facts    []Fact `json:"facts"`
}

// Turn is one stretch of speech.
type Turn struct {
	Side  string `json:"side"`
	At    Secs   `json:"at"`
	Words string `json:"words"`
}

// Fact is something said in the call that a summary at the end must
// still hold. It is kept when the summary holds a word of every group
// of All, each group being alternatives.
type Fact struct {
	ID   string     `json:"id"`
	Kind string     `json:"kind"`
	At   Secs       `json:"at"`
	All  [][]string `json:"all"`
}

// Secs is call time in whole seconds, as the fixture files spell it.
type Secs int

func (s Secs) Duration() time.Duration { return time.Duration(s) * time.Second }

func loadFixtures(dir string) ([]Fixture, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	slices.Sort(paths)
	var out []Fixture
	for _, p := range paths {
		b, err := os.ReadFile(p)
		if err != nil {
			return nil, err
		}
		var f Fixture
		if err := json.Unmarshal(b, &f); err != nil {
			return nil, fmt.Errorf("%s: %w", p, err)
		}
		out = append(out, f)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no fixtures in %s", dir)
	}
	return out, nil
}

func writeFixtures(dir string) error {
	for _, f := range []Fixture{longCall(), shortCall()} {
		b, err := json.MarshalIndent(f, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, f.Name+".json"), append(b, '\n'), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// planted is a fact's line and where it is said.
type planted struct {
	at    Secs
	side  string
	words string
	fact  *Fact
}

// generate fills a call of the given length with talk on the topics,
// a turn of one to three sentences every 5 to 14 seconds, and puts the planted lines at their
// times. The same seed gives the same call.
func generate(name string, length Secs, seed uint64, topics [][]string, lines []planted) Fixture {
	r := rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))
	f := Fixture{Name: name, Duration: length}
	sides := []string{"me", "them"}
	next := 0
	side := 0
	for at := Secs(3); at < length-5; at += Secs(5 + r.IntN(10)) {
		for next < len(lines) && lines[next].at <= at {
			l := lines[next]
			f.Turns = append(f.Turns, Turn{Side: l.side, At: l.at, Words: l.words})
			if l.fact != nil {
				fact := *l.fact
				fact.At = l.at
				f.Facts = append(f.Facts, fact)
			}
			next++
		}
		topic := topics[min(len(topics)-1, int(at)*len(topics)/int(length))]
		n := 1 + r.IntN(3)
		var words []string
		for range n {
			words = append(words, topic[r.IntN(len(topic))])
		}
		f.Turns = append(f.Turns, Turn{Side: sides[side], At: at, Words: strings.Join(words, " ")})
		side = 1 - side
	}
	slices.SortStableFunc(f.Turns, func(a, b Turn) int { return int(a.At - b.At) })
	return f
}

func fact(id, kind string, all ...[]string) *Fact { return &Fact{ID: id, Kind: kind, All: all} }

func alt(words ...string) []string { return words }

var roadmapTalk = []string{
	"Let's go through the roadmap items one by one.",
	"The onboarding flow still has the extra screen we talked about.",
	"I think the analytics events are mostly in place now.",
	"Design said the new icons will land next sprint.",
	"We should double check the copy on the settings page.",
	"The beta group gave mostly positive feedback so far.",
	"Some testers found the empty state confusing.",
	"I'd like to keep this part of the scope small.",
	"Right, that matches what I heard from the support team.",
	"Okay, makes sense, let's keep moving.",
	"Can you share your screen for a second?",
	"Sorry, I was on mute, go ahead.",
}

var backendTalk = []string{
	"The sync service is where most of the latency comes from.",
	"We see retries spike every morning around nine.",
	"The queue depth looks fine in the dashboards.",
	"I profiled the import job and the parser is the slow part.",
	"Logging is too noisy, we should cut the debug lines.",
	"The migration scripts need another review pass.",
	"Staging was down for an hour yesterday because of certificates.",
	"We could batch the writes instead of sending them one by one.",
	"Yeah, I agree, that would cut the load quite a bit.",
	"Let me check the numbers after the call.",
	"Hmm, I am not sure that is the root cause.",
	"That should be easy to try on staging first.",
}

var peopleTalk = []string{
	"The new hire starts on Monday and needs a laptop.",
	"Half the team is travelling for the conference.",
	"We should plan the retro for after the release.",
	"I'll be out on Thursday afternoon.",
	"The hiring panel needs one more interviewer.",
	"Let's keep the standups short this week.",
	"Good point, I'll mention it to the others.",
	"Yes, I saw that message in the channel.",
	"Mm-hm, sounds good to me.",
	"Let's not go too deep on this today.",
}

var wrapTalk = []string{
	"Let's recap what we have so far.",
	"I think we covered most of the agenda.",
	"Anything else before we wrap up?",
	"I'll write the notes and send them around.",
	"Thanks everyone, this was useful.",
	"Let's sync again next week at the same time.",
	"Okay, one more small thing before we go.",
	"Right, I have that written down.",
}

// longCall is an hour of a product sync with nine facts, said from the
// second minute to the last ones, including a decision taken back later.
func longCall() Fixture {
	return generate("long-product-sync", 3600, 1801, [][]string{roadmapTalk, backendTalk, peopleTalk, backendTalk, roadmapTalk, wrapTalk}, []planted{
		{at: 95, side: "them", words: "Before I forget, the code word for the partner pilot is Marigold Seven, please use it in every message about it.", fact: fact("code-word", "code word", alt("marigold"))},
		{at: 430, side: "me", words: "Open question for all of us: who owns the vendor contract renewal with Tessaract? Nobody has picked it up.", fact: fact("vendor-owner-question", "question", alt("tessaract"), alt("contract", "renewal"))},
		{at: 780, side: "them", words: "We decided to use Redis for the job queue for now.", fact: nil},
		{at: 1240, side: "me", words: "Decision: the public launch moves from March 3 to March 14 so the translations can land.", fact: fact("launch-date", "decision", alt("march 14", "14 march", "mar 14", "14 mar"))},
		{at: 1610, side: "them", words: "The budget cap for the cloud migration is forty-eight thousand euros, finance confirmed it this morning.", fact: fact("budget-cap", "number", alt("48", "forty-eight", "forty eight"))},
		{at: 2050, side: "me", words: "Question to finance: can we pay the Lindqvist agency from this quarter's budget or does it move to next quarter?", fact: fact("agency-question", "question", alt("lindqvist"))},
		{at: 2470, side: "them", words: "Let's change the earlier queue decision: we switch to NATS instead of Redis, it is already running in the cluster.", fact: fact("queue-nats", "revised decision", alt("nats"))},
		{at: 2900, side: "me", words: "Action item: Priya sends the security review to the auditors by Friday.", fact: fact("priya-action", "action", alt("priya"), alt("security review", "security"))},
		{at: 3300, side: "them", words: "One more risk: the Android build fails on Samsung tablets with the new renderer, nobody has a fix yet.", fact: fact("samsung-risk", "risk", alt("samsung"))},
		{at: 3480, side: "me", words: "Final decision: we keep the free tier at three projects per user.", fact: fact("free-tier", "decision", alt("free tier", "free-tier"), alt("three", "3"))},
	})
}

// shortCall is a fifteen-minute check-in with four facts.
func shortCall() Fixture {
	return generate("short-check-in", 900, 1795, [][]string{peopleTalk, backendTalk, wrapTalk}, []planted{
		{at: 70, side: "them", words: "Quick note, the code word for the offsite is Juniper Lake, keep it out of the shared calendar.", fact: fact("code-word", "code word", alt("juniper"))},
		{at: 300, side: "me", words: "Question: does the Okonkwo team need access to the staging database or only to the logs?", fact: fact("okonkwo-question", "question", alt("okonkwo"))},
		{at: 560, side: "them", words: "Decision: we freeze the release branch on Wednesday at noon.", fact: fact("freeze", "decision", alt("freeze", "frozen"), alt("wednesday"))},
		{at: 800, side: "me", words: "Action item: Tomasz updates the runbook for the failover before Monday.", fact: fact("tomasz-action", "action", alt("tomasz"), alt("runbook"))},
	})
}
