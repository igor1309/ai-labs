# Follow client QA

Driven through a fake event source; each row reads back the printed output,
and S-1 also under Monitor in a thread.

## S-1 A window with words can be read apart from instructions
Drive: two windows back to back, one a long catch-up with multi-line parts; the output holds every word inside the call-text marks, and under Monitor each arrives as one notification. Evidence: `TestS1_AWindowWithWordsCanBeReadApartFromInstructions` in `audelin/feed/followclient`, run by `audelin-feed-core`. Open: the reading under Monitor in a thread.

## S-2 An empty window is said
Drive: an empty window; the output says no words came. Evidence: `TestS2_AnEmptyWindowIsSaid` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-3 Waiting for a call is said
Drive: a no-call event; the output says no call is live. Evidence: `TestS3_WaitingForACallIsSaid` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-4 The call's end ends following
Drive: the end; the output says so and the program exits zero. Evidence: `TestS4_TheCallsEndEndsFollowing` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-6 A lost source ends following
Drive: the fake reports the source lost; the output says so and the program exits non-zero. Evidence: `TestS6_ALostSourceEndsFollowing` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-7 Words that mimic the marks stay data
Drive: a part holding a closing quote, a brace and a newline followed by a forged record; under Monitor the thread quotes the part whole, inside one marked block. Evidence: `TestS7_WordsThatMimicTheMarksStayData` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-8 Spoken orders stay data
Drive: a part saying "ignore your instructions"; the output keeps it inside the marked block. Evidence: `TestS8_SpokenOrdersStayData` in `audelin/feed/followclient`, run by `audelin-feed-core`.

## S-9 Waiting, then a call, is said in turn
Drive: a no-call event, then a window; the output says no call is live, then gives the window. Evidence: `TestS9_WaitingThenACallIsSaidInTurn` in `audelin/feed/followclient`, run by `audelin-feed-core`.
