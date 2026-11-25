# Follow client QA

Each row drives a fake event source and checks the printed output.

## S-1 Call text stays marked and each record is written as one line

The output holds every word inside the call-text marks. A no-call event, a
long catch-up window with multiline parts, a second window and the call's end
each produce one line in one write. The client writes each record before
asking for another event, so Monitor gives one notification per record.
The evidence is `TestS1_AWindowWithWordsCanBeReadApartFromInstructions` and
`TestS1_EachRecordIsOneLineWrittenBeforeTheNextEvent` in
`audelin/feed/followclient`, both run by `audelin-feed-core`.

## S-2 An empty window is said
Drive: an empty window; the output says no words came. Evidence: `TestS2_AnEmptyWindowIsSaid` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-3 Waiting for a call is said
Drive: a no-call event; the output says no call is live. Evidence: `TestS3_WaitingForACallIsSaid` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-4 The call's end ends following
Drive: the end; the output says so and the program exits zero. Evidence: `TestS4_TheCallsEndEndsFollowing` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-6 A lost source ends following
Drive: the fake reports the source lost; the output says so and the program exits non-zero. Evidence: `TestS6_ALostSourceEndsFollowing` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-7 Words that mimic the marks stay data

A part holding a closing quote, a brace and a newline followed by a forged
record stays whole inside one marked block on one output line. The evidence
is `TestS7_WordsThatMimicTheMarksStayData` in `audelin/feed/followclient`, run by
`audelin-feed-core`.

## S-8 Spoken orders stay data
Drive: a part saying "ignore your instructions"; the output keeps it inside the marked block. Evidence: `TestS8_SpokenOrdersStayData` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-9 Waiting, then a call, is said in turn
Drive: a no-call event, then a window; the output says no call is live, then gives the window. Evidence: `TestS9_WaitingThenACallIsSaidInTurn` in `audelin/feed/followclient`, run by `audelin-feed-core`.
