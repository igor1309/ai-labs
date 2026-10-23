# Two-pass recogniser — QA

Both recognisers are fakes that report scripted hearings, one per chunk,
and the two-pass recogniser runs under a real Live text, so each scenario
is read in its segments.

## S-1 Draft words show first

The draft reports two words; the final reports nothing. Evidence:
`TwoPassRecognizerTests.draftWordsShowFirst`.

## S-2 The final reading replaces the draft

The draft reports a misheard word; the final reports the right one, final.
Evidence:
`TwoPassRecognizerTests.theFinalReadingReplacesTheDraft`.

## S-3 Draft words after the final words stay

The final makes its first word final; the draft has heard a word after it.
Evidence:
`TwoPassRecognizerTests.draftWordsAfterTheFinalWordsStay`.

## S-4 A word is not shown twice

The draft hears the final's last word 0.3 s later, and another word that
starts more than 1 s after it. Evidence:
`TwoPassRecognizerTests.aWordIsNotShownTwice`.

## S-5 Draft words change in place

The draft reports a word, then a new reading from it. Evidence:
`TwoPassRecognizerTests.draftWordsChangeInPlace`.

## S-6 Finishing settles the final reading

The audio ends with draft words shown and a final word pending. Evidence:
`TwoPassRecognizerTests.finishingSettlesTheFinalReading`.

## S-7 A failing recogniser fails the two-pass recogniser

The draft fails on the second chunk, and in another run the final does.
Evidence:
`TwoPassRecognizerTests.aFailingRecogniserFailsTheTwoPassRecogniser`.
