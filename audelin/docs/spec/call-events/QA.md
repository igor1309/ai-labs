# Call events QA

Driven with a fake live call and clock. The discovery retry test advances
the clock after each reported wait. The composed feed also reads saved
renderer fixtures with a fake clock.

## S-1 No call is said while none is live
Drive: fake with no call; the event says no call. Evidence: `TestS1_NoCallIsSaidWhileNoneIsLive` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-2 A window comes when its time has passed
Drive: size 3, overlap 1; parts at 0:30, 2:30, 3:00; after the wait is reported, advance to 2:59 (no event) then 3:00: the window holds 0:30 and 2:30, not 3:00. Evidence: `TestS2_AWindowComesWhenItsTimeHasPassed` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-4 A window with no words comes empty
Drive: a live call with no parts; advance past 3:00; an empty window comes. Evidence: `TestS4_AWindowWithNoWordsComesEmpty` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-5 Joining mid-call gives what was said before
Drive: join at 2:00 before the first scheduled end and at 7:40 between later ends. Each catch-up holds all saved parts through the join. The next windows still end at 3:00 and 9:00, with previously sent parts as context and newly saved parts as new text. Evidence: `TestS5_JoiningMidCallGivesWhatWasSaidBefore` in `audelin/feed/callevents` and `TestAFollowedCallIsServedFromJoinToEnd` in `audelin/feed/cmd/audelin-feed`, run by `audelin-feed-core`.

## S-6 A call starting after no call is joined
Drive: after one no-call event, take the next event while discovery first fails and then succeeds. The same iterator waits and gives the call's first chunk on recovery. A failed first read also waits for recovery. Evidence: `TestS6_ACallStartingAfterNoCallIsJoined` and `TestS6_FailedDiscoveryReadKeepsWaitingOnTheSameStream` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-7 Words saved late come in the next window
Drive: window to 3:00 given; add a part at 2:40; the window to 5:00 holds it once. Evidence: `TestS7_WordsSavedLateComeInTheNextWindow` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-8 A late reader gets every due window in turn
Drive: advance to 9:00 before reading; windows to 3, 5, 7, 9 come once each, in order. Evidence: `TestS8_ALateReaderGetsEveryDueWindowInTurn` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-9 The windows left come before the end
Drive: advance to 7:00 unread, end the call at 7:00; windows to 3, 5, 7, then the end, with no extra window. Evidence: `TestS9_TheWindowsLeftComeBeforeTheEnd` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-11 A failed read gives an empty window
Drive: the fake fails at 3:00; the window to 3:00 comes empty; it recovers; the window to 5:00 holds 2:00–5:00 whole; a fake that never recovers gives only empty windows. Evidence: `TestS11_AFailedReadGivesAnEmptyWindow` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-12 A call ending between windows gives its last words
Drive: end a call between window ends and read its last words, then the end. In ended snapshots with unsent parts at and beyond the observed end, check that the final window holds both parts and ends past their starts. Repeat with the observed end on a regular window boundary and check that window is cut normally. Evidence: `TestS12_ACallEndingBetweenWindowsGivesItsLastWords` and `TestS12_TheFinalWindowDrainsPartsAtAndAfterTheObservedEnd` in `audelin/feed/callevents`, run by `audelin-feed-core`.

## S-13 New words can be told from the overlap
Drive: size 3, overlap 1; parts at 2:30 and 4:00; the window to 5:00 marks 2:30 as context and 4:00 as new. After the transcript revises and relabels one 2:30 part and removes the other, both appear in context as originally sent. The composed feed keeps a retimed part's original words in context and sends new words at its old second once. Evidence: `TestS13_NewWordsCanBeToldFromTheOverlap` and `TestS13_OverlapRepeatsEmittedWordsAfterRevisionAndRelabeling` in `audelin/feed/callevents`, and `TestPendingPartRetimingDoesNotResendItOrHideNewWords` in `audelin/feed/cmd/audelin-feed`, run by `audelin-feed-core`.

## S-14 An overlap alone reads as no new words
Drive: a part at 2:30 only; the window to 5:00 holds it as context and no new words. Evidence: `TestS14_AnOverlapAloneReadsAsNoNewWords` in `audelin/feed/callevents`, run by `audelin-feed-core`.
