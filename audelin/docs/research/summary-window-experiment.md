# Rolling summary window and overlap

How should a client that follows a live call keep a running summary: reread
the whole call at each step, or roll a summary forward over the feed's
windows? And which window size and overlap?

## Method

The harness in `audelin/feed/experiment/summarywindow` replays two generated
calls through the feed's call events on a fake clock, the same iterator
`audelin-feed` serves, so an hour replays in seconds. At each window it asks
the model for a summary of the whole call so far, under 250 words, with the
same system prompt for every strategy:

- **reread**: the whole transcript so far, at the default cadence (3-minute
  window, 1-minute overlap: first summary at 3:00, then every 2 minutes);
- **rolling S/O**: the previous summary, the window's overlap as context and
  its new words, for windows of S minutes overlapping by O.

Calls: a 60-minute product sync (383 turns, 6,671 words) and a 15-minute
check-in (93 turns, 1,500 words). Each holds facts fixed in advance — nine
and four — said from the second minute to the last ones: a code word,
open questions, decisions (one replaced by a later one), a number, actions
and a risk. A fact counts as kept when the summary names it (keywords per
fact, in the fixture). "Fact-steps missed" counts, over all steps, facts
already said that the step's summary lacked.

Model: Claude Haiku 5.5 through `claude -p`, one run of each strategy, one
call at a time. Latency is the API time the CLI reports. Tokens are input
including cached input.

## Results

60-minute call:

| Strategy | Calls | Input tokens | Largest input | Output tokens | Cost USD | Median latency s | Missed at end | Fact-steps missed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| reread 3m/1m | 30 | 258,075 | 15,090 | 51,956 | 0.108 | 10.7 | none | 0/132 |
| rolling 3m/1m | 30 | 65,916 | 2,537 | 58,032 | 0.052 | 9.1 | none | 0/132 |
| rolling 3m/0 | 20 | 45,397 | 2,596 | 42,219 | 0.036 | 9.7 | none | 0/87 |
| rolling 5m/1m | 15 | 38,047 | 2,855 | 26,308 | 0.026 | 8.7 | none | 0/68 |
| rolling 10m/2m | 8 | 28,202 | 4,048 | 13,719 | 0.016 | 8.8 | none | 0/41 |

15-minute call:

| Strategy | Calls | Input tokens | Largest input | Output tokens | Cost USD | Median latency s | Missed at end | Fact-steps missed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| reread 3m/1m | 7 | 19,566 | 4,070 | 8,014 | 0.011 | 8.6 | none | 0/16 |
| rolling 3m/1m | 7 | 14,010 | 2,287 | 15,576 | 0.013 | 11.6 | none | 0/16 |
| rolling 3m/0 | 5 | 9,381 | 2,108 | 7,753 | 0.007 | 8.8 | none | 0/12 |
| rolling 5m/1m | 4 | 8,784 | 2,487 | 5,198 | 0.006 | 9.4 | none | 0/10 |
| rolling 10m/2m | 2 | 5,830 | 3,151 | 2,032 | 0.003 | 7.3 | none | 0/7 |

The whole experiment cost 0.28 USD (the CLI's reported list cost) and
made 128 model calls.

## Findings

- **Nothing was missed by any strategy**, including the code word said at
  1:35 of the hour and the queue decision replaced at 41:10, which every
  final summary reported as Redis replaced by NATS. Rolling summaries did
  not lose early facts over 30 steps.
- **Rereading costs grow with the call.** Its input per call rises to 15k
  tokens by the hour's end, about four times rolling's total input and
  twice its cost. Its latency did not grow much at this length: about 250
  words of output dominate, so every strategy answered in 7–12 s.
- **Output dominates rolling's cost**, so fewer steps cost less in
  proportion: 10m/2m costs a third of 3m/1m. The price is freshness — a fact
  reaches the summary up to one step (8 minutes) plus the model's ~9 s late,
  against 2 minutes at 3m/1m.
- **A 15-minute call needs no rolling summary.** Rereading it costs about
  the same as rolling (0.011 vs 0.013 USD) and its largest prompt is 4k
  tokens.

## Recommendation

Keep the feed's default, a 180-second window with 60 seconds of overlap:
the first summary at 3 minutes, then one every 2 minutes. It lost nothing,
keeps a fact at most about 2 minutes behind the call, and costs about
0.05 USD an hour with Haiku. A client may reread the whole call while it is
short (up to about 15 minutes) and switch to rolling after. A client that
can wait longer for news can choose 5m/1m and halve the cost; the feed
already lets each client pick. No default changes.

## Open

- The calls are generated: planted facts stand out against repeated filler,
  and the scoring is by keywords. The test does not separate the strategies
  on what is missed; a recorded call with the owner's consent, or a harder
  fixture with near-miss facts and more speakers, is the next test.
- One run per strategy with one model; latency is a single local
  observation, not a service figure.
