# Reading — QA

Driven through the reducer alone: a state built with a `make*` factory, one
event, and the resulting state compared with the given state plus the
expected change. Formatters are spies; rows read back the rows, holds,
banners, names and recording time the state shows.

## S-1 A failed side shows a banner and a gap
Evidence: `repeatedFaultKeepsItsFirstTime`, `recordingOffClearsProblemsAndGaps`, `faultsAndWarningAreNewestFirst`.

## S-2 Silence clears without leaving a gap
Evidence: `clearingWarningKeepsFaultsAndGaps`, `warningAloneHasNoGap`.

## S-3 Held selections stay as selected
Evidence: `holdsSurviveRevisedText`, `holdsSurviveTheirEntryLeaving`, `letGoRemovesOnlyThatHold`.

## S-4 Scrolling away counts new entries
Evidence: `newIdentitiesCountBelow`, `settlingIsNotNewBelow`, `jumpToLiveFollowsAndClearsNew`.

## S-5 Live text prepares while recording
Evidence: `gettingReadyKeepsTheRecording`.

## S-6 Finishing keeps what was read
Evidence: `finishingKeepsWhatWasRead`.

## S-7 A finished call takes its confirmed names
A call ended, then its confirmed names: the rows read those names. The
composer's `AfterCallNamesWiringTests` covers the wiring today. Evidence: Missing in Reading.

## S-8 The next call starts clean
Evidence: Missing.

## S-9 Text before capture waits
Text, then capture beginning: the log is empty, then shows that text.
Evidence: Missing.

## S-10 Confirmed names reach final entries
A final remote entry and a later one, then a confirmed set: both read their
names; a tentative set names only the later one. Evidence: Missing; `confirmedNamesReplaceTentativeOnesAndUnconfirmedRowsLoseTheirs` covers confirmation.

## S-11 Time runs from the first recording instant
Recording on at an instant, ticks at later and earlier instants: the time
reads from the first instant and the earlier tick changes nothing.
Evidence: Missing.
