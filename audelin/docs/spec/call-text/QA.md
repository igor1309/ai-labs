# Call text — QA

Driven through fakes of its own interfaces: per track a live
audio stream sent on cue and a written track that grows on cue, and per
track a live text that turns each recorded word-tone
into a known word, can be held loading, and can fail. A word comes back
only if its audio was given, so every row reads back text that depends on
the recorded audio, before the recording ends.

## S-1 What I say is read as mine as I say it

A sentence sent on the mic track one word at a time: each word comes
back as mine before the next is sent. Evidence:
`microphoneWordsAppearAsMineBeforeTheNextWord`.

## S-2 What they say is read as theirs as they say it

A sentence sent on the call track one word at a time: each word comes
back as theirs before the next is sent. Evidence:
`callWordsAppearAsTheirsBeforeTheNextWord`.

## S-4 Live text says it is getting ready

With live text held loading, call text reads as getting ready. Evidence:
`loadingLiveTextIsReportedAsGettingReady`.

## S-5 Live text catches up from the start

30 s of distinct words sent and written while loading; on release, every one comes
back, in order, from the first. Evidence:
`thirtySecondsWhileLoadingAreReadFromTheStartInOrder`.

## S-6 Live text switched off keeps the text so far

After the switch, the earlier words stay and words sent later do not
come back. Evidence: `switchingOffKeepsEarlierTextAndAddsNoLaterWords`.

## S-7 Live text switched on fills in the call

20 s of distinct words sent and written with live text off; on the switch every one
comes back from the first, marked as written later. Evidence:
`switchingOnReadsTwentySecondsFromTheStartAsWrittenLater`.

## S-8 Failing live text is told

Live text fails; call text reads the failure, and the text so far stays.
Evidence: `liveTextFailureIsReportedAndKeepsTheTextSoFar`.

## S-9 Live text does not wait for the files

A sentence sent on the mic track while the written track is held still:
each word comes back as mine before the next is sent. Evidence:
`liveWordsArriveBeforeAnyAudioIsWritten`.
