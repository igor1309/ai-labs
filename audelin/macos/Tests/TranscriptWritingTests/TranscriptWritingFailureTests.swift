import Testing
import TranscriptWriting

extension TranscriptWritingTests {

    @Test func aTranscriptThatKeepsFailingIsToldOnceUntilAWriteSucceeds() async {

        let executor = TestExecutor()
        let denied = WriteFailure(message: "write denied")
        let full = WriteFailure(message: "out of space")
        let later = WriteFailure(message: "out of space again")
        let texts = ["first", "first\nsecond", "first\nsecond\nthird", "first\nsecond\nthird\nfourth", "fifth"]
        let run = Run(
            executor: executor, enabled: true, holds: [:],
            failures: [texts[1]: denied, texts[2]: full, texts[4]: later]
        )
        defer { run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started })
        // Reports told after each text, and the text the file keeps.
        let expected: [(reports: Int, kept: String)] = [(0, texts[0]), (1, texts[0]), (1, texts[0]), (1, texts[3]), (2, texts[3])]
        for (index, text) in texts.enumerated() {
            run.call.send(text)
            await executor.run(until: {
                run.transcript.writes.count == index + 1 && run.report.recorded.count == expected[index].reports
                    && run.transcript.kept == expected[index].kept
            })
        }
        run.requestStop()
        await executor.finish()
        await run.task.value
        #expect(run.transcript.writes == texts)
        #expect(run.observed.texts == texts)
        #expect(run.report.recorded == [denied, later])
    }

    @Test func aWriteAfterAFailedOneKeepsTheNewerText() async {

        let executor = TestExecutor()
        let failure = WriteFailure(message: "write failed")
        let old = "first draft\nsecond draft"
        let new = "first corrected\nsecond final\nthird"
        let run = Run(executor: executor, enabled: true, holds: [:], failures: [old: failure])
        defer { run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started })
        run.call.send(old)
        await executor.run(until: { run.report.recorded == [failure] })
        #expect(run.transcript.kept == nil)
        run.call.send(new)
        await executor.run(until: { run.transcript.kept == new })
        run.requestStop()
        await executor.finish()
        await run.task.value
        #expect(run.transcript.writes == [old, new])
        #expect(run.transcript.kept == new)
        #expect(run.observed.texts == [old, new])
        #expect(run.report.recorded == [failure])
    }

    @Test func theLastWriteFailingIsToldBeforeStoppingReturns() async {

        let executor = TestExecutor()
        let reporting = Gate(changed: executor.notify)
        let failure = WriteFailure(message: "last write failed")
        let run = Run(
            executor: executor, enabled: true, holds: [:], lastText: "last text",
            failures: ["last text": failure], reportGate: reporting
        )
        defer { reporting.open(); run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started })
        run.requestStop()
        await executor.run(until: { reporting.entered })
        #expect(!run.observed.stopped)
        #expect(run.events.recorded == [.transcriptFailed(failure)])
        reporting.open()
        await executor.finish()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.events.recorded == [.transcriptFailed(failure), .stopReturned(1)])
        #expect(run.report.recorded == [failure])
        #expect(run.transcript.writes == ["last text"])
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
    }

    @Test func callTextFailingIsPassedOnWhileTheTranscriptFailsApart() async {

        let executor = TestExecutor()
        let held = Gate(changed: executor.notify)
        let stopping = Gate(changed: executor.notify)
        let first = CallUpdate(text: "first draft", status: .on)
        let failed = CallUpdate(text: "first final\nlast word", status: .failed("hearing failed"))
        let failure = WriteFailure(message: "held write failed")
        let call = FakeCallText<CallUpdate>(
            startGate: nil, stopGate: nil, startText: nil, lastText: nil,
            switchText: { _ in failed }, changed: executor.notify
        )
        let transcript = FakeTranscript(holds: [first: held], failures: [first: failure], changed: executor.notify)
        let events = Events()
        let report = FakeFailureReport(events: events, gate: nil, changed: executor.notify)
        let observed = Observation<CallUpdate>()
        let subject = TranscriptWriting(callText: call, transcript: transcript, failureReport: report)
        let task = Task(executorPreference: executor) {
            let reader = Task {
                for await update in subject.updates {
                    observed.receive(update)
                    executor.notify()
                }
            }
            await subject.start()
            observed.didStart()
            executor.notify()
            await stopping.wait()
            await subject.stop()
            observed.didStop()
            await reader.value
            executor.complete()
        }
        defer { held.open(); stopping.open(); executor.run() }
        await executor.run(until: { observed.started })
        call.send(first)
        await executor.run(until: { held.entered && observed.texts == [first] })
        call.send(failed)
        call.finishUpdates()
        await executor.run(until: { observed.texts == [first, failed] })
        #expect(transcript.writes == [first])
        #expect(transcript.kept == nil)
        #expect(report.recorded.isEmpty)
        held.open()
        await executor.run(until: { transcript.kept == failed && report.recorded == [failure] })
        stopping.open()
        await executor.finish()
        await task.value
        #expect(observed.stopped)
        #expect(observed.texts == [first, failed])
        #expect(transcript.writes == [first, failed])
        #expect(transcript.kept == failed)
        #expect(report.recorded == [failure])
        #expect(call.recorded == [.subscribe, .start(true), .stop])
    }

    @Test func withoutATranscriptCallTextRunsAndNothingIsTold() async {

        let executor = TestExecutor()
        let run = Run(
            executor: executor, enabled: true, holds: [:],
            startText: "while starting", lastText: "last text", hasTranscript: false
        )
        defer { run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started && run.observed.texts == ["while starting"] })
        run.setEnabled(false)
        await executor.run(until: { run.observed.texts == ["while starting", "live text off"] })
        run.requestStop()
        await executor.finish()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.call.recorded == [.subscribe, .start(true), .switchTo(false), .stop])
        #expect(run.observed.texts == ["while starting", "live text off", "last text"])
        #expect(run.transcript.writes.isEmpty)
        #expect(run.report.recorded.isEmpty)
        #expect(run.events.recorded == [.stopReturned(1)])
    }

    @Test func aSecondStopWaitsForTheFirst() async {

        let executor = TestExecutor()
        let held = Gate(changed: executor.notify)
        let run = Run(executor: executor, enabled: true, holds: ["last text": held], lastText: "last text")
        defer { held.open(); run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started })
        run.requestStop()
        await executor.run(until: { held.entered })
        let second = Observation<String>()
        let secondStop = Task(executorPreference: executor) {
            second.didStart()
            executor.notify()
            await run.subject.stop()
            run.events.record(.stopReturned(2))
            second.didStop()
            executor.notify()
        }
        await executor.run(until: { second.started })
        #expect(!run.observed.stopped)
        #expect(!second.stopped)
        #expect(run.events.recorded.isEmpty)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        held.open()
        await executor.finish()
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
