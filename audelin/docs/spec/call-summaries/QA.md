# Optional call notes — QA

Planned tests; evidence is Missing until execution. Ordering uses handshakes, never sleeps.

## S-1 No notes without permission

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/nonoteswithoutpermission`. Setup fixture: I have not enabled call summaries; drive: a call finishes; read-back oracle: I keep the transcript without sending it to a summary provider. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-2 Choose where notes are made

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/choosewherenotesaremade`. Setup fixture: I open Settings; drive: I enable summaries and save my runtime choices; read-back oracle: I can see the primary, fallback, models, cost and transcript recipients. Edit distinct CLI primary/model and API fallback/model/recipient, save, reload and OCR each disclosure.

## S-3 Wait for the last words

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/waitforthelastwords`. Setup fixture: summaries are enabled and recognition is finishing; drive: I open the ended call; read-back oracle: I can read that notes wait for the final transcript. Hold the latest final write; inspect waiting while invocation count is zero, then release.

## S-4 See notes being made

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/seenotesbeingmade`. Setup fixture: the final transcript is ready; drive: notes begin; read-back oracle: I can read that notes are being prepared while another call can record. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-5 Read faithful notes

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readfaithfulnotes`. Setup fixture: a call has a final transcript; drive: notes finish; read-back oracle: I can read structured notes in the meeting language beside the unchanged transcript. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-6 Keep unknown speakers

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/keepunknownspeakers`. Setup fixture: speaker identification is enabled; drive: the transcript does not establish a speaker name; read-back oracle: I can read notes retaining that speaker label. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-7 Use the fallback

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/usethefallback`. Setup fixture: the primary runtime cannot complete a step; drive: the fallback completes it; read-back oracle: I can read the resulting notes. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-8 Keep a call when notes fail

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/keepacallwhennotesfail`. Setup fixture: both runtimes fail to make notes; drive: I open the call; read-back oracle: I can read the failure and still use the transcript and recording. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-9 Avoid misleading notes

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/avoidmisleadingnotes`. Setup fixture: the final transcript is empty; drive: the call finishes; read-back oracle: I can see why notes were not generated. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-10 Keep failed text separate

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/keepfailedtextseparate`. Setup fixture: transcript finalization fails; drive: the call finishes; read-back oracle: I can see notes are unavailable without losing the text already saved. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-11 Read after restarting

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readafterrestarting`. Setup fixture: notes were being requested when the app exited; drive: I reopen Audelin; read-back oracle: I can see interruption without being charged for an automatic repeat. Reload a durable running claim; inspect interruption and zero adapter invocations.

## S-12 Read after a file failure

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readafterafilefailure`. Setup fixture: notes cannot be saved; drive: I open the call; read-back oracle: I can see the save failure and still use the transcript. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-13 Read a speaker warning

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readaspeakerwarning`. Setup fixture: identification failed but notes succeeded; drive: I open the call; read-back oracle: I can read the notes and the speaker warning. Both identification attempts fail; notes return with original labels; OCR notes and speaker warning.

## S-14 Read storage failure

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readstoragefailure`. Setup fixture: initial job ownership cannot be saved; drive: I open the call; read-back oracle: I can read why notes cannot proceed and still open the transcript. Fail initial exclusive-claim creation; inspect failure and zero invocations.

## S-15 Read recovery failure

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readrecoveryfailure`. Setup fixture: a previous job record cannot be read; drive: I reopen Audelin; read-back oracle: I can read the recovery failure without an automatic generation request. Use the scenario-specific summary boundary result and inspect rendered status plus note/transcript bytes.

## S-16 Read progress saving failure

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readprogresssavingfailure`. Setup fixture: running job progress cannot be saved; drive: I open the call; read-back oracle: I can read the storage failure and still open the transcript. Fail the running-state write after a pending claim; inspect failure and zero invocations.

## S-17 Read waiting notes

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readwaitingnotes`. Setup fixture: eligible notes are durably pending and dispatch is held; drive: I open the call; read-back oracle: I can read that notes are waiting to start. Hold dispatch after successful finalization and pending persistence; OCR waiting and count zero invocations.

## S-18 Read reloaded waiting notes

Missing — planned `cd audelin/macos/App && swift test --filter SummaryPresentationTests/readreloadedwaitingnotes`. Setup fixture: a never-started pending job is loaded after restart; drive: dispatch remains held; read-back oracle: I can read that notes are waiting to start. Reload a durable pending record with dispatch held; OCR waiting and count zero invocations.
