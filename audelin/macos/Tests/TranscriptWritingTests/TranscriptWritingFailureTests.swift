import Testing
import TranscriptWriting

extension TranscriptWritingTests {

    @Test func aTranscriptThatKeepsFailingIsToldOnceUntilAWriteSucceeds() async {

        let changes = Changes()
        let denied = WriteFailure(message: "write denied")
        let full = WriteFailure(message: "out of space")
        let later = WriteFailure(message: "out of space again")
        let texts = ["first", "first\nsecond", "first\nsecond\nthird", "first\nsecond\nthird\nfourth", "fifth"]
        let run = Run(
            changes: changes, enabled: true, holds: [:],
            failures: [texts[1]: denied, texts[2]: full, texts[4]: later]
        )
        defer { run.requestStop() }
        await changes.until({ run.observed.started })
        // Reports told after each text, and the text the file keeps.
        let expected: [(reports: Int, kept: String)] = [(0, texts[0]), (1, texts[0]), (1, texts[0]), (1, texts[3]), (2, texts[3])]
        for (index, text) in texts.enumerated() {
            run.call.send(text)
            await changes.until({
                run.transcript.writes.count == index + 1 && run.report.recorded.count == expected[index].reports
                    && run.transcript.kept == expected[index].kept
            })
        }
        run.requestStop()
        await run.task.value
        #expect(run.transcript.writes == texts)
        #expect(run.observed.texts == texts)
        #expect(run.report.recorded == [denied, later])
    }

    @Test func aWriteAfterAFailedOneKeepsTheNewerText() async {

        let changes = Changes()
        let failure = WriteFailure(message: "write failed")
        let old = "first draft\nsecond draft"
        let new = "first corrected\nsecond final\nthird"
        let run = Run(changes: changes, enabled: true, holds: [:], failures: [old: failure])
        defer { run.requestStop() }
        await changes.until({ run.observed.started })
        run.call.send(old)
        await changes.until({ run.report.recorded == [failure] })
        #expect(run.transcript.kept == nil)
        run.call.send(new)
        await changes.until({ run.transcript.kept == new })
        run.requestStop()
        await run.task.value
        #expect(run.transcript.writes == [old, new])
        #expect(run.transcript.kept == new)
        #expect(run.observed.texts == [old, new])
        #expect(run.report.recorded == [failure])
    }

    @Test func theLastWriteFailingIsToldBeforeStoppingReturns() async {

        let changes = Changes()
        let reporting = Gate(changed: changes.notify)
        let failure = WriteFailure(message: "last write failed")
        let run = Run(
            changes: changes, enabled: true, holds: [:], lastText: "last text",
            failures: ["last text": failure], reportGate: reporting
        )
        defer { reporting.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.requestStop()
        await changes.until({ reporting.entered })
        #expect(!run.observed.stopped)
        #expect(run.events.recorded == [.transcriptFailed(failure)])
        reporting.open()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.events.recorded == [.transcriptFailed(failure), .stopReturned(1)])
        #expect(run.report.recorded == [failure])
        #expect(run.transcript.writes == ["last text"])
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
    }

    @Test func callTextFailingIsPassedOnWhileTheTranscriptFailsApart() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let stopping = Gate(changed: changes.notify)
        let first = CallUpdate(text: "first draft", status: .on)
        let failed = CallUpdate(text: "first final\nlast word", status: .failed("hearing failed"))
        let failure = WriteFailure(message: "held write failed")
        let call = FakeCallText<CallUpdate>(
            startGate: nil, stopGate: nil, startText: nil, lastText: nil,
            switchText: { _ in failed }, changed: changes.notify
        )
        let transcript = FakeTranscript(holds: [first: held], failures: [first: failure], changed: changes.notify)
        let events = Events()
        let report = FakeFailureReport(events: events, gate: nil, changed: changes.notify)
        let observed = Observation<CallUpdate>()
        let subject = TranscriptWriting(callText: call, transcript: transcript, failureReport: report)
        let task = Task {
            let reader = Task {
                for await update in subject.updates {
                    observed.receive(update)
                    changes.notify()
                }
            }
            await subject.start()
            observed.didStart()
            changes.notify()
            await stopping.wait()
            await subject.stop()
            observed.didStop()
            await reader.value
        }
        defer { held.open(); stopping.open() }
        await changes.until({ observed.started })
        call.send(first)
        await changes.until({ held.entered && observed.texts == [first] })
        call.send(failed)
        call.finishUpdates()
        await changes.until({ observed.texts == [first, failed] })
        #expect(transcript.writes == [first])
        #expect(transcript.kept == nil)
        #expect(report.recorded.isEmpty)
        held.open()
        await changes.until({ transcript.kept == failed && report.recorded == [failure] })
        stopping.open()
        await task.value
        #expect(observed.stopped)
        #expect(observed.texts == [first, failed])
        #expect(transcript.writes == [first, failed])
        #expect(transcript.kept == failed)
        #expect(report.recorded == [failure])
        #expect(call.recorded == [.subscribe, .start(true), .stop])
    }

    @Test func withoutATranscriptCallTextRunsAndNothingIsTold() async {

        let changes = Changes()
        let run = Run(
            changes: changes, enabled: true, holds: [:],
            startText: "while starting", lastText: "last text", hasTranscript: false
        )
        defer { run.requestStop() }
        await changes.until({ run.observed.started && run.observed.texts == ["while starting"] })
        run.setEnabled(false)
        await changes.until({ run.observed.texts == ["while starting", "live text off"] })
        run.requestStop()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.call.recorded == [.subscribe, .start(true), .switchTo(false), .stop])
        #expect(run.observed.texts == ["while starting", "live text off", "last text"])
        #expect(run.transcript.writes.isEmpty)
        #expect(run.report.recorded.isEmpty)
        #expect(run.events.recorded == [.stopReturned(1)])
    }

    @Test func aSecondStopWaitsForTheFirst() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: ["last text": held], lastText: "last text")
        defer { held.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.requestStop()
        await changes.until({ held.entered })
        let second = Observation<String>()
        let secondStop = Task {
            second.didStart()
            changes.notify()
            await run.subject.stop()
            run.events.record(.stopReturned(2))
            second.didStop()
            changes.notify()
        }
        await changes.until({ second.started })
        #expect(!run.observed.stopped)
        #expect(!second.stopped)
        #expect(run.events.recorded.isEmpty)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        held.open()
        await run.task.value
        await secondStop.value
        #expect(run.observed.stopped)
        #expect(second.stopped)
        #expect(run.events.recorded.count == 2)
        #expect(run.events.recorded.contains(.stopReturned(1)))
        #expect(run.events.recorded.contains(.stopReturned(2)))
        #expect(run.transcript.writes == ["last text"])
        #expect(run.transcript.kept == "last text")
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
    }
}

private struct CallUpdate: Hashable, Sendable {

    enum Status: Hashable, Sendable {
        case on
        case failed(String)
    }

    let text: String
    let status: Status
}
